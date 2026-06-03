# ETF Forecast Pipeline — End-to-End Walkthrough

This document traces the ETF forecast feature from the moment the frontend issues a request through model fitting, validation, persistence, and retrieval. It walks through every function in [api/forecasting.py](../api/forecasting.py), plus the surrounding routing and storage layers.

---

## 0. High-level shape

```
Frontend (ETFWindow.jsx)
       │
       ▼  POST /api/etf/{symbol}/forecast?horizon=1y|5y|10y
FastAPI route  run_etf_forecast()             [api/main.py:540]
       │
       ▼  calls
api.forecasting.run_forecast(symbol, horizon) [api/forecasting.py:832]
       │
       ├─ _fetch_history()        ETF prices from Yahoo Finance
       ├─ _fetch_exogenous()      ^VIX, XLK, XLF, SPY context series
       ├─ _rebalance_flags()      MSCI/DJIM review-week flags
       ├─ _xlk_xlf_ratio()        Tech vs Financials relative strength
       ├─ _rolling_correlations() ETF vs SPY/VIX (26-week)
       ├─ _run_garch()            GARCH(1,1) per-step conditional std
       ├─ _detect_regime()        2-state HMM → ci_multiplier
       ├─ _run_ets() / _run_loglinear()   forecast + 95% CI
       ├─ _wf_metrics()           expanding-window walk-forward eval
       └─ _factor_regression()    Jensen α, β_market, β_tech
       │
       ▼  result dict
db.connector.save_etf_forecast()  → INSERT into etf_forecasts (JSONB columns)
       │
       ▼  response back to frontend → chart + diagnostics panels
```

The forecast is **multi-layer**: a point forecast (ETS or OLS), a confidence band built from blended volatility models (GARCH + residual floor) and scaled by a market-regime multiplier (HMM), validated honestly via multi-step walk-forward folds.

---

## 1. Entry points

### 1.1 HTTP route — [api/main.py:540](../api/main.py)

```python
@app.post("/api/etf/{symbol}/forecast")
def run_etf_forecast(symbol: str, horizon: str = Query("1y")):
```

- Uppercases the symbol.
- Calls `run_forecast(symbol, horizon)`. A `ValueError` (bad horizon, insufficient history) becomes HTTP 422; any other exception becomes HTTP 502 with the first 300 chars of the message.
- On success, persists the result via `db.connector.save_etf_forecast(...)` and returns the same dict to the client.
- A sibling `GET /api/etf/{symbol}/forecast` route ([api/main.py:586](../api/main.py)) returns the latest saved forecast (HTTP 404 if no row exists for that symbol+horizon).

### 1.2 Configuration table — [api/forecasting.py:818](../api/forecasting.py)

```python
HORIZON_CFG = {
    "1y":  {"interval": "1wk", "n_steps": 52,  "damped": False, "date_fn": _weekly_dates,  "model": "ets",    "wf_horizon": 1},
    "5y":  {"interval": "1wk", "n_steps": 260, "damped": True,  "date_fn": _weekly_dates,  "model": "ets",    "wf_horizon": 4},
    "10y": {"interval": "1mo", "n_steps": 120, "damped": None,  "date_fn": _monthly_dates, "model": "linear", "wf_horizon": 3},
}
HISTORY_CONTEXT = {"1y": 52, "5y": 104, "10y": 60}
```

- `1y` and `5y` use weekly bars; `10y` uses monthly bars.
- `1y` is undamped Holt-Winters, `5y` damped Holt-Winters, `10y` is log-linear OLS.
- `HISTORY_CONTEXT` controls how many historical points get returned alongside the forecast for charting context.

---

## 2. `run_forecast(symbol, horizon)` — orchestrator

Located at [api/forecasting.py:832](../api/forecasting.py). Executes the layers in order:

