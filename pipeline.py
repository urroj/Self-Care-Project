"""
pipeline.py — Main orchestrator for the period tracker ML pipeline.

Usage
-----
# First-time setup (trains on public data):
    python pipeline.py --setup

# Predict next cycle (from personal DB):
    python pipeline.py --predict

# After new cycle completes — update the model with new data:
    python pipeline.py --update --cycle-number 4

# Check which model phase is active:
    python pipeline.py --status

Pipeline phases
---------------
Phase 1 — cold_start   (<  3 personal cycles)  → Population prior (NB regression)
Phase 2 — bayesian      (3–7 personal cycles)  → Bayesian Gamma-Poisson update
Phase 3 — lstm          (8+ personal cycles)   → Fine-tuned LSTM + MC Dropout
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, timedelta
from pathlib import Path

# ── Path bootstrap ─────────────────────────────────────────────────────────────
# Ensures `data`, `models`, and `db` packages are importable regardless of
# the working directory the user runs the script from.
_PROJECT_ROOT = Path(__file__).resolve().parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
# ──────────────────────────────────────────────────────────────────────────────

import numpy as np

from config import PHASE_COLD_START, PHASE_BAYESIAN, PHASE_LSTM, LSTM_LOOKBACK
from data.loaders import load_all_public, irregular_subset
from data.preprocessor import (
    build_cycle_features, build_sequences,
    fit_scaler, load_scaler, apply_scaler, personal_db_to_features,
)
from models.base_model import PopulationPrior, BayesianPersonalModel, predict_current_phase

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pipeline")


# ══════════════════════════════════════════════════════════════════════════════
# Phase resolver
# ══════════════════════════════════════════════════════════════════════════════

def resolve_phase(n_personal: int) -> str:
    if n_personal < PHASE_COLD_START:
        return "cold_start"
    if n_personal < PHASE_LSTM:
        return "bayesian"
    return "lstm"


# ══════════════════════════════════════════════════════════════════════════════
# Setup — run once to train on public data
# ══════════════════════════════════════════════════════════════════════════════

def _make_synthetic_population(n_subjects: int = 120, seed: int = 0):
    """
    Generate a synthetic population of irregular-cycle subjects.
    Used as a guaranteed fallback when all external datasets are unavailable
    (blocked URLs, missing CSV files, no internet connection).
    The distribution is calibrated to match published statistics for
    irregular-cycle populations (mean 28-45 d, SD 5-14 d).
    """
    import pandas as pd
    rng = np.random.default_rng(seed)
    records = []
    for subj_i in range(n_subjects):
        personal_mean = float(rng.uniform(28, 45))
        personal_std  = float(rng.uniform(5, 13))
        n_cycles      = int(rng.integers(6, 16))
        age           = float(rng.uniform(20, 42))
        bmi           = float(rng.uniform(18.5, 32))
        for ci in range(n_cycles):
            length = float(np.clip(rng.normal(personal_mean, personal_std), 21, 60))
            records.append({
                "subject_id":     f"synth_{subj_i:04d}",
                "cycle_number":   ci + 1,
                "cycle_length":   round(length),
                "period_duration":int(rng.integers(3, 8)),
                "ovulation_day":  max(10, round(length - 14)),
                "luteal_length":  int(rng.integers(11, 17)),
                "age":            age,
                "bmi":            bmi,
                "avg_flow":       round(float(rng.uniform(1.0, 4.0)), 1),
                "avg_stress":     round(float(rng.uniform(1.0, 3.0)), 1),
                "avg_sleep":      round(float(rng.uniform(5.5, 8.5)), 1),
                "irregular_flag": personal_std > 7,
                "source":         "synthetic_population",
            })
    return pd.DataFrame(records)


def setup_pipeline() -> None:
    """
    Download/load public datasets, train population prior, pre-train LSTM.
    Automatically falls back to a synthetic population prior if no local
    dataset files are found in data/raw/.
    """
    log.info("SETUP: building population prior from public data")

    # 1. Try to load real public data; fall back to synthetic if unavailable
    irr = None
    try:
        pub = load_all_public()
        irr = irregular_subset(pub)
    except Exception as exc:
        log.warning("Public data load failed (%s). Using synthetic fallback.", exc)

    if irr is None or len(irr) < 10:
        log.warning(
            "Not enough real public data (%d rows). "
            "Using synthetic population fallback calibrated to irregular-cycle statistics. "
            "To improve the prior, place real CSVs in data/raw/ (see README).",
            0 if irr is None else len(irr),
        )
        irr = _make_synthetic_population()

    source_label = irr["source"].iloc[0] if "source" in irr.columns else "mixed"
    log.info("Population data: %d cycles, %d subjects, source=%s.",
             len(irr), irr["subject_id"].nunique(), source_label)

    # 2. Build feature matrix
    feats = build_cycle_features(irr)
    feats = feats.dropna(subset=["next_cycle_length", "mean_length"]).reset_index(drop=True)
    log.info("Feature matrix: %d rows x %d columns.", len(feats), len(feats.columns))

    # 3. Fit and save population prior
    prior = PopulationPrior()
    prior.fit(feats)
    prior.save()
    log.info("Population prior saved.")

    # 4. Fit feature scaler on numeric columns
    num_cols = ["mean_length", "std_length", "mean_last3", "std_last3",
                "trend", "current_length", "period_duration"]
    avail = [c for c in num_cols if c in feats.columns]
    fit_scaler(feats, avail)
    log.info("Feature scaler fitted and saved.")

    # 5. Pre-train LSTM on public sequences (if enough data)
    try:
        from models.lstm_model import LSTMTrainer
        X, y, feature_cols = build_sequences(feats, lookback=LSTM_LOOKBACK)
        if len(X) >= 50:
            trainer = LSTMTrainer(input_size=X.shape[2])
            trainer.pretrain(X, y)
            trainer.save_meta(feature_cols)
            log.info("LSTM pre-trained on %d public sequences.", len(X))
        else:
            log.warning("Too few public sequences (%d) for LSTM pre-training.", len(X))
    except ImportError:
        log.warning("PyTorch not installed — LSTM pre-training skipped.")

    log.info("SETUP COMPLETE")
    print("\n  Pipeline ready. Run --predict to generate your first forecast.\n")



# ══════════════════════════════════════════════════════════════════════════════
# Predict — main inference call
# ══════════════════════════════════════════════════════════════════════════════

def predict_next_cycle(
    personal_cycles: list[dict] | None = None,
    day_of_current_cycle: int | None = None,
    use_db: bool = True,
) -> dict:
    """
    Generate a full prediction for the next cycle.

    Parameters
    ----------
    personal_cycles : list of cycle summary dicts from the DB view.
                      If None and use_db=True, fetched from PostgreSQL.
    day_of_current_cycle : today's cycle day (to predict current phase).
    use_db : whether to read personal data from PostgreSQL.

    Returns
    -------
    Full prediction dict.
    """
    # ── Load personal data ──────────────────────────────────────────────────
    if use_db:
        from db.connector import get_completed_cycles, count_completed_cycles, save_model_run
        n_personal = count_completed_cycles()
        cycles     = get_completed_cycles()
    else:
        cycles     = personal_cycles or []
        n_personal = len(cycles)

    phase = resolve_phase(n_personal)
    log.info("Phase: %s (%d personal cycles logged)", phase, n_personal)

    personal_lengths = [float(c["cycle_length"]) for c in cycles if c.get("cycle_length")]
    personal_mean    = float(np.mean(personal_lengths)) if personal_lengths else 35.0
    personal_std     = float(np.std(personal_lengths))  if len(personal_lengths) >= 2 else 7.0

    prior = PopulationPrior.load()

    # ── Phase 1: cold start ──────────────────────────────────────────────────
    if phase == "cold_start":
        result = prior.predict_distribution(
            mean_length=personal_mean,
            std_length=personal_std,
            covariates={"mean_length": personal_mean, "std_length": personal_std},
        )
        result["phase_label"] = "cold_start"
        result["confidence"]  = "low — fewer than 3 personal cycles logged"

    # ── Phase 2: Bayesian personalisation ────────────────────────────────────
    elif phase == "bayesian":
        bayes = BayesianPersonalModel.load(prior)
        bayes.update(personal_lengths)
        bayes.save()
        result = bayes.predict_distribution(
            covariates={"mean_length": personal_mean, "std_length": personal_std}
        )
        result["phase_label"] = "bayesian"
        result["confidence"]  = (
            f"medium — {n_personal} personal cycles logged, "
            f"model weighted {result['personal_weight']*100:.0f}% personal"
        )

    # ── Phase 3: LSTM ─────────────────────────────────────────────────────────
    else:
        result = _predict_lstm(cycles, personal_mean, personal_std, prior)
        result["phase_label"] = "lstm"
        result["confidence"]  = (
            f"high — {n_personal} personal cycles, personalised LSTM"
        )

    # ── Shared outputs ────────────────────────────────────────────────────────
    next_len = result["point_estimate"]
    today    = date.today()

    # Estimated next period start
    if personal_lengths:
        last_cycle_start = cycles[-1].get("start_date") or cycles[-1].get("period_start")
        if isinstance(last_cycle_start, str):
            from datetime import datetime
            last_cycle_start = datetime.strptime(last_cycle_start, "%Y-%m-%d").date()
        if last_cycle_start:
            next_period_est  = last_cycle_start + timedelta(days=int(next_len))
        else:
            next_period_est  = today + timedelta(days=int(next_len))
    else:
        next_period_est  = today + timedelta(days=int(next_len))

    # Ovulation and fertile window
    est_luteal    = 14  # days before next period
    est_ovulation = next_period_est - timedelta(days=est_luteal)
    fertile_start = est_ovulation - timedelta(days=5)
    fertile_end   = est_ovulation

    result.update({
        "n_personal_cycles":     n_personal,
        "personal_mean_length":  round(personal_mean, 1),
        "personal_std_length":   round(personal_std, 1),
        "next_cycle_length_est": next_len,
        "next_period_start_est": next_period_est.isoformat(),
        "ovulation_date_est":    est_ovulation.isoformat(),
        "fertile_window_start":  fertile_start.isoformat(),
        "fertile_window_end":    fertile_end.isoformat(),
        "generated_on":          today.isoformat(),
    })

    # Current phase (if caller supplies day of cycle)
    if day_of_current_cycle is not None:
        result["current_phase"] = predict_current_phase(
            day_of_current_cycle, {}, mean_length=personal_mean
        )

    # Audit log to DB
    if use_db:
        try:
            save_model_run(
                model_phase=phase,
                personal_cycles=n_personal,
                predictions=result,
            )
            log.info("Prediction saved to model_runs table.")
        except Exception as e:
            log.error(
                "Could not save to model_runs table: %s\n"
                "  Make sure the DB is running and schema has been applied:\n"
                "  psql -d period_tracker -f db/schema.sql", e
            )

    return result


def _predict_lstm(
    cycles: list[dict],
    personal_mean: float,
    personal_std: float,
    prior: PopulationPrior,
) -> dict:
    """Run Phase 3 LSTM inference with MC Dropout."""
    try:
        from models.lstm_model import LSTMTrainer
        loaded = LSTMTrainer.load(personal=True)
        if loaded is None:
            raise FileNotFoundError("No LSTM checkpoint found.")
        trainer, feature_cols = loaded

        # Build personal features for inference
        feats = personal_db_to_features(cycles)
        if len(feats) < LSTM_LOOKBACK:
            raise ValueError(f"Need ≥ {LSTM_LOOKBACK} cycles for LSTM; have {len(feats)}.")

        scaler = load_scaler()
        X_raw  = feats.tail(LSTM_LOOKBACK)[feature_cols].fillna(0).values
        if scaler:
            X_scaled = scaler.transform(X_raw)
        else:
            X_scaled = X_raw

        return trainer.predict(X_scaled)

    except Exception as e:
        log.warning("LSTM inference failed (%s). Falling back to Bayesian.", e)
        bayes = BayesianPersonalModel.load(prior)
        return bayes.predict_distribution(
            covariates={"mean_length": personal_mean, "std_length": personal_std}
        )


# ══════════════════════════════════════════════════════════════════════════════
# Online update — called each month when a cycle completes
# ══════════════════════════════════════════════════════════════════════════════

def update_with_new_cycle(cycle_number: int | None = None) -> None:
    """
    Triggered when a new cycle is marked complete in the DB.
    1. Fetch the newly completed cycle's data.
    2. Update Bayesian state (always).
    3. If in Phase 3: fine-tune LSTM on all personal sequences.
    """
    from db.connector import get_completed_cycles, count_completed_cycles

    n_personal = count_completed_cycles()
    cycles     = get_completed_cycles()
    phase      = resolve_phase(n_personal)
    lengths    = [float(c["cycle_length"]) for c in cycles if c.get("cycle_length")]

    log.info("═══ UPDATE — cycle %s complete, now %d total (%s phase) ═══",
             cycle_number or "latest", n_personal, phase)

    # Always keep Bayesian state current
    prior = PopulationPrior.load()
    bayes = BayesianPersonalModel.load(prior)
    bayes.update(lengths)
    bayes.save()
    log.info("Bayesian state updated. Posterior mean: %.1f days", bayes.alpha / bayes.beta)

    # Phase 3: re-fine-tune LSTM
    if phase == "lstm":
        try:
            from models.lstm_model import LSTMTrainer
            feats = personal_db_to_features(cycles)
            X, y, feature_cols = build_sequences(feats, lookback=LSTM_LOOKBACK)
            if len(X) >= 2:
                loaded  = LSTMTrainer.load(personal=False)  # start from pre-trained
                if loaded:
                    trainer, _ = loaded
                    trainer.finetune(X, y)
                    trainer.save_meta(feature_cols)
                    log.info("LSTM fine-tuned on %d personal sequences.", len(X))
        except Exception as e:
            log.warning("LSTM fine-tune skipped: %s", e)

    log.info("═══ UPDATE COMPLETE ═══")
    print(f"\n✓ Model updated with cycle {cycle_number or 'latest'}. "
          f"Run --predict for new forecast.\n")


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

def _print_prediction(pred: dict) -> None:
    print("\n" + "═" * 55)
    print("  CYCLE PREDICTION REPORT")
    print("═" * 55)
    print(f"  Model phase        : {pred['phase_label'].upper()}")
    print(f"  Confidence         : {pred['confidence']}")
    print(f"  Personal cycles    : {pred['n_personal_cycles']}")
    print(f"  Personal mean      : {pred['personal_mean_length']} days")
    print(f"  Personal std       : {pred['personal_std_length']} days")
    print("─" * 55)
    print(f"  Next cycle length  : {pred['point_estimate']} days")
    print(f"  80% CI             : [{pred.get('ci_lower_80', pred['ci_lower'])} – {pred.get('ci_upper_80', pred['ci_upper'])}] days")
    print(f"  Next period start  : {pred['next_period_start_est']}")
    print(f"  Estimated ovulation: {pred['ovulation_date_est']}")
    print(f"  Fertile window     : {pred['fertile_window_start']} → {pred['fertile_window_end']}")
    if "current_phase" in pred:
        cp = pred["current_phase"]
        print(f"  Current phase      : {cp['phase'].upper()} (day {cp['day_of_cycle']})")
    print("═" * 55 + "\n")


def _show_results(limit: int = 10) -> None:
    """Query model_runs and print a human-readable table of past predictions."""
    try:
        from db.connector import get_model_runs
        rows = get_model_runs(limit=limit)
    except Exception as e:
        print(
            f"\n  Cannot read from DB: {e}"
            "\n  Make sure PostgreSQL is running and the schema has been applied:"
            "\n    psql -d period_tracker -f db/schema.sql"
            "\n  Then run --predict to generate and store your first prediction.\n"
        )
        return

    if not rows:
        print("\n  No predictions stored yet. Run --predict first.\n")
        return

    w = 55
    print("\n" + "=" * w)
    print(f"  STORED PREDICTIONS  (last {len(rows)})")
    print("=" * w)

    for r in rows:
        p   = r.get("predictions", {})
        ts  = str(r.get("run_date", ""))[:16].replace("T", " ")
        phase = r.get("model_phase", "?").upper()

        print(f"\n  Run          : {ts}  [{phase}]")
        print(f"  Personal cycles : {r.get('personal_cycles', '?')}")
        print("-" * w)

        # Core prediction fields — present in all phases
        if "point_estimate" in p:
            ci_lo = p.get("ci_lower_80", p.get("ci_lower", "?"))
            ci_hi = p.get("ci_upper_80", p.get("ci_upper", "?"))
            print(f"  Next cycle length   : {p['point_estimate']} days  (80% CI {ci_lo}–{ci_hi})")
        if "next_period_start_est" in p:
            print(f"  Next period start   : {p['next_period_start_est']}")
        if "ovulation_date_est" in p:
            print(f"  Estimated ovulation : {p['ovulation_date_est']}")
        if "fertile_window_start" in p:
            print(f"  Fertile window      : {p['fertile_window_start']}  to  {p['fertile_window_end']}")
        if "personal_mean_length" in p:
            print(f"  Personal mean       : {p['personal_mean_length']} days  (std {p.get('personal_std_length', '?')})")
        if "confidence" in p:
            print(f"  Confidence          : {p['confidence']}")
        if "current_phase" in p:
            cp = p["current_phase"]
            print(f"  Phase at prediction : {cp.get('phase','?').upper()}  day {cp.get('day_of_cycle','?')}")

    print("\n" + "=" * w + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Period Tracker ML Pipeline")
    parser.add_argument("--setup",        action="store_true", help="First-time setup from public data")
    parser.add_argument("--predict",      action="store_true", help="Predict next cycle")
    parser.add_argument("--update",       action="store_true", help="Update model with latest completed cycle")
    parser.add_argument("--status",       action="store_true", help="Show current pipeline status")
    parser.add_argument("--results",      action="store_true", help="Show stored prediction history from DB")
    parser.add_argument("--limit",        type=int, default=10, help="Number of results to show (default 10)")
    parser.add_argument("--cycle-number", type=int,            help="Cycle number for --update")
    parser.add_argument("--day",          type=int,            help="Today's day of cycle for phase info")
    parser.add_argument("--no-db",        action="store_true", help="Run without PostgreSQL (demo mode)")
    args = parser.parse_args()

    if args.setup:
        setup_pipeline()

    elif args.predict:
        pred = predict_next_cycle(
            day_of_current_cycle=args.day,
            use_db=not args.no_db,
        )
        _print_prediction(pred)

    elif args.results:
        _show_results(limit=args.limit)

    elif args.update:
        update_with_new_cycle(cycle_number=args.cycle_number)

    elif args.status:
        try:
            from db.connector import count_completed_cycles
            n = count_completed_cycles()
        except Exception:
            n = 0
        phase = resolve_phase(n)
        print(f"\nPersonal cycles: {n} | Active phase: {phase.upper()}\n")
        if n < PHASE_COLD_START:
            remaining = PHASE_COLD_START - n
            print(f"Log {remaining} more cycle(s) to unlock Bayesian personalisation.")
        elif n < PHASE_LSTM:
            remaining = PHASE_LSTM - n
            print(f"Log {remaining} more cycle(s) to unlock LSTM fine-tuning.")
        else:
            print("LSTM personalisation active. Model improves with each new cycle.")
        print()

    else:
        parser.print_help()


if __name__ == "__main__":
    main()