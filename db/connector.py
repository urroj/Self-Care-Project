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

    # Check if any log already exists for this date (regardless of cycle_id).
    # SQL-inserted logs may carry a different cycle_id, so we match on log_date alone.
    existing = _fetch(
        "SELECT id FROM daily_logs WHERE log_date = %s LIMIT 1",
        (log_date,)
    )

    if existing:
        # UPDATE the existing row so SQL-inserted logs are overwritten correctly
        # and no duplicate row is created.
        update_fields = {"cycle_id": cycle_id, "day_of_cycle": day_of_cycle, **data}
        sets = ", ".join(f"{col} = %s" for col in update_fields)
        _execute(
            f"UPDATE daily_logs SET {sets} WHERE log_date = %s",
            (*update_fields.values(), log_date)
        )
    else:
        cols = ["cycle_id", "log_date", "day_of_cycle"] + list(data.keys())
        vals = [cycle_id, log_date, day_of_cycle] + list(data.values())
        placeholders = ", ".join(["%s"] * len(vals))
        _execute(
            f"INSERT INTO daily_logs ({', '.join(cols)}) VALUES ({placeholders})",
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




def update_cycle_dates(
    cycle_id: str,
    period_end: "date | None" = None,
    ovulation_date: "date | None" = None,
) -> None:
    """Update period_end and/or ovulation_date on an active cycle."""
    sets = []
    vals = []
    if period_end is not None:
        sets.append("period_end = %s")
        vals.append(period_end)
    if ovulation_date is not None:
        sets.append("ovulation_date = %s")
        vals.append(ovulation_date)
    if not sets:
        return
    sets.append("updated_at = NOW()")
    vals.append(cycle_id)
    _execute(
        f"UPDATE cycles SET {', '.join(sets)} WHERE id = %s",
        tuple(vals)
    )


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

# ── Journal entries ───────────────────────────────────────────────────────────
 
def get_journal_entry(entry_date: str) -> dict | None:
    """Return a single journal entry by date, or None if no entry exists."""
    rows = _fetch(
        """
        SELECT entry_date::text, weather, content,
               to_char(updated_at, 'YYYY-MM-DD HH24:MI') AS last_saved
        FROM journal_entries
        WHERE entry_date = %s::date
        """,
        (entry_date,)
    )
    return rows[0] if rows else None
 
 
def upsert_journal_entry(entry_date: str, weather: str = "", content: str = "") -> None:
    """Insert or update a journal entry. One row per calendar day."""
    _execute(
        """
        INSERT INTO journal_entries (entry_date, weather, content)
        VALUES (%s::date, %s, %s)
        ON CONFLICT (entry_date) DO UPDATE
        SET weather    = EXCLUDED.weather,
            content    = EXCLUDED.content,
            updated_at = NOW()
        """,
        (entry_date, weather, content)
    )
 
def get_habits(habit_date: str) -> dict | None:
    rows = _fetch(
        """
        SELECT habit_date::text, water_glasses,
               prayer_fajr, prayer_zuhr, prayer_asr, prayer_maghrib, prayer_isha,
               quran_recited, todos, project_ideas,
               to_char(updated_at, 'YYYY-MM-DD HH24:MI') AS last_saved
        FROM daily_habits
        WHERE habit_date = %s::date
        """,
        (habit_date,)
    )
    return rows[0] if rows else None


def upsert_habits(
    habit_date:     str,
    water_glasses:  int  = 0,
    prayer_fajr:    bool = False,
    prayer_zuhr:    bool = False,
    prayer_asr:     bool = False,
    prayer_maghrib: bool = False,
    prayer_isha:    bool = False,
    quran_recited:  bool = False,
    todos:          list | None = None,
    project_ideas:  list | None = None,
) -> None:
    _execute(
        """
        INSERT INTO daily_habits
            (habit_date, water_glasses, prayer_fajr, prayer_zuhr, prayer_asr,
             prayer_maghrib, prayer_isha, quran_recited, todos, project_ideas)
        VALUES (%s::date, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (habit_date) DO UPDATE SET
            water_glasses  = EXCLUDED.water_glasses,
            prayer_fajr    = EXCLUDED.prayer_fajr,
            prayer_zuhr    = EXCLUDED.prayer_zuhr,
            prayer_asr     = EXCLUDED.prayer_asr,
            prayer_maghrib = EXCLUDED.prayer_maghrib,
            prayer_isha    = EXCLUDED.prayer_isha,
            quran_recited  = EXCLUDED.quran_recited,
            todos          = EXCLUDED.todos,
            project_ideas  = EXCLUDED.project_ideas,
            updated_at     = NOW()
        """,
        (
            habit_date, water_glasses,
            prayer_fajr, prayer_zuhr, prayer_asr, prayer_maghrib, prayer_isha,
            quran_recited,
            psycopg2.extras.Json(todos or []),
            list(project_ideas) if project_ideas else [],
        )
    )
    
# ── ETF investments ───────────────────────────────────────────────────────────

def get_etf_investments(symbol: str) -> list[dict]:
    """Return all investment entries for a symbol, newest first."""
    return _fetch(
        """
        SELECT id::text, symbol, amount::float, investment_date::text,
               price_on_date::float, units::float, notes, created_at::text
        FROM etf_investments
        WHERE symbol = %s
        ORDER BY investment_date DESC
        """,
        (symbol,)
    )


def add_etf_investment(
    symbol: str,
    amount: float,
    investment_date: str,
    price_on_date: float,
    notes: str = "",
) -> str:
    """Insert a new investment entry, return its UUID."""
    rows = _fetch(
        """
        INSERT INTO etf_investments (symbol, amount, investment_date, price_on_date, notes)
        VALUES (%s, %s, %s::date, %s, %s)
        RETURNING id::text
        """,
        (symbol, amount, investment_date, price_on_date, notes)
    )
    return rows[0]["id"]


def delete_etf_investment(investment_id: str) -> None:
    """Remove an investment entry by UUID."""
    _execute(
        "DELETE FROM etf_investments WHERE id = %s",
        (investment_id,)
    )


# ── ETF forecasts ─────────────────────────────────────────────────────────────

def save_etf_forecast(
    symbol:             str,
    horizon:            str,
    model_name:         str,
    model_rationale:    str,
    forecast_from:      str,
    forecast_dates:     list,
    forecast_values:    list,
    conf_lower:         list,
    conf_upper:         list,
    metrics:            dict,
    feature_importance: dict,
    currency:           str = "",
    history_dates:      list | None = None,
    history_values:     list | None = None,
) -> str:
    """Persist a forecast run. Returns the new row UUID."""
    rows = _fetch(
        """
        INSERT INTO etf_forecasts
            (symbol, horizon, model_name, model_rationale, forecast_from,
             forecast_dates, forecast_values, conf_lower, conf_upper,
             metrics, feature_importance, currency,
             history_dates, history_values)
        VALUES (%s, %s, %s, %s, %s::date, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id::text
        """,
        (
            symbol, horizon, model_name, model_rationale, forecast_from,
            psycopg2.extras.Json(forecast_dates),
            psycopg2.extras.Json(forecast_values),
            psycopg2.extras.Json(conf_lower),
            psycopg2.extras.Json(conf_upper),
            psycopg2.extras.Json(metrics),
            psycopg2.extras.Json(feature_importance),
            currency,
            psycopg2.extras.Json(history_dates or []),
            psycopg2.extras.Json(history_values or []),
        ),
    )
    return rows[0]["id"]


def get_etf_forecast(symbol: str, horizon: str) -> dict | None:
    """Return the most recent forecast for a symbol+horizon, or None."""
    rows = _fetch(
        """
        SELECT id::text, symbol, horizon, model_name, model_rationale,
               forecast_from::text, forecast_dates, forecast_values,
               conf_lower, conf_upper, metrics, feature_importance,
               currency, history_dates, history_values,
               to_char(created_at, 'YYYY-MM-DD HH24:MI') AS run_at
        FROM etf_forecasts
        WHERE symbol = %s AND horizon = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (symbol, horizon),
    )
    return rows[0] if rows else None