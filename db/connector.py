"""
db/connector.py — PostgreSQL interface for personal period tracker data.

All reads return plain Python dicts / lists so the rest of the pipeline
has no direct SQLAlchemy / psycopg2 dependency beyond this file.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import date
from typing import Any, Generator

import psycopg2
import psycopg2.extras
from config import DB_URL

log = logging.getLogger(__name__)


# ── Connection ────────────────────────────────────────────────────────────────

@contextmanager
def get_conn() -> Generator[psycopg2.extensions.connection, None, None]:
    """Yield a psycopg2 connection with dict cursor, auto-commit on success."""
    conn = psycopg2.connect(DB_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _fetch(sql: str, params: tuple = ()) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def _execute(sql: str, params: tuple = ()) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)


# ── Reads ─────────────────────────────────────────────────────────────────────

def get_completed_cycles(limit: int | None = None) -> list[dict]:
    """Return all completed cycles ordered by cycle_number ascending."""
    sql = """
        SELECT * FROM cycle_summaries
        ORDER BY cycle_number ASC
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    return _fetch(sql)


def get_all_cycles_raw() -> list[dict]:
    """Raw cycles table — includes is_complete flag."""
    return _fetch("SELECT * FROM cycles ORDER BY cycle_number ASC")


def get_daily_logs(cycle_id: str) -> list[dict]:
    return _fetch(
        "SELECT * FROM daily_logs WHERE cycle_id = %s ORDER BY log_date ASC",
        (cycle_id,)
    )


def get_daily_logs_for_cycle_number(cycle_number: int) -> list[dict]:
    return _fetch(
        """
        SELECT dl.*
        FROM daily_logs dl
        JOIN cycles c ON c.id = dl.cycle_id
        WHERE c.cycle_number = %s
        ORDER BY dl.log_date ASC
        """,
        (cycle_number,)
    )


def get_last_n_cycle_lengths(n: int = 12) -> list[float]:
    """Return the last n completed cycle lengths as a plain list."""
    rows = _fetch(
        """
        SELECT cycle_length FROM cycles
        WHERE is_complete = TRUE AND cycle_length IS NOT NULL
        ORDER BY cycle_number DESC
        LIMIT %s
        """,
        (n,)
    )
    return [float(r["cycle_length"]) for r in reversed(rows)]


def get_model_runs(limit: int = 10) -> list[dict]:
    return _fetch(
        "SELECT * FROM model_runs ORDER BY run_date DESC LIMIT %s", (limit,)
    )


def count_completed_cycles() -> int:
    rows = _fetch("SELECT COUNT(*) AS n FROM cycles WHERE is_complete = TRUE")
    return int(rows[0]["n"]) if rows else 0

def get_active_cycle() -> dict | None:
    rows = _fetch("""
        SELECT id, cycle_number, start_date, period_start, period_end, notes
        FROM cycles
        WHERE is_complete = FALSE
        ORDER BY cycle_number DESC
        LIMIT 1
    """)
    return rows[0] if rows else None
# ── Writes ────────────────────────────────────────────────────────────────────

