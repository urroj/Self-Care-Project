"""
api/main.py — FastAPI backend for cycle.tracker.

Routes
------
GET  /api/status              pipeline phase + next-period estimate
GET  /api/cycles              all cycles (completed + active)
GET  /api/cycles/active       the current incomplete cycle
POST /api/cycles/start        open a new cycle
POST /api/cycles/complete     close cycle, run model update, return new prediction
GET  /api/logs                all daily logs (joined with cycle number)
POST /api/logs                insert one daily log row
GET  /api/predictions         stored model_run rows
POST /api/predict             run pipeline.predict_next_cycle() and store result
GET  /api/insights            aggregated data for Insights charts

Production: FastAPI serves the Vite build from frontend/dist/
Development: Vite dev server (port 5173) proxies /api → FastAPI (port 8000)
"""

from __future__ import annotations

import sys
import threading
from datetime import date
from pathlib import Path
from typing import Any

# ── ensure project root is on sys.path when run directly ────────────────────
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="cycle.tracker", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic request schemas ─────────────────────────────────────────────────

class DailyLogIn(BaseModel):
    cycle_id: str
    log_date: str
    day_of_cycle: int = 1
    flow_intensity: int | None = None
    mucus_type: str | None = None
    moods: list[str] = []
    symptom_cramps: bool = False
    symptom_bloating: bool = False
    symptom_breast_tender: bool = False
    symptom_headache: bool = False
    symptom_acne: bool = False
    symptom_back_pain: bool = False
    symptom_nausea: bool = False
    symptom_fatigue: bool = False
    symptom_ovulation_pain: bool = False
    sleep_hours: float | None = None
    sleep_quality: int | None = None
    stress_level: int | None = None
    weight_kg: float | None = None
    exercise_mins: int | None = None


class StartCycleIn(BaseModel):
    start_date: str
    period_start: str
    period_end: str | None = None
    notes: str | None = None


class CompleteCycleIn(BaseModel):
    cycle_id: str
    end_date: str


# ── Utility ──────────────────────────────────────────────────────────────────

