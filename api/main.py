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




class CycleDatesIn(BaseModel):
    cycle_id:       str
    period_end:     str | None = None
    ovulation_date: str | None = None


@app.post("/api/cycles/dates")
def update_cycle_dates(data: CycleDatesIn):
    """Save period_end and/or ovulation_date for the active cycle without completing it."""
    from db.connector import update_cycle_dates as _update
    try:
        _update(
            cycle_id       = data.cycle_id,
            period_end     = _isodate(data.period_end)     if data.period_end     else None,
            ovulation_date = _isodate(data.ovulation_date) if data.ovulation_date else None,
        )
        return {"status": "updated"}
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




# ── Journal ───────────────────────────────────────────────────────────────────

class JournalIn(BaseModel):
    date:    str
    weather: str = ""
    content: str = ""

class HabitsIn(BaseModel):
    date:           str
    water_glasses:  int  = 0
    prayer_fajr:    bool = False
    prayer_zuhr:    bool = False
    prayer_asr:     bool = False
    prayer_maghrib: bool = False
    prayer_isha:    bool = False
    quran_recited:  bool = False
    todos:          list = []
    project_ideas:  list = []
    
@app.get("/api/journal/{date}")
def get_journal(date: str):
    try:
        from db.connector import get_journal_entry
    except ImportError as e:
        raise HTTPException(500, f"connector import failed: {e}")

    try:
        entry = get_journal_entry(date)
        return entry if entry else {
            "entry_date": date, "weather": "", "content": "", "last_saved": None
        }
    except Exception as e:
        err = str(e)
        if "journal_entries" in err and "does not exist" in err:
            raise HTTPException(500, "TABLE NOT FOUND: run journal_migration.sql first")
        if "get_journal_entry" in err:
            raise HTTPException(500, "FUNCTION NOT FOUND: update db/connector.py")
        if "could not connect" in err.lower() or "connection refused" in err.lower():
            raise HTTPException(500, "DB NOT CONNECTED: check DB_URL in .env")
        raise HTTPException(500, f"DB ERROR: {err}")


@app.post("/api/journal")
def save_journal(data: JournalIn):
    try:
        from db.connector import upsert_journal_entry
    except ImportError as e:
        raise HTTPException(500, f"connector import failed: {e}")

    try:
        upsert_journal_entry(data.date, data.weather, data.content)
        return {"status": "saved"}
    except Exception as e:
        err = str(e)
        if "journal_entries" in err and "does not exist" in err:
            raise HTTPException(500, "TABLE NOT FOUND: run journal_migration.sql first")
        if "upsert_journal_entry" in err:
            raise HTTPException(500, "FUNCTION NOT FOUND: update db/connector.py")
        if "could not connect" in err.lower() or "connection refused" in err.lower():
            raise HTTPException(500, "DB NOT CONNECTED: check DB_URL in .env")
        if "unique" in err.lower():
            raise HTTPException(500, f"CONSTRAINT ERROR: {err}")
        raise HTTPException(500, f"DB ERROR: {err}")



# ── Daily habits ──────────────────────────────────────────────────────────────

