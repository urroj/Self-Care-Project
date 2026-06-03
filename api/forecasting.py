"""
api/forecasting.py — ETF price forecast pipeline.

Horizon mapping
---------------
  1y  → Holt-Winters ETS (no damping) on weekly data, 52 steps forward
  5y  → Holt-Winters ETS (damped trend) on weekly data, 260 steps forward
  10y → Log-linear OLS trend on monthly data, 120 steps forward

Confidence bands: 95% blended intervals.
  ETS    — GARCH(1,1) conditional std blended with residual σ floor,
            scaled by HMM regime multiplier (1.35× in high-vol regime).
  OLS    — standard regression prediction interval, regime-scaled.

Exogenous context : ^VIX, XLK, XLF, SPY fetched alongside ETF history.
Shariah features  : MSCI/DJIM rebalance proximity flags, XLK/XLF ratio,
                    rolling correlations with SPY and ^VIX.
Factor regression : α (Jensen's alpha), β_market (SPY), β_tech (XLK).
Walk-forward      : expanding-window, multi-step OOS validated at the model's
                    own forecast horizon (capped by available history);
                    metrics: RMSE, MAE, MAPE, DA%, signal Sharpe, CRPS, CI coverage.

Optional dependencies (graceful fallback if missing):
  arch>=5.6.0      → GARCH(1,1) volatility CI
  hmmlearn>=0.3.0  → 2-state HMM regime detection
  scipy            → exact CRPS formula (falls back to approximation)
"""

from __future__ import annotations

import calendar
import datetime
import math
import warnings
from typing import Any, Optional

import numpy as np
import requests

warnings.filterwarnings("ignore")


# ── Yahoo Finance data fetcher ─────────────────────────────────────────────────

def _fetch_history(
    symbol:   str,
    interval: str,
    timeout:  int = 20,
) -> tuple[list[datetime.date], list[float], str]:
    """Fetch max available history.  Returns (dates, closes, currency)."""
    url     = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    params  = {"range": "max", "interval": interval, "includePrePost": "false"}

    resp = requests.get(url, headers=headers, params=params, timeout=timeout)
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

    dates:  list[datetime.date] = []
    closes: list[float]         = []
    seen:   set[datetime.date]  = set()
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

    pairs  = sorted(zip(dates, closes), key=lambda x: x[0])
    dates  = [p[0] for p in pairs]
    closes = [p[1] for p in pairs]
    return dates, closes, currency


