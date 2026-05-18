"""
demo.py — Run the pipeline end-to-end without PostgreSQL.

Simulates 2, 5, and 10 personal cycles to show how the model evolves
through all three phases. Uses the population prior built from public data.

Run:
    python demo.py
"""

import json
import logging
import sys
import numpy as np
from datetime import date, timedelta

logging.basicConfig(level=logging.WARNING)   # quiet for demo

# ── Simulate personal cycle history ──────────────────────────────────────────

RNG = np.random.default_rng(42)

def simulate_cycles(n: int, mean: float = 35.0, std: float = 5.5) -> list[dict]:
    """
    Simulate n completed cycles for a person with a 35-day irregular cycle.
    Returns list of dicts matching the cycle_summaries view schema.
    """
    cycles = []
    start  = date(2024, 1, 1)
    for i in range(n):
        length = max(21, min(60, int(RNG.normal(mean, std))))
        end    = start + timedelta(days=length)
        cycles.append({
            "cycle_number":   i + 1,
            "start_date":     start,
            "end_date":       end,
            "cycle_length":   length,
            "period_duration": int(RNG.integers(4, 8)),
            "avg_flow":       round(float(RNG.uniform(1.5, 3.5)), 1),
            "avg_stress":     round(float(RNG.uniform(1.2, 2.8)), 1),
            "avg_sleep":      round(float(RNG.uniform(6.0, 8.5)), 1),
            "logged_days":    length,
        })
        start = end
    return cycles


# ── Population prior (from public data) ──────────────────────────────────────

def build_demo_prior() -> "PopulationPrior":
    """
    Build a lightweight prior from synthetic public-data-like distributions
    (used when actual public CSVs are not available in demo mode).
    """
    import pandas as pd
    from models.base_model import PopulationPrior
    from data.preprocessor import build_cycle_features

    # Synthesise 400 irregular-cycle subjects from public data priors
    rng2 = np.random.default_rng(0)
    records = []
    for subj in range(80):
        personal_mean = rng2.uniform(28, 45)
        personal_std  = rng2.uniform(5, 12)
        n_cycles      = rng2.integers(6, 15)
        for ci in range(n_cycles):
            records.append({
                "subject_id":     f"pub_{subj:03d}",
                "cycle_number":   ci + 1,
                "cycle_length":   max(21, min(60, rng2.normal(personal_mean, personal_std))),
                "period_duration":rng2.integers(3, 8),
                "age":            rng2.uniform(22, 42),
                "bmi":            rng2.uniform(19, 30),
            })

    df = pd.DataFrame(records)
    feats = build_cycle_features(df).dropna(subset=["next_cycle_length", "mean_length"])

    prior = PopulationPrior()
    prior.fit(feats)
    return prior


# ── Main demo ─────────────────────────────────────────────────────────────────

def run_demo() -> None:
    from models.base_model import BayesianPersonalModel, predict_current_phase
    from pipeline import resolve_phase
    import config; config.MODEL_DIR.mkdir(parents=True, exist_ok=True)

    print("\n" + "═"*58)
    print("  PERIOD TRACKER ML PIPELINE — DEMO (no DB required)")
    print("  Irregular cycle: mean=35d, std=5.5d")
    print("═"*58)

    prior = build_demo_prior()
    prior.save()

    for n_cycles in [1, 3, 6, 10]:
        cycles  = simulate_cycles(n_cycles)
        lengths = [c["cycle_length"] for c in cycles]
        p_mean  = float(np.mean(lengths))
        p_std   = float(np.std(lengths)) if len(lengths) > 1 else 7.0
        phase   = resolve_phase(n_cycles)

        print(f"\n{'─'*58}")
        print(f"  After {n_cycles} cycle(s)  →  Phase: {phase.upper()}")
        print(f"  Personal history: {lengths}")
        print(f"  Mean={p_mean:.1f}d  Std={p_std:.1f}d")

        if phase == "cold_start":
            result = prior.predict_distribution(
                mean_length=p_mean, std_length=p_std,
                covariates={"mean_length": p_mean, "std_length": p_std},
            )
            result["n_personal"] = n_cycles

        elif phase == "bayesian":
            bayes = BayesianPersonalModel(prior)
            bayes.update(lengths)
            result = bayes.predict_distribution(
                covariates={"mean_length": p_mean, "std_length": p_std}
            )

        else:  # lstm — show Bayesian since LSTM needs real training
            bayes = BayesianPersonalModel(prior)
            bayes.update(lengths)
            result = bayes.predict_distribution(
                covariates={"mean_length": p_mean, "std_length": p_std}
            )
            result["source"] = "bayesian→lstm_ready"

        # Compute calendar dates
        last_start  = cycles[-1]["end_date"]
        next_period = last_start + timedelta(days=int(result["point_estimate"]))
        ovul_date   = next_period - timedelta(days=14)
        fert_start  = ovul_date  - timedelta(days=5)

        print(f"\n  Prediction:")
        print(f"    Next cycle length : {result['point_estimate']} days")
        print(f"    80% CI            : [{result['ci_lower']} – {result['ci_upper']}] days")
        print(f"    Std               : {result['std']} days")
        print(f"    Next period ~     : {next_period.isoformat()}")
        print(f"    Fertile window    : {fert_start.isoformat()} → {ovul_date.isoformat()}")
        print(f"    Model source      : {result['source']}")

        # Show current phase (assume day 5 of cycle)
        phase_info = predict_current_phase(5, {}, mean_length=p_mean)
        print(f"    Current phase     : {phase_info['phase'].upper()} (day 5)")
        print(f"    Est. ovulation    : day {phase_info['est_ovulation']} of cycle")

    print(f"\n{'═'*58}")
    print("  NEXT STEPS:")
    print("  1. Set up PostgreSQL:  psql -d period_tracker -f db/schema.sql")
    print("  2. First-time setup:   python pipeline.py --setup")
    print("  3. Start logging:      from db.connector import insert_daily_log")
    print("  4. Predict:            python pipeline.py --predict --day <N>")
    print("  5. Monthly update:     python pipeline.py --update --cycle-number <N>")
    print(f"{'═'*58}\n")


if __name__ == "__main__":
    # Minimal path fix so imports work from project root
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
    run_demo()