1. **Validate horizon** against `HORIZON_CFG` (raises `ValueError`).
2. **Fetch ETF history** via `_fetch_history(symbol, interval)`. Refuses to proceed if fewer than 20 (ETS) or 12 (OLS) bars exist.
3. **Fetch exogenous series** via `_fetch_exogenous(interval, len(closes))`.
4. **Shariah features**:
   - `_rebalance_flags(dates)` → annual mean × 100 = `rebalance_pressure_pct`.
   - `_xlk_xlf_ratio(exog)` → tech-vs-financials relative strength.
   - `_rolling_correlations(closes, exog)` → ETF vs SPY and ETF vs VIX.
5. **GARCH(1,1)** conditional std via `_run_garch(closes, n_steps)`.
6. **HMM regime** via `_detect_regime(closes, exog)`; pulls `ci_multiplier` (1.0 or 1.35).
7. **Fit the forecast model**:
   - ETS branch (1y/5y): `_run_ets(closes, n_steps, damped, garch_std, ci_mult)`.
   - OLS branch (10y): `_run_loglinear(closes, n_steps, ci_mult)`.
8. **Walk-forward validation** via `_wf_metrics(...)` merged into `metrics`.
9. **Factor regression** via `_factor_regression(closes, exog, interval)`.
10. **Assemble output dict** with backward-compatible keys plus three new enrichment keys: `regime`, `factors`, `shariah_features`.

The future date axis is built by the horizon's `date_fn` (weekly or monthly), starting from the last history date.

---

## 3. Function-by-function details

### 3.1 `_fetch_history(symbol, interval, timeout=20)` — [api/forecasting.py:45](../api/forecasting.py)

- Hits `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}` with `range=max` and the requested `interval` (`1wk` or `1mo`).
- Parses `chart.result[0]` — extracts timestamps, close prices, and currency.
- Drops `None` closes and de-duplicates by date.
- Sorts ascending, returns `(dates, closes, currency)`.
- Raises `ValueError` on empty/missing data.

### 3.2 `_fetch_exogenous(interval, n_points)` — [api/forecasting.py:91](../api/forecasting.py)

- Pulls four context symbols: `^VIX`, `XLK`, `XLF`, `SPY` at the same interval.
- Keeps only the **last `n_points`** of each to align with the ETF's tail.
- Requires at least `max(30, n_points // 4)` observations to accept a series.
- Silently skips any symbol that fails — downstream layers degrade gracefully when keys are missing.

### 3.3 Date helpers — [api/forecasting.py:122](../api/forecasting.py)

- `_weekly_dates(last, n)` — produces ISO strings for the next `n` weeks.
- `_monthly_dates(last, n)` — increments months, clamps day-of-month for short months (handles month-end correctly via `calendar.monthrange`).

### 3.4 `_rebalance_flags(dates)` — [api/forecasting.py:144](../api/forecasting.py)

- Returns `np.ndarray` of 1.0 where the bar falls in a known **Islamic-index review week**:
  - MSCI Islamic reviews: Feb / May / Aug / Nov.
  - DJIM reviews: Mar / Jun / Sep / Dec.
  - Flagged days = the 2nd and 3rd week of the month (days 8–24).
- The pipeline collapses the last 52 weeks of flags into `rebalance_pressure_pct` (mean × 100).

### 3.5 `_xlk_xlf_ratio(exog)` — [api/forecasting.py:164](../api/forecasting.py)

- `XLK_close[-1] / XLF_close[-1]`, rounded to 3 dp.
- Higher = tech-leading market, generally favourable for Shariah ETFs that overweight tech and exclude financials.
- Returns `None` if either symbol is missing.

### 3.6 `_rolling_correlations(closes, exog, window=26)` — [api/forecasting.py:177](../api/forecasting.py)

- Computes ETF **log returns** from `closes`.
- For each of `spy` and `vix`, computes log returns over the matching tail and Pearson correlation over the last `window` (default 26) overlapping returns.
- Skips a series if fewer than 5 overlapping points exist.
- Returns `{ "corr_vs_spy": …, "corr_vs_vix": … }` (any subset).

