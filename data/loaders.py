"""
data/loaders.py — Load and standardise public menstrual cycle datasets.

All data is read from LOCAL files only — no network requests are made.

Supported sources
-----------------
1. Fehring / Marquette (2012)
   File : data/raw/fehring_cycle_data.csv
   Download from: https://epublications.marquette.edu/data_nfp/7/

2. Physionet mcPHASES (2024)
   Files: data/raw/mcphases/  (all CSVs placed flat in this folder)
   Required : hormones_and_selfreport.csv, subject-info.csv
   Optional : resting_heart_rate.csv, sleep_score.csv,
              stress_score.csv, computed_temperature.csv
   Download from: https://physionet.org/content/mcphases/1.0.0/

NOTE: The Kaggle "Menstrual Cycle Data" (Bisht 2021) dataset has the same
columns and structure as the Fehring dataset and is NOT loaded separately
to avoid duplicate subjects inflating the prior.

Each loader returns a standardised pandas DataFrame with columns defined
in STANDARD_COLS below. Missing fields are NaN.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

from config import (
    CACHE_DIR, DATA_DIR, MIN_CYCLE_DAYS, MAX_CYCLE_DAYS, IRREGULAR_THRESHOLD_DAYS
)

log = logging.getLogger(__name__)


# ── Standard output schema ────────────────────────────────────────────────────

STANDARD_COLS = [
    "subject_id",
    "cycle_number",
    "cycle_length",
    "period_duration",
    "ovulation_day",    # day-of-cycle (1-indexed); NaN if unknown
    "luteal_length",
    "age",
    "bmi",
    "irregular_flag",   # True if within-subject std(cycle_length) > 7 days
    "avg_flow",         # 0-5 scale; NaN if unavailable
    "avg_stress",       # 1-3 scale; NaN if unavailable
    "avg_sleep",        # hours; NaN if unavailable
    "source",           # dataset name string
]


def _cache_path(name: str) -> Path:
    return CACHE_DIR / f"{name}_standardised.parquet"


def _save(df: pd.DataFrame, name: str) -> pd.DataFrame:
    df.to_parquet(_cache_path(name), index=False)
    log.info("Cached %d rows -> %s", len(df), _cache_path(name))
    return df


def _enforce_schema(df: pd.DataFrame, source: str) -> pd.DataFrame:
    """Add missing standard columns as NaN, tag source, drop implausible rows."""
    df = df.copy()
    df["source"] = source
    for col in STANDARD_COLS:
        if col not in df.columns:
            df[col] = np.nan
    df = df[
        df["cycle_length"].between(MIN_CYCLE_DAYS, MAX_CYCLE_DAYS)
    ].reset_index(drop=True)
    return df[STANDARD_COLS]


# ══════════════════════════════════════════════════════════════════════════════
# 1. Fehring / Marquette 2012
# ══════════════════════════════════════════════════════════════════════════════
#
# Actual column names in the downloaded CSV (UTF-8 BOM on first column):
#
#   ClientID                  -> subject_id
#   CycleNumber               -> cycle_number
#   LengthofCycle             -> cycle_length
#   EstimatedDayofOvulation   -> ovulation_day
#   LengthofLutealPhase       -> luteal_length
#   LengthofMenses            -> period_duration
#   MeanBleedingIntensity     -> avg_flow  (rescaled to 0-5, see note)
#   Age                       -> age
#   BMI                       -> bmi
#
# MeanBleedingIntensity is a composite score derived from daily menses scores
# (individual day scores are integers 0-3). Values in the file range ~1-15.
# We rescale to 0-5 by dividing by 3 (max daily score) so the scale matches
# the rest of the pipeline.
#
# MeanCycleLength is only populated on the first row per subject and is NOT
# used as cycle_length; LengthofCycle gives the actual value for every cycle.

FEHRING_PATH = DATA_DIR / "fehring_cycle_data.csv"

FEHRING_COL_MAP = {
    "ClientID":                "subject_id",
    "CycleNumber":             "cycle_number",
    "LengthofCycle":           "cycle_length",
    "EstimatedDayofOvulation": "ovulation_day",
    "LengthofLutealPhase":     "luteal_length",
    "LengthofMenses":          "period_duration",
    "MeanBleedingIntensity":   "avg_flow_raw",
    "Age":                     "age",
    "BMI":                     "bmi",
}


def load_fehring(force_reload: bool = False) -> pd.DataFrame:
    """
    Load the Fehring / Marquette 2012 dataset from a local CSV file.
    Place the file at:  data/raw/fehring_cycle_data.csv
    """
    cache = _cache_path("fehring")
    if cache.exists() and not force_reload:
        log.info("Loading Fehring from cache.")
        return pd.read_parquet(cache)

    if not FEHRING_PATH.exists():
        raise FileNotFoundError(
            f"Fehring CSV not found at {FEHRING_PATH}.\n"
            "Download from https://epublications.marquette.edu/data_nfp/7/ "
            "and place it at the path above."
        )

    # encoding="utf-8-sig" strips the BOM automatically
    raw = pd.read_csv(FEHRING_PATH, encoding="utf-8-sig", encoding_errors="replace")
    raw.columns = [c.lstrip("\ufeff").strip() for c in raw.columns]

    rename = {k: v for k, v in FEHRING_COL_MAP.items() if k in raw.columns}
    df = raw.rename(columns=rename)

    df["cycle_length"]    = pd.to_numeric(df["cycle_length"],                 errors="coerce")
    df["ovulation_day"]   = pd.to_numeric(df.get("ovulation_day", np.nan),    errors="coerce")
    df["luteal_length"]   = pd.to_numeric(df.get("luteal_length", np.nan),    errors="coerce")
    df["period_duration"] = pd.to_numeric(df.get("period_duration", np.nan),  errors="coerce")
    df["age"]             = pd.to_numeric(df.get("age", np.nan),               errors="coerce")
    df["bmi"]             = pd.to_numeric(df.get("bmi", np.nan),               errors="coerce")

    # avg_flow: rescale composite score (~0-15) to 0-5
    if "avg_flow_raw" in df.columns:
        raw_flow = pd.to_numeric(df["avg_flow_raw"], errors="coerce")
        df["avg_flow"] = (raw_flow / 3.0).clip(0, 5).round(2)
    else:
        df["avg_flow"] = np.nan

    df["avg_stress"] = np.nan
    df["avg_sleep"]  = np.nan

    df["irregular_flag"] = (
        df.groupby("subject_id")["cycle_length"]
          .transform("std") > IRREGULAR_THRESHOLD_DAYS
    )

    df = _enforce_schema(df, "fehring_2012")
    log.info(
        "Fehring: %d cycles, %d subjects (%.0f%% irregular).",
        len(df), df["subject_id"].nunique(), 100 * df["irregular_flag"].mean(),
    )
    return _save(df, "fehring")


# ══════════════════════════════════════════════════════════════════════════════
# 2. Physionet mcPHASES (2024)
# ══════════════════════════════════════════════════════════════════════════════
#
# File structure (from the dataset README):
#   All CSVs are flat files joined by  id  +  day_in_study.
#   There is NO participants.tsv.
#
# Required files (place in  data/raw/mcphases/ ):
#   hormones_and_selfreport.csv  -- phase, LH, estrogen, PDG, flow, symptoms
#   subject-info.csv             -- birth_year, age_of_first_menarche
#
# Optional enrichment files (also in  data/raw/mcphases/ ):
#   resting_heart_rate.csv       -- value (RHR bpm)
#   sleep_score.csv              -- overall_score (0-100)
#   stress_score.csv             -- stress_score (0-100, higher = less stressed)
#   computed_temperature.csv     -- nightly_temperature; uses sleep_start_day_in_study
#
# Cycle boundaries: new cycle = menstrual/follicular phase after non-bleed day,
#   OR study_interval changes.
# Ovulation day: day-of-cycle where LH column peaks (LH surge).
# Unit conversions:
#   sleep_score (0-100)  -> hours:    score x 0.09
#   stress_score (0-100) -> Likert 1-3 (inverted bins: >66->1, 33-66->2, <33->3)
#   flow_volume text     -> 0-5 numeric (FLOW_MAP below)

MCPHASES_DIR = DATA_DIR / "mcphases"

FLOW_MAP = {
    "not at all": 0,
    "very light": 1,
    "light":      2,
    "moderate":   3,
    "heavy":      4,
    "very heavy": 5,
}

MENSTRUAL_PHASES = {"menstrual", "follicular", "early follicular", "menses"}


def _read_mcphases_csv(filename: str) -> pd.DataFrame | None:
    """Read a mcPHASES CSV from data/raw/mcphases/. Returns None if absent."""
    path = MCPHASES_DIR / filename
    if not path.exists():
        log.debug("mcPHASES optional file not found, skipping: %s", filename)
        return None
    df = pd.read_csv(path)
    df.columns = df.columns.str.lower().str.strip()
    log.info("mcPHASES: read %s (%d rows)", filename, len(df))
    return df


def _infer_cycles_from_daily(daily: pd.DataFrame) -> pd.DataFrame:
    """
    Detect cycle boundaries for ONE subject and return one summary row per cycle.
    Boundary: menstrual/follicular day after a non-bleed day, or study_interval change.
    """
    daily = daily.sort_values("day_in_study").reset_index(drop=True)

    if "phase" in daily.columns:
        daily["phase"] = daily["phase"].fillna("").str.lower().str.strip()
    else:
        daily["phase"] = ""

    if "flow_volume" in daily.columns:
        if daily["flow_volume"].dtype == object:
            daily["flow_volume"] = (
                daily["flow_volume"].str.lower().str.strip().map(FLOW_MAP).fillna(0)
            )
        daily["flow_volume"] = pd.to_numeric(daily["flow_volume"], errors="coerce").fillna(0)
    else:
        daily["flow_volume"] = 0.0

    def is_bleed(i: int) -> bool:
        return daily.loc[i, "phase"] in MENSTRUAL_PHASES or daily.loc[i, "flow_volume"] > 0

    def is_new_cycle(i: int) -> bool:
        if i == 0:
            return True
        if "study_interval" in daily.columns:
            if daily.loc[i, "study_interval"] != daily.loc[i - 1, "study_interval"]:
                return True
        return is_bleed(i) and not is_bleed(i - 1)

    daily["_cycle_id"] = 0
    cid = 0
    for i in range(len(daily)):
        if is_new_cycle(i):
            cid += 1
        daily.loc[i, "_cycle_id"] = cid

    cycles = []
    for cycle_id, grp in daily.groupby("_cycle_id"):
        n_days      = int(grp["day_in_study"].max() - grp["day_in_study"].min() + 1)
        period_days = int((grp["flow_volume"] > 0).sum())

        ov_day = np.nan
        if "lh" in grp.columns:
            lh = pd.to_numeric(grp["lh"], errors="coerce")
            if lh.notna().any():
                peak_pos = lh.idxmax()
                ov_day   = int(grp.loc[peak_pos, "day_in_study"] - grp["day_in_study"].min() + 1)

        luteal = float(n_days - ov_day) if not np.isnan(ov_day) else np.nan

        def _col_mean(col: str) -> float:
            if col in grp.columns:
                return round(float(pd.to_numeric(grp[col], errors="coerce").mean()), 2)
            return np.nan

        cycles.append({
            "cycle_number":   int(cycle_id),
            "cycle_length":   n_days if n_days >= MIN_CYCLE_DAYS else np.nan,
            "period_duration":period_days if period_days > 0 else np.nan,
            "ovulation_day":  ov_day,
            "luteal_length":  luteal,
            "avg_flow":       _col_mean("flow_volume"),
            "avg_stress":     _col_mean("stress"),
            "avg_sleep":      _col_mean("sleep_hours"),
        })

    return pd.DataFrame(cycles)


def load_mcphases(force_reload: bool = False) -> pd.DataFrame:
    """
    Load the Physionet mcPHASES 2024 dataset from local CSV files.
    Place all downloaded CSVs flat in:  data/raw/mcphases/
    """
    cache = _cache_path("mcphases")
    if cache.exists() and not force_reload:
        log.info("Loading mcPHASES from cache.")
        return pd.read_parquet(cache)

    hormones = _read_mcphases_csv("hormones_and_selfreport.csv")
    if hormones is None:
        raise FileNotFoundError(
            "hormones_and_selfreport.csv is required.\n"
            "Download from https://physionet.org/content/mcphases/1.0.0/ "
            "and place in data/raw/mcphases/"
        )

    daily = hormones.copy()

    rhr = _read_mcphases_csv("resting_heart_rate.csv")
    if rhr is not None and "value" in rhr.columns:
        rhr = rhr.rename(columns={"value": "rhr_bpm"})
        cols = [c for c in ["id", "day_in_study", "rhr_bpm"] if c in rhr.columns]
        daily = daily.merge(rhr[cols], on=["id", "day_in_study"], how="left")

    sleep = _read_mcphases_csv("sleep_score.csv")
    if sleep is not None and "overall_score" in sleep.columns:
        sleep["sleep_hours"] = pd.to_numeric(sleep["overall_score"], errors="coerce") * 0.09
        cols = [c for c in ["id", "day_in_study", "sleep_hours"] if c in sleep.columns]
        daily = daily.merge(sleep[cols], on=["id", "day_in_study"], how="left")

    stress = _read_mcphases_csv("stress_score.csv")
    if stress is not None and "stress_score" in stress.columns:
        stress["stress_likert"] = pd.cut(
            pd.to_numeric(stress["stress_score"], errors="coerce"),
            bins=[0, 33, 66, 100], labels=[3, 2, 1], include_lowest=True,
        ).astype(float)
        cols = [c for c in ["id", "day_in_study", "stress_likert"] if c in stress.columns]
        daily = daily.merge(stress[cols], on=["id", "day_in_study"], how="left")
        if "stress" not in daily.columns or daily["stress"].isna().all():
            daily["stress"] = daily["stress_likert"]

    temp = _read_mcphases_csv("computed_temperature.csv")
    if temp is not None and "nightly_temperature" in temp.columns:
        if "sleep_start_day_in_study" in temp.columns:
            temp = temp.rename(columns={"sleep_start_day_in_study": "day_in_study"})
        cols = [c for c in ["id", "day_in_study", "nightly_temperature"] if c in temp.columns]
        daily = daily.merge(temp[cols], on=["id", "day_in_study"], how="left")

    age_map: dict = {}
    subj_info = _read_mcphases_csv("subject-info.csv")
    if subj_info is not None and "birth_year" in subj_info.columns and "id" in subj_info.columns:
        subj_info["age"] = 2023 - pd.to_numeric(subj_info["birth_year"], errors="coerce")
        age_map = subj_info.set_index("id")["age"].to_dict()

    all_rows: list[dict] = []
    for subj in daily["id"].unique():
        subj_daily = daily[daily["id"] == subj].copy()
        try:
            cycle_df = _infer_cycles_from_daily(subj_daily)
        except Exception as exc:
            log.debug("Cycle inference failed for subject %s: %s", subj, exc)
            continue
        age = age_map.get(subj, np.nan)
        for _, row in cycle_df.iterrows():
            all_rows.append({
                "subject_id":     str(subj),
                "cycle_number":   row["cycle_number"],
                "cycle_length":   row["cycle_length"],
                "period_duration":row["period_duration"],
                "ovulation_day":  row["ovulation_day"],
                "luteal_length":  row["luteal_length"],
                "age":            age,
                "bmi":            np.nan,
                "avg_flow":       row["avg_flow"],
                "avg_stress":     row["avg_stress"],
                "avg_sleep":      row["avg_sleep"],
            })

    if not all_rows:
        raise ValueError(
            "mcPHASES loader produced 0 rows. "
            "Check that hormones_and_selfreport.csv contains 'id' and either "
            "a 'phase' or 'flow_volume' column."
        )

    df = pd.DataFrame(all_rows)
    df["irregular_flag"] = (
        df.groupby("subject_id")["cycle_length"]
          .transform("std") > IRREGULAR_THRESHOLD_DAYS
    )
    df = _enforce_schema(df, "mcphases_2024")
    log.info(
        "mcPHASES: %d cycles, %d subjects (%.0f%% with ovulation day).",
        len(df), df["subject_id"].nunique(), 100 * df["ovulation_day"].notna().mean(),
    )
    return _save(df, "mcphases")


# ══════════════════════════════════════════════════════════════════════════════
# Master loader
# ══════════════════════════════════════════════════════════════════════════════

def load_all_public() -> pd.DataFrame:
    """
    Load and combine all available public datasets.
    Returns a single standardised DataFrame ready for model pre-training.

    Datasets loaded (local files only, no network access):
        1. Fehring / Marquette 2012  (data/raw/fehring_cycle_data.csv)
        2. Physionet mcPHASES 2024   (data/raw/mcphases/*.csv)

    NOTE: The Kaggle dataset (Bisht 2021) is structurally identical to
    Fehring and is intentionally excluded to avoid inflating the prior
    with duplicate subjects.
    """
    parts = []
    for name, loader in [("Fehring", load_fehring), ("mcPHASES", load_mcphases)]:
        try:
            df = loader()
            parts.append(df)
            log.info("%s loaded: %d cycles.", name, len(df))
        except Exception as exc:
            log.warning("Skipping %s: %s", name, exc)

    if not parts:
        raise RuntimeError(
            "No public datasets could be loaded. "
            "Place fehring_cycle_data.csv in data/raw/ and/or "
            "mcPHASES CSVs in data/raw/mcphases/."
        )

    combined = pd.concat(parts, ignore_index=True)
    combined = combined.dropna(subset=["cycle_length"]).reset_index(drop=True)
    log.info(
        "Combined public data: %d cycles, %d subjects, %d sources.",
        len(combined), combined["subject_id"].nunique(), combined["source"].nunique(),
    )
    return combined


def irregular_subset(df: pd.DataFrame) -> pd.DataFrame:
    """
    Filter to subjects with irregular cycles (std > 7 days) OR mean >= 30 days.
    Matches the target user profile (irregular ~35 day cycle).
    """
    long_mean     = df.groupby("subject_id")["cycle_length"].mean() >= 30
    long_subjects = set(long_mean[long_mean].index)
    mask = df["irregular_flag"].fillna(False) | df["subject_id"].isin(long_subjects)
    out  = df[mask].reset_index(drop=True)
    log.info("Irregular subset: %d cycles, %d subjects.", len(out), out["subject_id"].nunique())
    return out