def _isodate(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise HTTPException(400, f"Invalid date format: {s!r} — expected YYYY-MM-DD")


def _safe(fn, fallback=None):
    """Call fn(); return fallback on any exception (DB not ready etc.)."""
    try:
        return fn()
    except Exception as exc:
        return fallback


# ══════════════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════════════

# ── Status ───────────────────────────────────────────────────────────────────

@app.get("/api/status")
def get_status():
    from config import PHASE_COLD_START, PHASE_LSTM
    from pipeline import resolve_phase

    n = _safe(lambda: __import__("db.connector", fromlist=["count_completed_cycles"])
              .count_completed_cycles(), 0)
    phase = resolve_phase(n)

    # Try to get the latest prediction for next-period date
    runs = _safe(
        lambda: __import__("db.connector", fromlist=["get_model_runs"])
                .get_model_runs(limit=1),
        []
    )
    next_period = None
    if runs:
        p = runs[0].get("predictions", {})
        next_period = p.get("next_period_start_est")

    return {
        "personal_cycles":    n,
        "model_phase":        phase,
        "bayesian_threshold": PHASE_COLD_START,
        "lstm_threshold":     PHASE_LSTM,
        "next_period_est":    next_period,
    }


# ── Cycles ───────────────────────────────────────────────────────────────────

@app.get("/api/cycles")
def get_cycles():
    from db.connector import get_completed_cycles, get_all_cycles_raw
    try:
        return {
            "completed": get_completed_cycles(),
            "all":       get_all_cycles_raw(),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/cycles/active")
def get_active_cycle():
    from db.connector import get_active_cycle
    try:
        return get_active_cycle()       # None if no active cycle
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/cycles/start")
def start_cycle(data: StartCycleIn):
    from db.connector import insert_cycle, count_completed_cycles
    try:
        n = count_completed_cycles()
        cycle_id = insert_cycle(
            cycle_number  = n + 1,
            start_date    = _isodate(data.start_date),
            period_start  = _isodate(data.period_start),
            period_end    = _isodate(data.period_end) if data.period_end else None,
            notes         = data.notes,
            is_complete   = False,
        )
        return {"cycle_id": str(cycle_id), "cycle_number": n + 1, "status": "started"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/cycles/complete")
def complete_cycle_endpoint(data: CompleteCycleIn):
    """
    Mark cycle complete → run Bayesian update → run prediction → return result.
    The model update is fast (conjugate update, no neural net) so we do it
    synchronously. If PyTorch LSTM is installed and at Phase 3, fine-tuning
    happens in a background thread to avoid blocking the response.
    """
    from db.connector import complete_cycle, count_completed_cycles
    from pipeline import predict_next_cycle, resolve_phase

    try:
        complete_cycle(
            cycle_id = data.cycle_id,
            end_date = _isodate(data.end_date),
        )
    except Exception as e:
        raise HTTPException(500, f"DB error marking cycle complete: {e}")

    # Bayesian update (fast, synchronous)
    try:
        from db.connector import get_last_n_cycle_lengths
        from models.base_model import PopulationPrior, BayesianPersonalModel
        prior  = PopulationPrior.load()
        bayes  = BayesianPersonalModel.load(prior)
        bayes.update(get_last_n_cycle_lengths(20))
        bayes.save()
    except Exception as e:
        pass  # don't block if model files not yet initialised

    # LSTM fine-tune in background (Phase 3 only)
    n = _safe(count_completed_cycles, 0)
    if resolve_phase(n) == "lstm":
        threading.Thread(target=_finetune_lstm, daemon=True).start()

    # Generate and store new prediction
    try:
        prediction = predict_next_cycle(use_db=True)
        return {"status": "complete", "prediction": prediction}
    except Exception as e:
        return {"status": "complete", "prediction": None, "warning": str(e)}


def _finetune_lstm():
    try:
        from pipeline import update_with_new_cycle
        update_with_new_cycle()
    except Exception:
        pass


# ── Daily logs ────────────────────────────────────────────────────────────────

@app.get("/api/logs")
def get_logs(limit: int = Query(300, le=1000)):
    from db.connector import get_all_logs_with_cycle
    try:
        return get_all_logs_with_cycle(limit=limit)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/logs")
def save_log(data: DailyLogIn):
    from db.connector import insert_daily_log
    try:
        insert_daily_log(
            cycle_id               = data.cycle_id,
            log_date               = _isodate(data.log_date),
            day_of_cycle           = data.day_of_cycle,
            flow_intensity         = data.flow_intensity,
            mucus_type             = data.mucus_type,
            moods                  = data.moods or None,
            symptom_cramps         = data.symptom_cramps,
            symptom_bloating       = data.symptom_bloating,
            symptom_breast_tender  = data.symptom_breast_tender,
            symptom_headache       = data.symptom_headache,
            symptom_acne           = data.symptom_acne,
            symptom_back_pain      = data.symptom_back_pain,
            symptom_nausea         = data.symptom_nausea,
            symptom_fatigue        = data.symptom_fatigue,
            symptom_ovulation_pain = data.symptom_ovulation_pain,
            sleep_hours            = data.sleep_hours,
            sleep_quality          = data.sleep_quality,
            stress_level           = data.stress_level,
            weight_kg              = data.weight_kg,
            exercise_mins          = data.exercise_mins,
        )
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Predictions ───────────────────────────────────────────────────────────────

@app.get("/api/predictions")
def get_predictions():
    from db.connector import get_model_runs
    try:
        return get_model_runs(limit=30)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/predict")
def run_prediction(day: int = Query(1)):
    from pipeline import predict_next_cycle
    try:
        return predict_next_cycle(day_of_current_cycle=day, use_db=True)
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Insights ──────────────────────────────────────────────────────────────────

@app.get("/api/insights")
def get_insights():
    from db.connector import get_insights_data
    try:
        return get_insights_data()
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Static file serving (production build) ────────────────────────────────────

DIST = ROOT / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")

    @app.get("/")
    def serve_root():
        return FileResponse(str(DIST / "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        target = DIST / full_path
        if target.exists() and target.is_file():
            return FileResponse(str(target))
        return FileResponse(str(DIST / "index.html"))
