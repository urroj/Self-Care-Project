-- etf_forecasts_migration.sql
-- Run once to add the ETF forecast storage table.

CREATE TABLE IF NOT EXISTS etf_forecasts (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol             TEXT        NOT NULL,
    horizon            TEXT        NOT NULL,         -- '1y' | '5y' | '10y'
    model_name         TEXT        NOT NULL,
    model_rationale    TEXT        NOT NULL DEFAULT '',
    forecast_from      DATE        NOT NULL,
    forecast_dates     JSONB       NOT NULL DEFAULT '[]',
    forecast_values    JSONB       NOT NULL DEFAULT '[]',
    conf_lower         JSONB       NOT NULL DEFAULT '[]',
    conf_upper         JSONB       NOT NULL DEFAULT '[]',
    metrics            JSONB       NOT NULL DEFAULT '{}',
    feature_importance JSONB       NOT NULL DEFAULT '{}',
    currency           TEXT        NOT NULL DEFAULT '',
    history_dates      JSONB       NOT NULL DEFAULT '[]',
    history_values     JSONB       NOT NULL DEFAULT '[]',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etf_forecasts_lookup
    ON etf_forecasts (symbol, horizon, created_at DESC);