def _fetch_exogenous(interval: str, n_points: int) -> dict[str, list[float]]:
    """
    Fetch exogenous context series at the same interval as the ETF and return
    the last *n_points* of each, aligned to the ETF's most-recent window.

    Keys returned (any subset may be absent if fetching fails):
        'vix'  → ^VIX  (implied volatility index)
        'xlk'  → XLK   (Technology Select Sector SPDR)
        'xlf'  → XLF   (Financial Select Sector SPDR)
        'spy'  → SPY   (S&P 500 benchmark)

    Each failed symbol is skipped silently — all downstream functions
    treat missing keys as unavailable and degrade gracefully.
    """
    SYMBOLS      = {"vix": "^VIX", "xlk": "XLK", "xlf": "XLF", "spy": "SPY"}
    min_accept   = max(30, n_points // 4)
    result: dict[str, list[float]] = {}

    for key, sym in SYMBOLS.items():
        try:
            _, closes, _ = _fetch_history(sym, interval, timeout=10)
            if len(closes) >= min_accept:
                result[key] = closes[-n_points:]   # align tail to ETF end
        except Exception:
            pass

    return result


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
        m   = d.month + 1
        y   = d.year + (1 if m > 12 else 0)
        m   = m if m <= 12 else 1
        day = min(d.day, calendar.monthrange(y, m)[1])
        d   = d.replace(year=y, month=m, day=day)
        out.append(d.isoformat())
    return out


# ── Shariah-specific feature engineering ──────────────────────────────────────

def _rebalance_flags(dates: list[datetime.date]) -> np.ndarray:
    """
    Binary flag (1.0) for each week that falls inside the typical window when
    MSCI Islamic and DJIM index rebalancing creates reweighting pressure.

    Review months
    -------------
    MSCI Islamic : February, May, August, November  (semi-annual + quarterly)
    DJIM         : March, June, September, December

    The second and third weeks of each review month (days 8–24) are flagged.
    """
    REVIEW_MONTHS = {2, 3, 5, 6, 8, 9, 11, 12}
    flags = np.zeros(len(dates), dtype=float)
    for i, d in enumerate(dates):
        if d.month in REVIEW_MONTHS and 8 <= d.day <= 24:
            flags[i] = 1.0
    return flags


def _xlk_xlf_ratio(exog: dict[str, list[float]]) -> Optional[float]:
    """
    Technology-to-Financials relative strength (XLK / XLF).
    Higher values indicate a tech-heavy market environment — typically
    favourable for Halal ETFs that overweight tech and exclude financials.
    """
    xlk = exog.get("xlk", [])
    xlf = exog.get("xlf", [])
    if xlk and xlf and xlf[-1] > 0:
        return round(xlk[-1] / xlf[-1], 3)
    return None


def _rolling_correlations(
    closes: list[float],
    exog:   dict[str, list[float]],
    window: int = 26,
) -> dict[str, float]:
    """
    26-week rolling Pearson correlation of ETF log returns vs:
      'corr_vs_spy' — market benchmark (positive exposure expected)
      'corr_vs_vix' — fear index (typically negative for equity ETFs)
    """
    arr  = np.array(closes, dtype=float)
    rets = np.diff(np.log(arr))
    result: dict[str, float] = {}

    for key, label in [("spy", "corr_vs_spy"), ("vix", "corr_vs_vix")]:
        vals = exog.get(key, [])
        if len(vals) < len(rets) + 1:
            continue
        exog_rets = np.diff(
            np.log(np.clip(np.array(vals[-(len(rets) + 1):], dtype=float), 1e-9, None))
        )
        n = min(len(rets), len(exog_rets), window)
        if n < 5:
            continue
        r = float(np.corrcoef(rets[-n:], exog_rets[-n:])[0, 1])
        if not math.isnan(r):
            result[label] = round(r, 3)

    return result


# ── GARCH(1,1) conditional volatility ─────────────────────────────────────────

def _run_garch(
    closes:  list[float],
    n_steps: int,
) -> tuple[Optional[np.ndarray], dict]:
    """
    Fit GARCH(1,1) on scaled log returns and forecast conditional volatility.

    Returns
    -------
    garch_std : np.ndarray shape [n_steps], per-step conditional std in
                log-return space (NOT cumulative).  None on failure.
    meta      : diagnostics dict (omega, alpha, beta, persistence, …).

    Returns are in units of raw log-returns. Multiply by 100 internally for
    numerical stability during fitting; output is divided back.

    The caller must accumulate variance over h steps for a multi-period CI:
        price_std(h) ≈ last_price × √Σ_{k=1}^{h} garch_std[k]²
    """
    try:
        from arch import arch_model  # type: ignore
    except ImportError:
        return None, {"garch_available": False}

    arr      = np.array(closes, dtype=float)
    log_rets = np.diff(np.log(arr)) * 100.0   # scale to % for numerical stability

    if len(log_rets) < 30:
        return None, {"garch_available": True, "garch_fit": False, "reason": "insufficient data"}

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            gm  = arch_model(log_rets, vol="Garch", p=1, q=1, dist="Normal", rescale=False)
            res = gm.fit(disp="off")

        fc      = res.forecast(horizon=n_steps, reindex=False)
        var_fc  = fc.variance.values[-1].astype(float)       # [n_steps], units: (%log_ret)²
        std_fc  = np.sqrt(np.maximum(var_fc, 1e-12)) / 100.0 # back to log-return units

        omega       = float(res.params.get("omega", 0.0))
        alpha       = float(res.params.get("alpha[1]", 0.0))
        beta        = float(res.params.get("beta[1]",  0.0))
        persistence = alpha + beta

        lr_var_pct  = (omega / max(1.0 - persistence, 1e-6)
                       if persistence < 1.0 else float(np.var(log_rets)))
        lr_ann_vol  = float(math.sqrt(lr_var_pct / 10_000.0 * 52.0)) * 100.0

        meta: dict[str, Any] = {
            "garch_available":     True,
            "garch_fit":           True,
            "omega":               round(omega, 6),
            "alpha":               round(alpha, 4),
            "beta":                round(beta,  4),
            "persistence":         round(persistence, 4),
            "long_run_annual_vol": round(lr_ann_vol, 2),
        }
        return std_fc, meta

    except Exception as exc:
        return None, {
            "garch_available": True,
            "garch_fit":       False,
            "reason":          str(exc)[:120],
        }


# ── HMM regime detection ───────────────────────────────────────────────────────

def _detect_regime(
    closes: list[float],
    exog:   dict[str, list[float]],
) -> dict[str, Any]:
    """
    2-state GaussianHMM on (weekly log returns [, VIX changes if available]).
    Identifies low-volatility and high-volatility market regimes.

    Returns
    -------
    current_state : int   — 0 or 1 (arbitrary label from HMM)
    is_high_vol   : bool  — True if current_state is the high-variance state
    ci_multiplier : float — 1.35 in high-vol regime, 1.0 in low-vol
    regime_label  : str   — 'high-volatility' | 'low-volatility' | 'unknown'
    regime_prob   : float — posterior probability of being in current_state
    hmm_available : bool

    Falls back to neutral values (ci_multiplier=1.0) if hmmlearn is missing
    or fitting fails.
    """
    neutral: dict[str, Any] = {
        "current_state":  0,
        "is_high_vol":    False,
        "ci_multiplier":  1.0,
        "regime_label":   "unknown",
        "regime_prob":    1.0,
        "hmm_available":  False,
    }

    try:
        from hmmlearn.hmm import GaussianHMM  # type: ignore
    except ImportError:
        return neutral

    arr  = np.array(closes, dtype=float)
    rets = np.diff(np.log(arr))
    if len(rets) < 30:
        return {**neutral, "hmm_available": True}

    # Build bivariate feature matrix if VIX is available
    vix_vals = exog.get("vix", [])
    if len(vix_vals) >= len(rets) + 1:
        vix_arr     = np.array(vix_vals[-(len(rets) + 1):], dtype=float)
        vix_changes = np.diff(vix_arr)
        n           = min(len(rets), len(vix_changes))
        X           = np.column_stack([rets[-n:], vix_changes[-n:]])
    else:
        n = len(rets)
        X = rets.reshape(-1, 1)

    # Standardise (unit variance, zero mean)
    X_std  = np.where(np.std(X, axis=0) < 1e-9, 1.0, np.std(X, axis=0))
    X_norm = (X - np.mean(X, axis=0)) / X_std

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            hmm = GaussianHMM(
                n_components=2,
                covariance_type="full",
                n_iter=150,
                random_state=42,
            )
            hmm.fit(X_norm)

        states        = hmm.predict(X_norm)
        current_state = int(states[-1])
        probs         = hmm.predict_proba(X_norm)
        current_prob  = float(probs[-1, current_state])

        # High-vol state = larger mean diagonal covariance
        var0           = float(np.mean(np.diag(hmm.covars_[0])))
        var1           = float(np.mean(np.diag(hmm.covars_[1])))
        high_vol_state = 0 if var0 > var1 else 1
        is_high_vol    = bool(current_state == high_vol_state)

        return {
            "current_state":  current_state,
            "is_high_vol":    is_high_vol,
            "ci_multiplier":  1.35 if is_high_vol else 1.0,
            "regime_label":   "high-volatility" if is_high_vol else "low-volatility",
            "regime_prob":    round(current_prob, 3),
            "hmm_available":  True,
        }

    except Exception:
        return {**neutral, "hmm_available": True}


# ── CRPS for Gaussian predictive distributions ─────────────────────────────────

def _crps_gaussian(mu: float, sigma: float, y: float) -> float:
    """
    Continuous Ranked Probability Score for N(μ, σ²) vs observed y.

        CRPS = σ [ z(2Φ(z)−1) + 2φ(z) − 1/√π ]

    where z = (y−μ)/σ, Φ = standard-normal CDF, φ = standard-normal PDF.
    Lower is better.  Falls back to |y−μ|×0.9 if scipy is absent.
    """
    if sigma <= 1e-9:
        return abs(y - mu)
    try:
        from scipy.stats import norm  # type: ignore
        z    = (y - mu) / sigma
        crps = sigma * (z * (2.0 * norm.cdf(z) - 1.0) + 2.0 * norm.pdf(z) - 1.0 / math.sqrt(math.pi))
        return float(crps)
    except ImportError:
        return abs(y - mu) * 0.90   # rough approximation


# ── ETS model ─────────────────────────────────────────────────────────────────

def _run_ets(
    closes:    list[float],
    n_steps:   int,
    damped:    bool,
    garch_std: Optional[np.ndarray] = None,
    ci_mult:   float = 1.0,
) -> tuple[list[float], list[float], list[float], dict]:
    """
    Fit Holt-Winters ETS (additive trend, no seasonal) and forecast n_steps.

    CI blending
    -----------
    Base CI     : residual σ × √h  (classical ETS floor)
    GARCH CI    : last_price × √(Σ_{k=1}^{h} garch_std[k]²)  (cumulative vol)
    Blended std : max(GARCH_price_std, ETS_base_std) × ci_mult
    ci_mult     : 1.35 in high-vol HMM regime, else 1.0

    Returns (forecast, lower_95, upper_95, metrics).
    """
    from statsmodels.tsa.holtwinters import ExponentialSmoothing  # type: ignore

    arr = np.array(closes, dtype=float)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = ExponentialSmoothing(
            arr,
            trend="add",
            seasonal=None,
            damped_trend=damped,
            initialization_method="estimated",
        ).fit(optimized=True)

    fc_vals  = np.array(fit.forecast(n_steps), dtype=float)
    sigma    = float(np.std(fit.resid))
    h        = np.arange(1, n_steps + 1, dtype=float)
    base_std = sigma * np.sqrt(h)

    if garch_std is not None and len(garch_std) == n_steps:
        # Cumulate per-step GARCH variance → price-space std at each horizon
        cumul_var       = np.cumsum(garch_std ** 2)
        last_price      = float(closes[-1])
        garch_price_std = last_price * np.sqrt(cumul_var)
        blended_std     = np.maximum(garch_price_std, base_std)
    else:
        blended_std = base_std

    blended_std = blended_std * ci_mult
    lower = np.clip(fc_vals - 1.96 * blended_std, 0.0, None)
    upper = fc_vals + 1.96 * blended_std

    params  = fit.params
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


# ── Log-linear OLS model ──────────────────────────────────────────────────────

def _run_loglinear(
    closes:  list[float],
    n_steps: int,
    ci_mult: float = 1.0,
) -> tuple[list[float], list[float], list[float], dict]:
    """
    Log-linear OLS trend extrapolation for the 10-year horizon.
    ci_mult scales the prediction interval (1.35× in high-vol HMM regime).
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

    t_var  = float(np.var(t)) or 1e-9
    t_mean = float(np.mean(t))
    sf = sigma * np.sqrt(
        1.0 + 1.0 / len(t) + (t_fut - t_mean) ** 2 / (len(t) * t_var)
    ) * ci_mult                      # ← regime multiplier applied here

    fc    = np.exp(log_fc)
    lower = np.exp(log_fc - 1.96 * sf)
    upper = np.exp(log_fc + 1.96 * sf)

    r2 = 1.0 - np.sum((log_y - fitted) ** 2) / np.sum(
        (log_y - float(np.mean(log_y))) ** 2
    )
    cagr_pct = (math.exp(b * 12) - 1.0) * 100.0

    metrics: dict[str, Any] = {
        "cagr_pct":     round(cagr_pct, 2),
        "r_squared":    round(float(r2), 4),
        "sigma_annual": round(sigma * math.sqrt(12), 4),
        "n_train":      len(closes),
    }
    return fc.tolist(), lower.tolist(), upper.tolist(), metrics


# ── Factor regression ─────────────────────────────────────────────────────────

def _factor_regression(
    closes:   list[float],
    exog:     dict[str, list[float]],
    interval: str = "1wk",
) -> dict[str, Any]:
    """
    OLS factor regression on log returns:
        r_etf ~ α + β_market · r_spy + β_tech · r_xlk

    Returns
    -------
    alpha_annualised_pct : Jensen's alpha converted to annual %
    beta_market          : sensitivity to S&P 500 (SPY)
    beta_tech            : sensitivity to Technology sector (XLK)
    r_squared            : regression R²
    tracking_error_pct   : annualised std of residuals (%)
    n_obs                : number of overlapping return observations

    Returns empty dict if neither SPY nor XLK is available in exog.
    alpha_annualised = (exp(α_per_period × ann_factor) − 1) × 100%
    """
    arr   = np.array(closes, dtype=float)
    r_etf = np.diff(np.log(arr))
    n     = len(r_etf)
    ann   = 52 if interval == "1wk" else 12

    regressors: dict[str, np.ndarray] = {}
    for key in ("spy", "xlk"):
        vals = exog.get(key, [])
        if len(vals) >= n + 1:
            v = np.clip(np.array(vals[-(n + 1):], dtype=float), 1e-9, None)
            regressors[key] = np.diff(np.log(v))

    if not regressors:
        return {}

    min_len = min(n, min(len(v) for v in regressors.values()))
    r_etf   = r_etf[-min_len:]
    cols    = [np.ones(min_len, dtype=float)]
    names   = ["intercept"]
    for key in ("spy", "xlk"):
        if key in regressors:
            cols.append(regressors[key][-min_len:])
            names.append(key)

    A = np.column_stack(cols)
    try:
        coefs, *_ = np.linalg.lstsq(A, r_etf, rcond=None)
    except Exception:
        return {}

    fitted = A @ coefs
    ss_res = float(np.sum((r_etf - fitted) ** 2))
    ss_tot = float(np.sum((r_etf - float(np.mean(r_etf))) ** 2))
    r2     = 1.0 - ss_res / max(ss_tot, 1e-12)

    alpha_pp     = float(coefs[0])
    alpha_annual = (math.exp(alpha_pp * ann) - 1.0) * 100.0
    te           = float(np.std(r_etf - fitted)) * math.sqrt(ann) * 100.0

    result: dict[str, Any] = {
        "alpha_annualised_pct": round(alpha_annual, 2),
        "r_squared":            round(float(r2), 4),
        "tracking_error_pct":   round(te, 2),
        "n_obs":                min_len,
    }
    if "spy" in regressors:
        result["beta_market"] = round(float(coefs[names.index("spy")]), 3)
    if "xlk" in regressors:
        result["beta_tech"]   = round(float(coefs[names.index("xlk")]), 3)
    return result


# ── Walk-forward validation ───────────────────────────────────────────────────

def _wf_metrics(
    closes:    list[float],
    model:     str  = "ets",
    damped:    bool = False,
    target_h:  int  = 1,
    interval:  str  = "1wk",
) -> dict[str, Any]:
    """
    Expanding-window, genuine MULTI-step walk-forward validation.

    The model is validated at the same horizon it forecasts (``target_h``
    steps ahead), capped by how much history is available. With short series
    the achievable horizon ``h`` is reduced so that at least ``min_folds``
    out-of-sample tests remain — the real ``h`` used is reported back so the
    UI never implies more validation than the data actually supports.

    At each fold (expanding window, stride 1):
      • Train on all data up to a cutoff ``c``.
      • Forecast ``h`` steps and compare the h-th step to the realised price.
      • Collect forecast, actual, h-step σ, and the last observed close.

    Metrics
    -------
    wf_horizon_steps  : steps actually validated ahead (h)
    wf_horizon_window : human label, e.g. "52 weeks" or "66 of 120 months"
    wf_capped         : True if h was reduced below target_h by short history
    wf_n              : number of out-of-sample folds
    wf_rmse / wf_mae  : error in price units · wf_mape in %
    wf_da             : directional accuracy over the h-step horizon (%)
    wf_coverage       : % of actuals inside the predicted 95% CI
    wf_crps           : mean CRPS — rewards sharpness + calibration
    wf_sharpe         : annualised Sharpe of the forecast-direction signal
    """
    from statsmodels.tsa.holtwinters import ExponentialSmoothing  # type: ignore

    n          = len(closes)
    floor      = 24 if model == "ets" else 12   # minimum training points
    min_folds  = 3
    max_folds  = 20

    # Pick the largest horizon h ≤ target where we can both (a) train on at
    # least h points and (b) keep ≥ min_folds out-of-sample folds. Requiring
    # train ≥ h stops us "validating" a 5y forecast from 1y of training data.
    h = 0
    for cand in range(min(int(target_h), n), 0, -1):
        train_min = max(floor, cand)
        folds     = (n - cand) - train_min + 1       # cutoffs train_min .. n-cand
        if folds >= min_folds:
            h = cand
            break
    if h < 1:
        return {}

    min_train    = max(floor, h)
    last_cutoff  = n - h
    first_cutoff = max(min_train, last_cutoff - max_folds + 1)

    preds:   list[float] = []
    actuals: list[float] = []
    sigmas:  list[float] = []
    prevs:   list[float] = []

    for c in range(first_cutoff, last_cutoff + 1):
        if c < min_train or c + h - 1 > n - 1:
            continue
        train      = closes[:c]
        prev_close = float(closes[c - 1])
        actual     = float(closes[c + h - 1])    # h-step ahead

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                if model == "ets":
                    fit   = ExponentialSmoothing(
                        np.array(train, dtype=float),
                        trend="add", seasonal=None, damped_trend=damped,
                        initialization_method="estimated",
                    ).fit(optimized=True)
                    pred  = float(np.array(fit.forecast(h), dtype=float)[-1])   # h-step ahead
                    sigma = float(np.std(fit.resid)) * math.sqrt(h)             # h-step ETS floor

                else:  # log-linear
                    log_y = np.log(np.array(train, dtype=float))
                    t_arr = np.arange(len(log_y), dtype=float)
                    A     = np.column_stack([np.ones_like(t_arr), t_arr])
                    coefs, *_ = np.linalg.lstsq(A, log_y, rcond=None)
                    a_c, b_c  = coefs
                    fitted_log = A @ coefs
                    sigma_log  = float(np.std(log_y - fitted_log))
                    t_target   = float(len(log_y) + h - 1)   # h-th future step
                    log_pred   = a_c + b_c * t_target
                    pred       = float(np.exp(log_pred))
                    t_var      = float(np.var(t_arr)) or 1e-9
                    t_mean_v   = float(np.mean(t_arr))
                    sf = sigma_log * math.sqrt(
                        1.0 + 1.0 / len(t_arr)
                        + (t_target - t_mean_v) ** 2 / (len(t_arr) * t_var)
                    )
                    sigma = pred * (math.exp(sf) - 1.0)  # price-space std via delta method

            preds.append(pred)
            actuals.append(actual)
            sigmas.append(max(float(sigma), 1e-9))
            prevs.append(prev_close)

        except Exception:
            continue

    if len(preds) < 3:
        return {}

    a  = np.array(actuals, dtype=float)
    p  = np.array(preds,   dtype=float)
    s  = np.array(sigmas,  dtype=float)
    pr = np.array(prevs,   dtype=float)
    e  = a - p

    mape = float(np.mean(np.abs(e / np.clip(np.abs(a), 1e-9, None)))) * 100.0

    # Directional accuracy
    pred_dir = np.sign(p - pr)
    true_dir = np.sign(a - pr)
    da = float(np.mean(pred_dir == true_dir)) * 100.0

    # Signal Sharpe (annualised) — long when fc > prev, short otherwise
    signal     = np.where(p > pr, 1.0, -1.0)
    ret        = (a - pr) / np.clip(np.abs(pr), 1e-9, None)
    sig_ret    = signal * ret
    std_sr     = float(np.std(sig_ret))
    ppy        = 52.0 if interval == "1wk" else 12.0     # periods per year
    ann_factor = math.sqrt(max(ppy / h, 1e-9))           # each return spans h periods
    sharpe     = (float(np.mean(sig_ret)) / std_sr * ann_factor) if std_sr > 1e-9 else 0.0

    # Mean CRPS
    avg_crps = float(np.mean(
        [_crps_gaussian(float(p[i]), float(s[i]), float(a[i])) for i in range(len(p))]
    ))

    # 95% CI coverage
    covered  = int(np.sum((a >= p - 1.96 * s) & (a <= p + 1.96 * s)))
    coverage = covered / len(a) * 100.0

    unit = "weeks" if interval == "1wk" else "months"
    return {
        "wf_horizon_steps":  h,
        "wf_horizon_window": f"{h} {unit}" if h >= int(target_h) else f"{h} of {int(target_h)} {unit}",
        "wf_capped":         h < int(target_h),
        "wf_n":        len(preds),
        "wf_rmse":     round(float(np.sqrt(np.mean(e ** 2))), 4),
        "wf_mae":      round(float(np.mean(np.abs(e))), 4),
        "wf_mape":     round(mape, 2),
        "wf_da":       round(da, 1),
        "wf_coverage": round(coverage, 1),
        "wf_crps":     round(avg_crps, 4),
        "wf_sharpe":   round(sharpe, 3),
    }


# ── Model metadata ─────────────────────────────────────────────────────────────

_ETS_MODEL_NAME = "Holt-Winters Double Exponential Smoothing (ETS A,A,N)"

_ETS_RATIONALE = (
    "Holt-Winters ETS (additive error, additive trend, no seasonality) is well-suited "
    "for Halal ETF price series. It adapts to non-stationary levels and captures "
    "persistent trend momentum without assuming seasonality in price data. "
    "Its low parameter count (α, β, optionally φ) limits overfitting — critical for "
    "ETFs with short history. For 5Y forecasts the damped-trend variant (φ < 1) "
    "prevents unrealistic linear extrapolation by gradually flattening the trend. "
    "Confidence intervals are GARCH(1,1)-blended and regime-scaled: wider in "
    "high-volatility regimes detected by the Hidden Markov Model layer."
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
    "Residual σ (ETS floor)":
        "Standard deviation of one-step-ahead ETS forecast errors. "
        "Acts as a floor for the CI — GARCH widens further when vol is elevated.",
    "GARCH(1,1) CI":
        "Conditional heteroscedasticity model. Captures volatility clustering — "
        "bands widen after turbulent periods and narrow after calm ones. "
        "Cumulative GARCH variance drives the CI across all horizons.",
    "HMM regime multiplier":
        "2-state Hidden Markov Model identifies low- vs high-volatility regimes. "
        "CI is scaled by 1.35× when the market is in the high-vol state.",
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
    "Prediction intervals widen proportionally with √horizon (plus a regime-scale "
    "multiplier in high-vol periods), honestly reflecting greater uncertainty at "
    "longer lead times."
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
    "HMM regime multiplier":
        "Prediction interval scaled by 1.35× in the high-vol regime; "
        "1.0× in the low-vol regime.",
    "Expanding prediction interval":
        "Intervals grow as √horizon, reflecting genuine uncertainty — a 10-year "
        "forecast is more uncertain than a 1-year forecast.",
    "R² (log-linear fit)":
        "Goodness of fit. Near 1.0 means price history closely follows a compound "
        "growth trend. Lower R² = noisier history = wider bands.",
}


# ── Public API ─────────────────────────────────────────────────────────────────

HORIZON_CFG: dict[str, Any] = {
    "1y":  {"interval": "1wk",  "n_steps": 52,  "damped": False, "date_fn": _weekly_dates,  "model": "ets",    "wf_horizon": 1},
    "5y":  {"interval": "1wk",  "n_steps": 260, "damped": True,  "date_fn": _weekly_dates,  "model": "ets",    "wf_horizon": 4},
    "10y": {"interval": "1mo",  "n_steps": 120, "damped": None,  "date_fn": _monthly_dates, "model": "linear", "wf_horizon": 3},
}

# How many history points to include as context alongside the forecast
HISTORY_CONTEXT: dict[str, int] = {
    "1y":  52,    # 1 year of weekly history
    "5y":  104,   # 2 years of weekly history
    "10y": 60,    # 5 years of monthly history
}


def run_forecast(symbol: str, horizon: str) -> dict:
    """
    Multi-layer forecast for `symbol` over `horizon` ('1y', '5y', '10y').

    Pipeline
    --------
    1. Fetch ETF price history (weekly or monthly, max available).
    2. Fetch exogenous context: ^VIX, XLK, XLF, SPY (10-second timeout; optional).
    3. Shariah feature engineering: rebalance flags, XLK/XLF ratio, rolling correlations.
    4. GARCH(1,1): time-varying per-step conditional std for CI construction.
    5. 2-state HMM: detect low/high-vol regime → ci_multiplier (1.0 or 1.35).
    6. ETS or OLS with blended GARCH+floor CI, scaled by ci_multiplier.
    7. Walk-forward OOS validation on all three horizons:
       RMSE, MAE, MAPE, DA%, signal Sharpe, CRPS, 95% CI coverage.
    8. Factor regression: Jensen's alpha, β_market (SPY), β_tech (XLK).
    9. Assemble backward-compatible output + enrichment keys.

    Returns a dict ready to be stored and returned to the frontend.
    Backward-compatible: all keys present in the original format are preserved.
    New enrichment keys: 'regime', 'factors', 'shariah_features'.
    """
    if horizon not in HORIZON_CFG:
        raise ValueError(f"Unknown horizon {horizon!r}. Use '1y', '5y', or '10y'.")

    cfg = HORIZON_CFG[horizon]
    dates, closes, currency = _fetch_history(symbol, cfg["interval"])

    min_points = 20 if cfg["model"] == "ets" else 12
    if len(closes) < min_points:
        raise ValueError(
            f"Insufficient history for {symbol} at {cfg['interval']} interval "
            f"(got {len(closes)}, need ≥ {min_points})."
        )

    # ── Layer 1 & 2: Exogenous data + Shariah features ──────────────────────
    exog         = _fetch_exogenous(cfg["interval"], len(closes))
    flags        = _rebalance_flags(dates)
    xlk_xlf      = _xlk_xlf_ratio(exog)
    roll_corrs   = _rolling_correlations(closes, exog)
    shariah_features: dict[str, Any] = {
        "rebalance_pressure_pct": round(float(np.mean(flags[-52:])) * 100.0, 1),
        "xlk_xlf_ratio":          xlk_xlf,
        **roll_corrs,
    }

    # ── Layer 3: GARCH(1,1) conditional CI ──────────────────────────────────
    garch_std, garch_meta = _run_garch(closes, cfg["n_steps"])

    # ── Layer 4: HMM regime detection ───────────────────────────────────────
    regime_info = _detect_regime(closes, exog)
    ci_mult     = float(regime_info["ci_multiplier"])

    # ── Layer 5: Fit forecast model with blended CI ──────────────────────────
    if cfg["model"] == "ets":
        fc, lo, hi, metrics = _run_ets(
            closes, cfg["n_steps"], bool(cfg["damped"]),
            garch_std=garch_std, ci_mult=ci_mult,
        )
        model_name = _ETS_MODEL_NAME
        rationale  = _ETS_RATIONALE
        features   = _ETS_FEATURES
    else:
        fc, lo, hi, metrics = _run_loglinear(
            closes, cfg["n_steps"], ci_mult=ci_mult,
        )
        model_name = _LINEAR_MODEL_NAME
        rationale  = _LINEAR_RATIONALE
        features   = _LINEAR_FEATURES

    # ── Layer 6: Walk-forward validation (all horizons) ──────────────────────
    wf = _wf_metrics(
        closes,
        model=cfg["model"],
        damped=bool(cfg["damped"] or False),
        target_h=cfg["n_steps"],
        interval=cfg["interval"],
    )
    metrics.update(wf)

    # Flatten key GARCH diagnostics into metrics (keeps metrics dict serialisable)
    if garch_meta.get("garch_fit"):
        metrics["garch_persistence"]    = garch_meta.get("persistence")
        metrics["garch_annual_vol_pct"] = garch_meta.get("long_run_annual_vol")
    metrics["garch_available"] = garch_meta.get("garch_available", False)
    metrics["garch_fit"]       = garch_meta.get("garch_fit", False)

    # ── Layer 7: Factor regression ───────────────────────────────────────────
    factors = _factor_regression(closes, exog, cfg["interval"])

    # ── Assemble output ───────────────────────────────────────────────────────
    forecast_dates = cfg["date_fn"](dates[-1], cfg["n_steps"])
    ctx      = HISTORY_CONTEXT[horizon]
    h_dates  = [d.isoformat() for d in dates[-ctx:]]
    h_values = [round(float(v), 4) for v in closes[-ctx:]]

    return {
        # ── Backward-compatible core ──────────────────────────────────────
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
        # ── New enrichment keys ───────────────────────────────────────────
        "regime":             regime_info,
        "factors":            factors,
        "shariah_features":   shariah_features,
    }
