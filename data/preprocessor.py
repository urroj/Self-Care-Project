"""
data/preprocessor.py — Feature engineering for the period tracker pipeline.

Converts raw cycle records (from public datasets or personal PostgreSQL)
into feature matrices ready for each model phase.

Key design: all features are computed from COMPLETED past cycles only.
The goal is to predict the NEXT cycle length from what you already know.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
import joblib
from pathlib import Path
from config import MODEL_DIR, LUTEAL_PHASE_MEAN, LUTEAL_PHASE_STD


# ── 1. Per-cycle aggregate features ──────────────────────────────────────────

def build_cycle_features(cycles_df: pd.DataFrame) -> pd.DataFrame:
    """
    Input : DataFrame where each row is one completed cycle.
            Required columns: subject_id, cycle_number, cycle_length
            Optional (fill with NaN if absent): period_duration, ovulation_day,
            luteal_length, age, bmi, avg_flow, avg_stress, avg_sleep

    Output: DataFrame with one row per (subject, cycle), all features computed
            from that cycle's history UP TO AND INCLUDING that cycle.
            The target column 'next_cycle_length' is the length of the NEXT cycle.
    """
    df = cycles_df.copy().sort_values(["subject_id", "cycle_number"])
    rows = []

    for subj, grp in df.groupby("subject_id"):
        grp = grp.reset_index(drop=True)
        lengths = grp["cycle_length"].tolist()

        for i in range(len(lengths) - 1):
            past = lengths[: i + 1]
            row = _history_stats(past)

            # Static per-person features
            row["subject_id"]   = subj
            row["cycle_number"] = grp.loc[i, "cycle_number"]

            # Current cycle direct measurements
            row["period_duration"]  = grp.loc[i, "period_duration"]  if "period_duration"  in grp else np.nan
            row["ovulation_day"]    = grp.loc[i, "ovulation_day"]    if "ovulation_day"    in grp else np.nan
            row["luteal_length"]    = grp.loc[i, "luteal_length"]    if "luteal_length"    in grp else np.nan
            row["age"]              = grp.loc[i, "age"]              if "age"              in grp else np.nan
            row["bmi"]              = grp.loc[i, "bmi"]              if "bmi"              in grp else np.nan

            # Daily-log aggregates (self-reported; often NaN for public data)
            row["avg_flow"]         = grp.loc[i, "avg_flow"]         if "avg_flow"         in grp else np.nan
            row["avg_stress"]       = grp.loc[i, "avg_stress"]       if "avg_stress"       in grp else np.nan
            row["avg_sleep"]        = grp.loc[i, "avg_sleep"]        if "avg_sleep"        in grp else np.nan

            # ── Target ──
            row["next_cycle_length"] = lengths[i + 1]

            rows.append(row)

    return pd.DataFrame(rows).reset_index(drop=True)


def _history_stats(lengths: list[float]) -> dict:
    """Rolling statistics from all cycle lengths seen so far."""
    arr = np.array([x for x in lengths if not np.isnan(x)], dtype=float)
    n = len(arr)

    stats: dict = {}
    stats["n_cycles"]        = n
    stats["current_length"]  = float(arr[-1])           if n >= 1 else np.nan
    stats["prev_length"]     = float(arr[-2])           if n >= 2 else np.nan
    stats["mean_length"]     = float(arr.mean())        if n >= 1 else np.nan
    stats["std_length"]      = float(arr.std())         if n >= 2 else np.nan
    stats["min_length"]      = float(arr.min())         if n >= 1 else np.nan
    stats["max_length"]      = float(arr.max())         if n >= 1 else np.nan
    stats["range_length"]    = stats["max_length"] - stats["min_length"] if n >= 2 else np.nan

    # Trend: slope of a simple linear fit over past cycle lengths
    if n >= 3:
        x = np.arange(n)
        stats["trend"]       = float(np.polyfit(x, arr, 1)[0])
    else:
        stats["trend"]       = 0.0

    # Momentum: last cycle vs personal mean
    stats["deviation_from_mean"] = stats["current_length"] - stats["mean_length"] if n >= 2 else 0.0

    # Variability flag
    stats["is_irregular"]    = int(stats.get("std_length", 0) > 7)

    # Rolling windows
    stats["mean_last3"]      = float(arr[-3:].mean()) if n >= 3 else stats["mean_length"]
    stats["std_last3"]       = float(arr[-3:].std())  if n >= 3 else stats["std_length"]

    # Estimated luteal phase (use personal mean if unknown)
    stats["est_luteal"]      = LUTEAL_PHASE_MEAN

    return stats


# ── 2. LSTM sequence builder ──────────────────────────────────────────────────

def build_sequences(
    features_df: pd.DataFrame,
    lookback: int = 6,
    target_col: str = "next_cycle_length",
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    Build (X, y) sequences for LSTM training.

    X shape: (samples, lookback, n_features)
    y shape: (samples,)

    Sequences are built per subject so no cross-subject contamination.
    """
    SEQUENCE_FEATURES = [
        "current_length", "prev_length", "mean_length", "std_length",
        "mean_last3", "std_last3", "trend", "deviation_from_mean",
        "period_duration", "avg_flow", "avg_stress", "avg_sleep",
    ]
    # Only keep features that exist and are not all-NaN
    available = [
        f for f in SEQUENCE_FEATURES
        if f in features_df.columns and not features_df[f].isna().all()
    ]

    X_list, y_list = [], []

    for _, grp in features_df.groupby("subject_id"):
        grp = grp.sort_values("cycle_number").reset_index(drop=True)
        feat = grp[available].values.astype(float)
        tgt  = grp[target_col].values.astype(float)

        for i in range(lookback, len(feat)):
            window = feat[i - lookback : i]
            label  = tgt[i]
            if not np.isnan(label) and not np.isnan(window).all():
                X_list.append(window)
                y_list.append(label)

    if not X_list:
        return np.empty((0, lookback, len(available))), np.empty(0), available

    return np.array(X_list), np.array(y_list), available