### 3.7 `_run_garch(closes, n_steps)` — [api/forecasting.py:210](../api/forecasting.py)

- Optional dependency on `arch`; if missing, returns `(None, {"garch_available": False})`.
- Computes log returns, scales them by 100 for numerical stability.
- Requires ≥ 30 observations; otherwise returns `None` with a diagnostic.
- Fits **GARCH(1,1)** with normal innovations: `arch_model(..., vol="Garch", p=1, q=1, dist="Normal", rescale=False)`.
- Forecasts `n_steps` of conditional variance, takes √, and divides by 100 to return per-step **log-return std**.
- Computes diagnostics:
  - `omega`, `alpha`, `beta`, `persistence = α + β`.
  - `long_run_annual_vol` (in %) from the unconditional variance `ω / (1 − persistence)` scaled to weekly→annual (× 52).
- On any fitting exception, returns `(None, {... "garch_fit": False, "reason": ...})`.

> Caller must **cumulate variance** across `h` steps to get a price-space std at horizon `h`:
> `price_std(h) ≈ last_price × √Σ_{k=1..h} garch_std[k]²`.

### 3.8 `_detect_regime(closes, exog)` — [api/forecasting.py:280](../api/forecasting.py)

- Optional dependency on `hmmlearn`; if missing returns neutral `ci_multiplier = 1.0`.
- Builds feature matrix:
  - Univariate: log returns of ETF, or
  - Bivariate: `[log_returns, vix_changes]` when `^VIX` is available.
- Standardises features (zero mean, unit variance — guarding against zero std).
- Fits 2-state Gaussian HMM with full covariance, 150 EM iterations, `random_state=42`.
- Identifies the **high-vol state** as the one with the larger mean diagonal covariance.
- Returns `current_state`, `is_high_vol`, `regime_label`, posterior `regime_prob`, and `ci_multiplier` (1.35 if high vol else 1.0).
- All failures collapse to neutral with `hmm_available: True/False` flag.

### 3.9 `_crps_gaussian(mu, sigma, y)` — [api/forecasting.py:371](../api/forecasting.py)

- Exact closed form for the Continuous Ranked Probability Score under N(μ, σ²):
  `CRPS = σ [z (2Φ(z)−1) + 2φ(z) − 1/√π]`.
- Used by walk-forward to reward sharpness **and** calibration.
- Falls back to `|y − μ| × 0.9` if `scipy` is unavailable.

### 3.10 `_run_ets(closes, n_steps, damped, garch_std=None, ci_mult=1.0)` — [api/forecasting.py:393](../api/forecasting.py)

- Fits Holt-Winters via `statsmodels.tsa.holtwinters.ExponentialSmoothing(trend="add", seasonal=None, damped_trend=damped, initialization_method="estimated").fit(optimized=True)`.
- Generates the **point forecast** `fit.forecast(n_steps)`.
- Builds the **95% confidence band** by blending two volatility sources:
  - `base_std = σ_resid × √h` — classical ETS floor that grows with horizon.
  - `garch_price_std = last_price × √Σ_{k=1..h} garch_std[k]²` — cumulative GARCH variance in price space.
  - `blended_std = max(garch_price_std, base_std) × ci_mult` — element-wise max, then HMM regime scaling.
- Band: `lower = max(0, fc − 1.96 × σ)`, `upper = fc + 1.96 × σ`.
- Metrics returned: `aic`, `bic`, `alpha`, `beta`, `sigma`, `n_train`, plus `phi` (damping) if damped.

### 3.11 `_run_loglinear(closes, n_steps, ci_mult=1.0)` — [api/forecasting.py:460](../api/forecasting.py)

- Used for the 10-year horizon.
- Fits **OLS in log-price space**: `log_y = a + b·t` via `np.linalg.lstsq`.
- Forecasts `n_steps` ahead on the time axis and exponentiates back.
- Builds a **standard regression prediction interval**:
  `sf = σ × √(1 + 1/n + (t_fut − t̄)² / (n × var(t))) × ci_mult`,
  bounds via `exp(log_fc ± 1.96 × sf)`.