def insert_cycle(
    cycle_number: int,
    start_date: date,
    period_start: date,
    period_end: date | None = None,
    end_date: date | None = None,
    ovulation_date: date | None = None,
    lh_positive_date: date | None = None,
    notes: str | None = None,
    is_complete: bool = False,
) -> str:
    """Insert a new cycle row and return its UUID."""
    rows = _fetch(
        """
        INSERT INTO cycles
            (cycle_number, start_date, period_start, period_end,
             end_date, ovulation_date, lh_positive_date, notes, is_complete)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (cycle_number, start_date, period_start, period_end,
         end_date, ovulation_date, lh_positive_date, notes, is_complete)
    )
    return str(rows[0]["id"])


def complete_cycle(cycle_id: str, end_date: date) -> None:
    """Mark a cycle as complete once the next period begins."""
    _execute(
        """
        UPDATE cycles
        SET end_date = %s, is_complete = TRUE, updated_at = NOW()
        WHERE id = %s
        """,
        (end_date, cycle_id)
    )


def insert_daily_log(
    cycle_id: str,
    log_date: date,
    day_of_cycle: int,
    **kwargs: Any,
) -> None:
    """
    Insert one daily log row.
    kwargs may include any column from the daily_logs table:
        flow_intensity, mucus_type, bbt_celsius, moods (list),
        symptom_cramps, symptom_bloating, symptom_breast_tender,
        symptom_headache, symptom_acne, symptom_back_pain,
        symptom_nausea, symptom_fatigue, symptom_ovulation_pain,
        sleep_hours, sleep_quality, stress_level, weight_kg,
        exercise_mins, lh_tested, lh_positive
    """
    allowed = {
        "flow_intensity", "mucus_type", "bbt_celsius", "moods",
        "symptom_cramps", "symptom_bloating", "symptom_breast_tender",
        "symptom_headache", "symptom_acne", "symptom_back_pain",
        "symptom_nausea", "symptom_fatigue", "symptom_ovulation_pain",
        "sleep_hours", "sleep_quality", "stress_level", "weight_kg",
        "exercise_mins", "lh_tested", "lh_positive",
    }
    data = {k: v for k, v in kwargs.items() if k in allowed}
    cols = ["cycle_id", "log_date", "day_of_cycle"] + list(data.keys())
    vals = [cycle_id, log_date, day_of_cycle] + list(data.values())

    placeholders = ", ".join(["%s"] * len(vals))
    col_str      = ", ".join(cols)
    _execute(
        f"""
        INSERT INTO daily_logs ({col_str})
        VALUES ({placeholders})
        ON CONFLICT (cycle_id, log_date) DO NOTHING
        """,
        tuple(vals)
    )



def get_all_logs_with_cycle(limit: int = 300) -> list[dict]:
    """Return daily logs joined with cycle_number, newest first."""
    return _fetch(
        """
        SELECT
            dl.id,
            dl.log_date,
            dl.day_of_cycle,
            dl.cycle_id,
            c.cycle_number,
            dl.flow_intensity,
            dl.mucus_type,
            dl.moods,
            dl.symptom_cramps,
            dl.symptom_bloating,
            dl.symptom_breast_tender,
            dl.symptom_headache,
            dl.symptom_acne,
            dl.symptom_back_pain,
            dl.symptom_nausea,
            dl.symptom_fatigue,
            dl.symptom_ovulation_pain,
            dl.sleep_hours,
            dl.sleep_quality,
            dl.stress_level,
            dl.weight_kg,
            dl.exercise_mins
        FROM daily_logs dl
        JOIN cycles c ON c.id = dl.cycle_id
        ORDER BY dl.log_date DESC
        LIMIT %s
        """,
        (limit,),
    )


def get_insights_data() -> dict:
    """Aggregate data for the Insights tab charts."""
    symptoms = _fetch("""
        SELECT
            COALESCE(SUM(symptom_cramps::int),         0) AS cramps,
            COALESCE(SUM(symptom_bloating::int),       0) AS bloating,
            COALESCE(SUM(symptom_breast_tender::int),  0) AS breast_tender,
            COALESCE(SUM(symptom_headache::int),       0) AS headache,
            COALESCE(SUM(symptom_acne::int),           0) AS acne,
            COALESCE(SUM(symptom_back_pain::int),      0) AS back_pain,
            COALESCE(SUM(symptom_nausea::int),         0) AS nausea,
            COALESCE(SUM(symptom_fatigue::int),        0) AS fatigue,
            COALESCE(SUM(symptom_ovulation_pain::int), 0) AS ov_pain
        FROM daily_logs
    """)

    cycle_stats = _fetch("""
        SELECT
            c.cycle_number,
            c.cycle_length,
            ROUND(AVG(dl.sleep_hours)::numeric,    2) AS avg_sleep,
            ROUND(AVG(dl.stress_level)::numeric,   2) AS avg_stress,
            ROUND(AVG(dl.flow_intensity)::numeric, 2) AS avg_flow,
            ROUND(AVG(dl.weight_kg)::numeric,      2) AS avg_weight
        FROM cycles c
        LEFT JOIN daily_logs dl ON dl.cycle_id = c.id
        WHERE c.is_complete = TRUE AND c.cycle_length IS NOT NULL
        GROUP BY c.cycle_number, c.cycle_length
        ORDER BY c.cycle_number ASC
    """)

    model_runs = _fetch("""
        SELECT run_date, model_phase, personal_cycles, predictions
        FROM model_runs
        ORDER BY run_date ASC
        LIMIT 30
    """)

    moods = _fetch("""
        SELECT unnest(moods) AS mood, COUNT(*) AS count
        FROM daily_logs
        WHERE moods IS NOT NULL AND array_length(moods, 1) > 0
        GROUP BY mood
        ORDER BY count DESC
        LIMIT 8
    """)

    return {
        "symptoms":    symptoms[0] if symptoms else {},
        "cycle_stats": cycle_stats,
        "model_runs":  model_runs,
        "moods":       moods,
    }


def save_model_run(
    model_phase: str,
    personal_cycles: int,
    predictions: dict,
    model_version: str = "1.0",
    metrics: dict | None = None,
) -> None:
    """Audit-log a prediction run."""
    import json
    _execute(
        """
        INSERT INTO model_runs
            (model_phase, personal_cycles, predictions, model_version, metrics)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            model_phase, personal_cycles,
            psycopg2.extras.Json(predictions),
            model_version,
            psycopg2.extras.Json(metrics or {}),
        )
    )