@app.get("/api/habits/{date}")
def get_habits(date: str):
    from db.connector import get_habits as _get
    try:
        entry = _get(date)
        return entry if entry else {
            "habit_date": date, "water_glasses": 0,
            "prayer_fajr": False, "prayer_zuhr": False, "prayer_asr": False,
            "prayer_maghrib": False, "prayer_isha": False, "quran_recited": False,
            "todos": [], "project_ideas": [], "last_saved": None,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/habits")
def save_habits(data: HabitsIn):
    from db.connector import upsert_habits
    try:
        upsert_habits(
            habit_date     = data.date,
            water_glasses  = data.water_glasses,
            prayer_fajr    = data.prayer_fajr,
            prayer_zuhr    = data.prayer_zuhr,
            prayer_asr     = data.prayer_asr,
            prayer_maghrib = data.prayer_maghrib,
            prayer_isha    = data.prayer_isha,
            quran_recited  = data.quran_recited,
            todos          = data.todos,
            project_ideas  = data.project_ideas,
        )
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── ETF investments ───────────────────────────────────────────────────────────

class ETFInvestmentIn(BaseModel):
    symbol:          str
    amount:          float
    investment_date: str
    notes:           str = ""


@app.get("/api/etf/{symbol}/investments")
def get_investments(symbol: str):
    from db.connector import get_etf_investments
    try:
        return get_etf_investments(symbol)
    except Exception as e:
        err = str(e)
        if "etf_investments" in err and "does not exist" in err:
            raise HTTPException(500, "TABLE NOT FOUND: run etf_investments_migration.sql first")
        raise HTTPException(500, err)


@app.post("/api/etf/investments")
def add_investment(data: ETFInvestmentIn):
    """
    Fetch the closing price on investment_date from Yahoo Finance,
    then persist the investment with units calculated automatically.
    """
    import requests as _req

    # Fetch price on investment date ─────────────────────────────────
    inv_dt = _isodate(data.investment_date)
    # Request a 5-day window around the date to handle weekends/holidays
    import datetime
    d_start = inv_dt - datetime.timedelta(days=4)
    d_end   = inv_dt + datetime.timedelta(days=1)

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{data.symbol}"
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    params  = {
        "period1":  int(datetime.datetime(d_start.year, d_start.month, d_start.day).timestamp()),
        "period2":  int(datetime.datetime(d_end.year,   d_end.month,   d_end.day).timestamp()),
        "interval": "1d",
    }
    try:
        resp = _req.get(url, headers=headers, params=params, timeout=12)
        resp.raise_for_status()
        result = resp.json().get("chart", {}).get("result", [])
        if not result:
            raise HTTPException(502, f"No price data returned for {data.symbol}")

        r          = result[0]
        timestamps = r.get("timestamp", [])
        closes     = r["indicators"]["quote"][0].get("close", [])

        # Find the closest trading day on or before investment_date
        best_price = None
        best_ts    = None
        import datetime as _dt
        target_ts  = int(_dt.datetime(inv_dt.year, inv_dt.month, inv_dt.day, 23, 59).timestamp())
        for ts, cl in zip(timestamps, closes):
            if cl is not None and ts <= target_ts:
                if best_ts is None or ts > best_ts:
                    best_ts    = ts
                    best_price = cl

        if best_price is None:
            raise HTTPException(422, f"No trading data found on or before {data.investment_date} for {data.symbol}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Price fetch failed: {str(e)[:200]}")

    # Persist ─────────────────────────────────────────────────────────
    from db.connector import add_etf_investment
    try:
        inv_id = add_etf_investment(
            symbol          = data.symbol,
            amount          = data.amount,
            investment_date = str(inv_dt),
            price_on_date   = round(float(best_price), 4),
            notes           = data.notes,
        )
        units = data.amount / best_price if best_price else None
        return {
            "id":             inv_id,
            "price_on_date":  round(float(best_price), 4),
            "units":          round(units, 6) if units else None,
        }
    except Exception as e:
        err = str(e)
        if "etf_investments" in err and "does not exist" in err:
            raise HTTPException(500, "TABLE NOT FOUND: run etf_investments_migration.sql first")
        raise HTTPException(500, err)


@app.delete("/api/etf/investments/{investment_id}")
def remove_investment(investment_id: str):
    from db.connector import delete_etf_investment
    try:
        delete_etf_investment(investment_id)
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── ETF data (Yahoo Finance proxy) ────────────────────────────────────────────

@app.get("/api/etf/{symbol}")
def get_etf_data(symbol: str, range: str = "1mo"):
    """
    Proxy Yahoo Finance chart data to avoid CORS.
    range: 1wk | 1mo | 1y
    Returns list of { date, close, open, high, low } dicts.
    """
    import requests as _req
    from datetime import datetime as _dt

    # Map our range names to Yahoo Finance params
    range_map = {
        "1wk": ("1wk",  "1h"),
        "1mo": ("1mo",  "1d"),
        "1y":  ("1y",   "1d"),
    }
    yf_range, interval = range_map.get(range, ("1mo", "1d"))

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
    }
    params = {
        "interval": interval,
        "range":    yf_range,
        "includePrePost": "false",
    }
    try:
        resp = _req.get(url, headers=headers, params=params, timeout=12)
        resp.raise_for_status()
        data = resp.json()

        result = data.get("chart", {}).get("result", [])
        if not result:
            err = data.get("chart", {}).get("error", {})
            raise HTTPException(502, f"Yahoo Finance: {err.get('description', 'no data')}")

        r         = result[0]
        timestamps = r.get("timestamp", [])
        closes     = r["indicators"]["quote"][0].get("close", [])
        opens      = r["indicators"]["quote"][0].get("open",  [])
        highs      = r["indicators"]["quote"][0].get("high",  [])
        lows       = r["indicators"]["quote"][0].get("low",   [])
        meta       = r.get("meta", {})

        rows = []
        for i, ts in enumerate(timestamps):
            c = closes[i] if i < len(closes) else None
            if c is None:
                continue
            rows.append({
                "date":     _dt.utcfromtimestamp(ts).strftime("%Y-%m-%d %H:%M"),
                "close":    round(float(c), 4),
                "open":     round(float(opens[i]),  4) if i < len(opens)  and opens[i]  else None,
                "high":     round(float(highs[i]),  4) if i < len(highs)  and highs[i]  else None,
                "low":      round(float(lows[i]),   4) if i < len(lows)   and lows[i]   else None,
            })

        return {
            "symbol":    symbol,
            "shortName": meta.get("shortName", symbol),
            "currency":  meta.get("currency", ""),
            "exchange":  meta.get("exchangeName", ""),
            "range":     range,
            "data":      rows,
            "current":   round(float(meta.get("regularMarketPrice", 0)), 4),
            "prev_close":round(float(meta.get("previousClose",      0)), 4),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"ETF fetch failed for {symbol}: {str(e)[:200]}")




# ── Static file serving (production build) ────────────────────────────────────

DIST = ROOT / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")

    @app.get("/")
    def serve_root():
        return FileResponse(str(DIST / "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Never intercept API routes — let FastAPI handle them
        if full_path.startswith("api/"):
            raise HTTPException(404, "API route not found")
        target = DIST / full_path
        if target.exists() and target.is_file():
            return FileResponse(str(target))
        return FileResponse(str(DIST / "index.html"))