- Reports `cagr_pct` (annualised — multiplies monthly slope by 12 and converts to %), `r_squared`, `sigma_annual = σ × √12`, and `n_train`.

### 3.12 `_factor_regression(closes, exog, interval)` — [api/forecasting.py:509](../api/forecasting.py)

- OLS regression of ETF log returns on a constant plus `SPY` and `XLK` log returns (whichever exist in `exog`):
  `r_etf ≈ α + β_market · r_spy + β_tech · r_xlk`.
- Trims to the shortest overlapping window.
- Computes:
  - `alpha_annualised_pct = (exp(α × ann) − 1) × 100`, where `ann = 52` (weekly) or `12` (monthly).
  - `beta_market`, `beta_tech` (if those regressors were present).
  - `r_squared` of the regression.
  - `tracking_error_pct = std(resid) × √ann × 100`.
  - `n_obs`.
- Returns `{}` if neither SPY nor XLK is available.

### 3.13 `_wf_metrics(closes, model, damped, target_h, interval)` — [api/forecasting.py:584](../api/forecasting.py)

This is the honesty layer — it forces the validation horizon to match the forecast horizon (capped by data availability).

**Horizon selection.** Starting from `target_h` (== `n_steps` for the chosen horizon), the function decrements `h` until both conditions hold:

- `train_min = max(floor, h)` points are available for training (`floor = 24` ETS, `12` OLS).
- At least `min_folds = 3` out-of-sample folds remain.

If even `h=1` cannot satisfy this, returns `{}`. The chosen `h` and a `wf_capped` flag are reported back so the UI never claims more validation than the data supports.

**Fold loop** (expanding window, stride 1, max 20 folds):

For each cutoff `c` from `first_cutoff` to `n − h`:
- `train = closes[:c]`, `prev_close = closes[c−1]`, `actual = closes[c+h−1]`.
- ETS branch: refits ETS on `train`, takes the `h`-th forecast step, σ floor `= σ_resid × √h`.
- OLS branch: refits log-linear trend, forecasts the `h`-th future step, converts log-space σ to price-space σ via delta method `σ_price = price × (exp(sf) − 1)`.

**Aggregated metrics** (returned merged into `metrics`):

| Key | Meaning |
| --- | --- |
| `wf_horizon_steps` | the actual `h` used |
| `wf_horizon_window` | human label (e.g. `"52 weeks"` or `"66 of 120 months"`) |
| `wf_capped` | `True` if `h < target_h` |
| `wf_n` | number of folds |
| `wf_rmse`, `wf_mae`, `wf_mape` | error in price units / % |
| `wf_da` | directional accuracy vs the previous close (%) |
| `wf_coverage` | % of actuals inside the 95% predicted band |
| `wf_crps` | mean Gaussian CRPS — sharpness + calibration |
| `wf_sharpe` | annualised Sharpe of a long-if-fc>prev / short-otherwise strategy. Annualisation factor `= √(ppy / h)` where `ppy ∈ {52, 12}`. |

### 3.14 Model metadata constants — [api/forecasting.py:744](../api/forecasting.py)

- `_ETS_MODEL_NAME`, `_ETS_RATIONALE`, `_ETS_FEATURES` — strings shown by the frontend explainer panel for ETS-based horizons.
- `_LINEAR_MODEL_NAME`, `_LINEAR_RATIONALE`, `_LINEAR_FEATURES` — same role for the 10-year OLS model.

These get embedded into the response under `model_name`, `model_rationale`, and `feature_importance`.

---

## 4. Output schema

`run_forecast` returns (and the route persists / returns):

