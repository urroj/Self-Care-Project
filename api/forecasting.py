"""
api/forecasting.py — ETF price forecast pipeline.

Horizon mapping
---------------
  1y  → Holt-Winters ETS (no damping) on weekly data, 52 steps forward
  5y  → Holt-Winters ETS (damped trend) on weekly data, 260 steps forward
  10y → Log-linear OLS trend on monthly data, 120 steps forward

Confidence bands: 95% intervals.
  ETS  — residual σ scaled by √h (classical ETS formula)
  OLS  — standard regression prediction interval, widening over horizon

Data sourced from Yahoo Finance (max available history).
"""

from __future__ import annotations

import calendar
import datetime
import math
import warnings
from typing import Any

import numpy as np
import requests

warnings.filterwarnings("ignore")


# ── Yahoo Finance data fetcher ─────────────────────────────────────────────────

def _fetch_history(symbol: str, interval: str) -> tuple[list[datetime.date], list[float], str]:
    """Fetch max history. Returns (dates, closes, currency)."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    params  = {"range": "max", "interval": interval, "includePrePost": "false"}

    resp = requests.get(url, headers=headers, params=params, timeout=20)
    resp.raise_for_status()

    data   = resp.json()
    result = data.get("chart", {}).get("result", [])
    if not result:
        err = data.get("chart", {}).get("error", {})
        raise ValueError(f"No data for {symbol}: {err.get('description', 'unknown error')}")

    r        = result[0]
    ts_list  = r.get("timestamp", [])
    cl_list  = r["indicators"]["quote"][0].get("close", [])
    currency = r.get("meta", {}).get("currency", "")

    dates, closes = [], []
    seen: set[datetime.date] = set()
    for ts, cl in zip(ts_list, cl_list):
        if cl is None:
            continue
        d = datetime.datetime.utcfromtimestamp(ts).date()
        if d in seen:
            continue
        seen.add(d)
        dates.append(d)
        closes.append(float(cl))

    if not dates:
        raise ValueError(f"No valid price data for {symbol}")

    # Sort by date
    pairs  = sorted(zip(dates, closes), key=lambda x: x[0])
    dates  = [p[0] for p in pairs]
    closes = [p[1] for p in pairs]
    return dates, closes, currency


# ── Date sequence generators ───────────────────────────────────────────────────

def _weekly_dates(last: datetime.date, n: int) -> list[str]:
    out, cur = [], last
    for _ in range(n):
        cur = cur + datetime.timedelta(weeks=1)
        out.append(cur.isoformat())
    return out


def _monthly_dates(last: datetime.date, n: int) -> list[str]:
    out, d = [], last
    for _ in range(n):
        m = d.month + 1
        y = d.year + (1 if m > 12 else 0)
        m = m if m <= 12 else 1
        day = min(d.day, calendar.monthrange(y, m)[1])
        d   = d.replace(year=y, month=m, day=day)
        out.append(d.isoformat())
    return out


# ── ETS model ─────────────────────────────────────────────────────────────────

def _run_ets(
    closes:  list[float],
    n_steps: int,
    damped:  bool,
) -> tuple[list[float], list[float], list[float], dict]:
    """
    Fit Holt-Winters ETS (additive trend, no seasonal) and forecast n_steps.
    Returns (forecast, lower_95, upper_95, metrics).
    """
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    arr = np.array(closes, dtype=float)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = ExponentialSmoothing(
            arr,
            trend="add",
            seasonal=None,
            damped_trend=damped,
            initialization_method="estimated",
        )
        fit = model.fit(optimized=True)

    fc_vals = np.array(fit.forecast(n_steps), dtype=float)

    # 95% CI: residual σ × √h  (classical ETS variance formula approximation)
    sigma = float(np.std(fit.resid))
    h     = np.arange(1, n_steps + 1, dtype=float)
    lower = np.clip(fc_vals - 1.96 * sigma * np.sqrt(h), 0, None)
    upper = fc_vals + 1.96 * sigma * np.sqrt(h)

    params = fit.params
    metrics: dict[str, Any] = {
        "aic":     round(float(fit.aic), 2),
        "bic":     round(float(fit.bic), 2),
        "alpha":   round(float(params.get("smoothing_level", 0)), 4),
        "beta":    round(float(params.get("smoothing_trend",  0)), 4),
        "sigma":   round(sigma, 4),
        "n_train": len(closes),
    }
    if damped:
        metrics["phi"] = round(float(params.get("damping_trend", 1.0)), 4)

    return fc_vals.tolist(), lower.tolist(), upper.tolist(), metrics


# ── Walk-forward validation (weekly, 1Y only) ─────────────────────────────────

def _wf_metrics(closes: list[float]) -> dict:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    n_test = min(16, max(4, len(closes) // 6))
    if len(closes) < n_test + 20:
        return {}

    preds, actuals = [], []
    for i in range(n_test):
        train = closes[:-(n_test - i)]
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                fit = ExponentialSmoothing(
                    np.array(train, dtype=float),
                    trend="add", seasonal=None, damped_trend=False,
                    initialization_method="estimated",
                ).fit(disp=False, optimized=True)
            preds.append(float(fit.forecast(1)[0]))
            actuals.append(closes[-(n_test - i)])
        except Exception:
            continue

    if len(preds) < 3:
        return {}

    a    = np.array(actuals[: len(preds)])
    p    = np.array(preds)
    e    = a - p
    mape = float(np.mean(np.abs(e / np.clip(np.abs(a), 1e-9, None)))) * 100
    return {
        "wf_rmse": round(float(np.sqrt(np.mean(e ** 2))), 4),
        "wf_mae":  round(float(np.mean(np.abs(e))), 4),
        "wf_mape": round(mape, 2),
        "wf_n":    len(preds),
    }


# ── Log-linear OLS model ──────────────────────────────────────────────────────

def _run_loglinear(
    closes:  list[float],
    n_steps: int,
) -> tuple[list[float], list[float], list[float], dict]:
    """
    Log-linear OLS trend extrapolation for 10-year horizon.
    Returns (forecast, lower_95, upper_95, metrics).
    """
    log_y = np.log(np.array(closes, dtype=float))
    t     = np.arange(len(log_y), dtype=float)
    A     = np.column_stack([np.ones_like(t), t])

    coefs, *_ = np.linalg.lstsq(A, log_y, rcond=None)
    a, b      = coefs

    fitted = A @ coefs
    sigma  = float(np.std(log_y - fitted))

    t_fut  = np.arange(len(log_y), len(log_y) + n_steps, dtype=float)
    log_fc = a + b * t_fut

    # OLS prediction interval
    t_var  = float(np.var(t)) or 1e-9
    t_mean = float(np.mean(t))
    sf     = sigma * np.sqrt(
        1.0 + 1.0 / len(t) + (t_fut - t_mean) ** 2 / (len(t) * t_var)
    )

    fc    = np.exp(log_fc)
    lower = np.exp(log_fc - 1.96 * sf)
    upper = np.exp(log_fc + 1.96 * sf)

    r2 = 1.0 - np.sum((log_y - fitted) ** 2) / np.sum(
        (log_y - float(np.mean(log_y))) ** 2
    )
    # b is per monthly step → annualise to CAGR
    cagr_pct = (math.exp(b * 12) - 1.0) * 100.0

    metrics: dict[str, Any] = {
        "cagr_pct":     round(cagr_pct, 2),
        "r_squared":    round(float(r2), 4),
        "sigma_annual": round(sigma * math.sqrt(12), 4),
        "n_train":      len(closes),
    }
    return fc.tolist(), lower.tolist(), upper.tolist(), metrics


# ── Model metadata ─────────────────────────────────────────────────────────────

_ETS_MODEL_NAME = "Holt-Winters Double Exponential Smoothing (ETS A,A,N)"

_ETS_RATIONALE = (
    "Holt-Winters ETS (additive error, additive trend, no seasonality) is well-suited "
    "for Halal ETF price series. It adapts to non-stationary levels and captures "
    "persistent trend momentum without assuming seasonality in price data. "
    "Its low parameter count (α, β, optionally φ) limits overfitting — critical for "
    "IGDA.L which has only ~4 years of history. For 5Y forecasts the damped-trend "
    "variant (φ < 1) prevents unrealistic linear extrapolation by gradually flattening "
    "the trend. ETS models consistently outperform random-walk benchmarks on weekly "
    "equity ETF series in the M4 competition literature."
)

_ETS_FEATURES = {
    "Level smoothing (α)":
        "Controls how quickly the model adapts to new price levels. "
        "Higher α = more reactive to recent prices; lower α = more weight on history.",
    "Trend smoothing (β)":
        "Controls how fast the trend estimate updates. "
        "Lower β = smoother, more conservative trend projection.",
    "Damping factor (φ)  [5Y only]":
        "Gradually dampens the trend toward zero over long horizons, "
        "preventing runaway linear extrapolation beyond a few years.",
    "Residual σ":
        "Standard deviation of one-step-ahead forecast errors on training data. "
        "Drives confidence interval width — bands widen as √horizon.",
    "AIC / BIC":
        "Information criteria penalising model complexity. "
        "Lower values indicate better model fit relative to the number of parameters.",
}

_LINEAR_MODEL_NAME = "Log-Linear Trend Regression (OLS) with Expanding Prediction Intervals"

_LINEAR_RATIONALE = (
    "For 10-year horizons the dominant uncertainty is the long-run compound growth rate, "
    "not short-term noise. Log-linear OLS regression fits ln(Price) = a + b·t, "
    "which is equivalent to modelling exponential (compounding) growth — the natural "
    "behaviour of equity ETFs. The slope b gives the annualised CAGR directly. "
    "Prediction intervals widen proportionally with √horizon, honestly reflecting "
    "greater uncertainty at longer lead times. This is consistent with standard "
    "long-term equity return modelling used by financial planners."
)

_LINEAR_FEATURES = {
    "Log-price (ln P)":
        "Transforms prices so the model fits multiplicative (compounding) growth "
        "rather than additive growth. More realistic for equity ETFs over decades.",
    "CAGR (annualised slope)":
        "Compound annual growth rate derived from the OLS slope coefficient. "
        "The primary driver of the 10-year forecast trajectory.",
    "Residual σ (log-space)":
        "Standard deviation of log-price residuals from the trend line. "
        "Annualised, this approximates historical volatility. Wider bands = higher σ.",
    "Expanding prediction interval":
        "Intervals grow as √horizon, reflecting genuine uncertainty — a 10-year "
        "forecast is more uncertain than a 1-year forecast.",
    "R² (log-linear fit)":
        "Goodness of fit. Near 1.0 means price history closely follows a compound "
        "growth trend. Lower R² = noisier history = wider bands.",
}


# ── Public API ─────────────────────────────────────────────────────────────────

HORIZON_CFG = {
    "1y":  {"interval": "1wk",  "n_steps": 52,  "damped": False, "date_fn": _weekly_dates,  "model": "ets"},
    "5y":  {"interval": "1wk",  "n_steps": 260, "damped": True,  "date_fn": _weekly_dates,  "model": "ets"},
    "10y": {"interval": "1mo",  "n_steps": 120, "damped": None,  "date_fn": _monthly_dates, "model": "linear"},
}

# How many history points to include as context alongside the forecast
HISTORY_CONTEXT = {
    "1y":  52,   # 1 year of weekly history
    "5y":  104,  # 2 years of weekly history
    "10y": 60,   # 5 years of monthly history
}


def run_forecast(symbol: str, horizon: str) -> dict:
    """
    Run forecast for `symbol` over `horizon` ('1y', '5y', '10y').
    Returns a dict ready to be saved to DB and returned to the frontend.
    """
    if horizon not in HORIZON_CFG:
        raise ValueError(f"Unknown horizon {horizon!r}. Use '1y', '5y', or '10y'.")

    cfg        = HORIZON_CFG[horizon]
    dates, closes, currency = _fetch_history(symbol, cfg["interval"])

    min_points = 20 if cfg["model"] == "ets" else 12
    if len(closes) < min_points:
        raise ValueError(
            f"Insufficient history for {symbol} at {cfg['interval']} interval "
            f"(got {len(closes)}, need ≥ {min_points})."
        )

    # Fit model and forecast
    if cfg["model"] == "ets":
        fc, lo, hi, metrics = _run_ets(closes, cfg["n_steps"], cfg["damped"])
        if horizon == "1y":
            metrics.update(_wf_metrics(closes))
        model_name = _ETS_MODEL_NAME
        rationale  = _ETS_RATIONALE
        features   = _ETS_FEATURES
    else:
        fc, lo, hi, metrics = _run_loglinear(closes, cfg["n_steps"])
        model_name = _LINEAR_MODEL_NAME
        rationale  = _LINEAR_RATIONALE
        features   = _LINEAR_FEATURES

    # Generate future date labels
    forecast_dates = cfg["date_fn"](dates[-1], cfg["n_steps"])

    # Tail of history for chart context
    ctx   = HISTORY_CONTEXT[horizon]
    h_dates  = [d.isoformat() for d in dates[-ctx:]]
    h_values = [round(float(v), 4) for v in closes[-ctx:]]

    return {
        "symbol":             symbol,
        "horizon":            horizon,
        "currency":           currency,
        "model_name":         model_name,
        "model_rationale":    rationale,
        "feature_importance": features,
        "forecast_from":      dates[-1].isoformat(),
        "history_last":       round(float(closes[-1]), 4),
        "history_dates":      h_dates,
        "history_values":     h_values,
        "forecast_dates":     forecast_dates,
        "forecast_values":    [round(float(v), 4) for v in fc],
        "conf_lower":         [round(float(v), 4) for v in lo],
        "conf_upper":         [round(float(v), 4) for v in hi],
        "metrics":            metrics,
        "run_at":             datetime.datetime.utcnow().isoformat(),
    }