# ── 3. Scaler utilities ───────────────────────────────────────────────────────

SCALER_PATH = MODEL_DIR / "feature_scaler.pkl"


def fit_scaler(df: pd.DataFrame, feature_cols: list[str]) -> StandardScaler:
    scaler = StandardScaler()
    valid  = df[feature_cols].dropna()
    scaler.fit(valid)
    joblib.dump(scaler, SCALER_PATH)
    return scaler


def load_scaler() -> StandardScaler | None:
    if SCALER_PATH.exists():
        return joblib.load(SCALER_PATH)
    return None


def apply_scaler(
    df: pd.DataFrame,
    feature_cols: list[str],
    scaler: StandardScaler | None = None,
) -> np.ndarray:
    if scaler is None:
        scaler = load_scaler()
    X = df[feature_cols].copy()
    # Impute NaNs with column medians before scaling
    for col in feature_cols:
        X[col] = X[col].fillna(X[col].median())
    return scaler.transform(X) if scaler else X.values


# ── 4. Personal DB → feature row ─────────────────────────────────────────────

def personal_db_to_features(
    cycle_summaries: list[dict],
) -> pd.DataFrame:
    """
    Convert the cycle_summaries view rows (dicts from PostgreSQL) into a
    standardised feature DataFrame identical to what public data produces.

    cycle_summaries: list of dicts, one per completed cycle, newest last.
    Expected keys (from the DB view):
        cycle_number, cycle_length, period_duration, ovulation_date,
        luteal_length, avg_flow, avg_stress, avg_sleep,
        days_cramps, days_fatigue, days_breast_tender, dominant_mood, ...
    """
    records = []
    for row in cycle_summaries:
        records.append({
            "subject_id":     "self",
            "cycle_number":   row.get("cycle_number", 0),
            "cycle_length":   row.get("cycle_length", np.nan),
            "period_duration":row.get("period_duration", np.nan),
            "ovulation_day":  row.get("ovulation_day_of_cycle", np.nan),
            "luteal_length":  row.get("luteal_length", np.nan),
            "age":            row.get("age", np.nan),
            "bmi":            row.get("bmi", np.nan),
            "avg_flow":       row.get("avg_flow", np.nan),
            "avg_stress":     row.get("avg_stress", np.nan),
            "avg_sleep":      row.get("avg_sleep", np.nan),
            # Symptom-derived features
            "frac_cramp_days":      _safe_frac(row, "days_cramps", "logged_days"),
            "frac_fatigue_days":    _safe_frac(row, "days_fatigue", "logged_days"),
            "frac_bloating_days":   _safe_frac(row, "days_bloating", "logged_days"),
            "dominant_mood":        row.get("dominant_mood", "neutral"),
        })

    df = pd.DataFrame(records)
    return build_cycle_features(df)


def _safe_frac(row: dict, num_key: str, den_key: str) -> float:
    n, d = row.get(num_key, 0) or 0, row.get(den_key, 0) or 0
    return n / d if d > 0 else np.nan