```jsonc
{
  // Identity + axis
  "symbol": "...", "horizon": "1y|5y|10y", "currency": "...",
  "forecast_from": "YYYY-MM-DD", "run_at": "<UTC ISO>",

  // Model identity (for UI explainer)
  "model_name": "...", "model_rationale": "...", "feature_importance": {...},

  // History context (for chart prefix)
  "history_last": <float>, "history_dates": [...], "history_values": [...],

  // Forecast + 95% blended CI
  "forecast_dates": [...], "forecast_values": [...],
  "conf_lower": [...], "conf_upper": [...],

  // Diagnostics + validation
  "metrics": {
    // model params (ETS: aic,bic,alpha,beta,sigma[,phi] | OLS: cagr_pct,r_squared,sigma_annual)
    // GARCH flatten: garch_persistence, garch_annual_vol_pct, garch_available, garch_fit
    // Walk-forward: wf_horizon_steps, wf_horizon_window, wf_capped, wf_n,
    //               wf_rmse, wf_mae, wf_mape, wf_da, wf_coverage, wf_crps, wf_sharpe
  },

  // Enrichment
  "regime":           { current_state, is_high_vol, ci_multiplier, regime_label, regime_prob, hmm_available },
  "factors":          { alpha_annualised_pct, beta_market, beta_tech, r_squared, tracking_error_pct, n_obs },
  "shariah_features": { rebalance_pressure_pct, xlk_xlf_ratio, corr_vs_spy, corr_vs_vix }
}
```

---

## 5. Persistence

[db/connector.py:464](../db/connector.py) `save_etf_forecast(...)` performs an `INSERT ... RETURNING id::text` into the `etf_forecasts` table defined in [etf_forecasts_migration.sql](../etf_forecasts_migration.sql).

Columns of note (all JSONB unless flagged):

- `symbol TEXT`, `horizon TEXT`, `model_name TEXT`, `model_rationale TEXT`, `currency TEXT`.
- `forecast_from DATE`.
- `forecast_dates`, `forecast_values`, `conf_lower`, `conf_upper`, `history_dates`, `history_values`.
- `metrics`, `feature_importance`.
- `regime`, `factors`, `shariah_features` — added idempotently for older deployments via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- `created_at TIMESTAMPTZ DEFAULT NOW()`.

Index `idx_etf_forecasts_lookup` on `(symbol, horizon, created_at DESC)` powers the latest-row lookup.

[db/connector.py:514](../db/connector.py) `get_etf_forecast(symbol, horizon)` selects the most recent row for that pair, formatting `created_at` as `run_at` `YYYY-MM-DD HH24:MI` for the UI.

---

## 6. Frontend consumption

[frontend/src/components/ETFWindow.jsx](../frontend/src/components/ETFWindow.jsx) consumes the response:

- Merges `history_*` and `forecast_*` arrays into a single chart series with a 95% CI band (`band_lower` / `band_height` for stacked rendering).
- Surfaces `model_name`, `model_rationale`, and `feature_importance` to a model-info side panel.
- Renders the diagnostic blocks: `metrics`, `regime`, `factors`, `shariah_features`. Each metric has an `intuitive` description and a `range` hint so users can interpret numbers without statistical background.
- A textual walkthrough mirrors the same step order described above (fetch → exogenous → Shariah features → GARCH → HMM → fit → validate).

---

## 7. Graceful-degradation summary

The pipeline is engineered so each optional component can fail without blocking the response:

| Component | Optional dep | Fallback |
| --- | --- | --- |
| GARCH conditional CI | `arch` | use ETS residual σ floor only |
| HMM regime detection | `hmmlearn` | `ci_multiplier = 1.0` (neutral) |
| CRPS exact formula | `scipy` | `|y − μ| × 0.9` approximation |
| Exogenous series | network / Yahoo | silently dropped; shariah_features, factor regression, and HMM-with-VIX degrade key by key |
| Walk-forward at full horizon | history length | `h` is reduced; `wf_capped: true` flagged in the response |

The only hard prerequisites are: a valid symbol, ≥ 20 weekly bars (ETS) or ≥ 12 monthly bars (OLS), and that `statsmodels` / `numpy` / `requests` are importable.
