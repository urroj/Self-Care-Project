-- =============================================================================
-- schema.sql — Period Tracker Personal Database
-- Run once: psql -d period_tracker -f db/schema.sql
-- =============================================================================

-- Enable uuid generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- cycles: one row per completed menstrual cycle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycles (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_number    INTEGER     NOT NULL,          -- 1, 2, 3 … (personal count)
    start_date      DATE        NOT NULL,
    end_date        DATE,                          -- NULL while cycle is ongoing
    cycle_length    INTEGER     GENERATED ALWAYS AS
                        (end_date - start_date) STORED,
    -- Menstruation window
    period_start    DATE        NOT NULL,
    period_end      DATE,
    period_duration INTEGER     GENERATED ALWAYS AS
                        (period_end - period_start + 1) STORED,
    -- Confirmed ovulation (from LH strip or temp shift)
    ovulation_date  DATE,
    luteal_length   INTEGER     GENERATED ALWAYS AS
                        (end_date - ovulation_date) STORED,
    -- Data quality flag
    is_complete     BOOLEAN     NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cycles_number ON cycles(cycle_number);
CREATE INDEX        IF NOT EXISTS idx_cycles_start  ON cycles(start_date);



-- ---------------------------------------------------------------------------
-- daily_logs: one row per day, linked to a cycle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id        UUID        NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
    log_date        DATE        NOT NULL,
    day_of_cycle    INTEGER     NOT NULL,          -- 1 = first day of bleeding
    -- ── Flow ──────────────────────────────────────────────────────────────
    -- 0=none, 1=spotting, 2=light, 3=medium, 4=heavy, 5=very heavy
    flow_intensity  SMALLINT    CHECK (flow_intensity BETWEEN 0 AND 5),
    -- ── Cervical mucus ────────────────────────────────────────────────────
    -- dry/sticky/creamy/watery/egg_white/spotting
    mucus_type      VARCHAR(20) CHECK (mucus_type IN (
                        'dry','sticky','creamy','watery','egg_white','spotting'
                    )),
    -- ── Temperature (manual BBT, degrees Celsius) ─────────────────────────
    bbt_celsius     NUMERIC(4,2) CHECK (bbt_celsius BETWEEN 35.0 AND 38.5),
    -- ── Mood (multi-select stored as array) ───────────────────────────────
    -- values: happy, calm, anxious, sad, irritable, energetic, depressed, neutral
    moods           TEXT[],
    -- ── Physical symptoms (binary flags) ─────────────────────────────────
    symptom_cramps          BOOLEAN DEFAULT FALSE,
    symptom_bloating        BOOLEAN DEFAULT FALSE,
    symptom_breast_tender   BOOLEAN DEFAULT FALSE,
    symptom_headache        BOOLEAN DEFAULT FALSE,
    symptom_acne            BOOLEAN DEFAULT FALSE,
    symptom_back_pain       BOOLEAN DEFAULT FALSE,
    symptom_nausea          BOOLEAN DEFAULT FALSE,
    symptom_fatigue         BOOLEAN DEFAULT FALSE,
    symptom_ovulation_pain  BOOLEAN DEFAULT FALSE,   -- mittelschmerz
    -- ── Lifestyle ─────────────────────────────────────────────────────────
    sleep_hours     NUMERIC(3,1) CHECK (sleep_hours BETWEEN 3 AND 14),
    -- 1=poor, 2=fair, 3=good
    sleep_quality   SMALLINT    CHECK (sleep_quality BETWEEN 1 AND 3),
    -- 1=low, 2=moderate, 3=high
    stress_level    SMALLINT    CHECK (stress_level BETWEEN 1 AND 3),
    weight_kg       NUMERIC(5,2),
    exercise_mins   SMALLINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_logs_date
    ON daily_logs(cycle_id, log_date);

-- ---------------------------------------------------------------------------
-- model_runs: audit trail — every prediction stored with inputs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_runs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model_phase     VARCHAR(20) NOT NULL,           -- cold_start / bayesian / lstm
    personal_cycles INTEGER     NOT NULL,
    -- Predictions (JSON so schema can evolve freely)
    predictions     JSONB       NOT NULL,
    -- Model metadata
    model_version   VARCHAR(40),
    metrics         JSONB
);

------------------------------------------------------------------------------
-- Add Data
------------------------------------------------------------------------------
INSERT INTO cycles (cycle_number, start_date, period_start, period_end)
VALUES (3, '2025-03-04', '2025-03-04', '2025-03-09'),
       (4, '2025-04-07', '2025-04-07', '2025-04-11');

INSERT INTO cycles (cycle_number, start_date, period_start)
VALUES(5, '2025-05-15', '2025-05-15');


-- Mark it complete once next period starts
UPDATE cycles
SET end_date = '2025-05-14', is_complete = TRUE
WHERE cycle_number = 4;

--insert some daily logs for cycle 5 (ongoing)
insert into daily_logs (id, cycle_id, log_date, day_of_cycle, flow_intensity, moods,
                         sleep_hours, sleep_quality, stress_level, weight_kg)
values (gen_random_uuid(), (select id from cycles where cycle_number = 5), '2025-05-17', 3, 3,
         ARRAY['irritable', 'tired'],7.0, 2, 2, 59.0);

-- values: happy, calm, anxious, sad, irritable, energetic, depressed, neutral,tired


select * from daily_logs;


-- ---------------------------------------------------------------------------
-- Convenience view: one summary row per completed cycle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW cycle_summaries AS
SELECT
    c.id,
    c.cycle_number,
    c.start_date,
    c.end_date,
    c.cycle_length,
    c.period_duration,
    c.ovulation_date,
    c.luteal_length,
    -- Aggregated symptom counts across the cycle
    COUNT(dl.id)                                        AS logged_days,
    ROUND(AVG(dl.flow_intensity)::NUMERIC, 2)           AS avg_flow,
    ROUND(AVG(dl.sleep_hours)::NUMERIC, 2)              AS avg_sleep,
    ROUND(AVG(dl.sleep_quality)::NUMERIC, 2)            AS avg_sleep_quality,
    ROUND(AVG(dl.stress_level)::NUMERIC, 2)             AS avg_stress,
    ROUND(AVG(dl.weight_kg)::NUMERIC, 2)                AS avg_weight,
    SUM(dl.symptom_cramps::INT)                         AS days_cramps,
    SUM(dl.symptom_bloating::INT)                       AS days_bloating,
    SUM(dl.symptom_breast_tender::INT)                  AS days_breast_tender,
    SUM(dl.symptom_headache::INT)                       AS days_headache,
    SUM(dl.symptom_fatigue::INT)                        AS days_fatigue,
    -- Dominant mood (most frequent value across all daily logs for this cycle)
    (
        SELECT mood
        FROM (
            SELECT unnest(moods) AS mood
            FROM   daily_logs
            WHERE  cycle_id = c.id
              AND  moods IS NOT NULL
        ) mood_rows
        GROUP BY mood
        ORDER BY COUNT(*) DESC
        LIMIT 1
    )                                                   AS dominant_mood
 
FROM cycles c
LEFT JOIN daily_logs dl ON dl.cycle_id = c.id
WHERE c.is_complete = TRUE
GROUP BY c.id
ORDER BY c.cycle_number;
