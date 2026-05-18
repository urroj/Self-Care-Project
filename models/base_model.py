"""
models/base_model.py — Phase 1 (cold-start) & Phase 2 (Bayesian personalisation).

Architecture
------------
We model cycle length as a Negative Binomial (NB) distribution.
NB is preferred over Poisson for menstrual cycles because:
  - Cycle length is a positive integer (count-like).
  - Irregular cycles show over-dispersion that Poisson cannot capture.
  - The NB dispersion parameter r captures between-person variability.

Phase 1 (< 3 personal cycles)
  Fit a global NB regression on irregular-cycle subjects from public data.
  Covariates: [mean_length, std_length, trend, age, bmi].
  Output: posterior predictive distribution → point estimate + CI.

Phase 2 (3–7 personal cycles)
  Bayesian conjugate update of the NB rate parameter using personal data.
  The population fit provides the prior; each new personal cycle shifts
  the posterior toward the individual.

Saving / loading
  Model parameters stored as a simple JSON file for portability.
  No Theano/JAX compilation required at inference time.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
from scipy import stats
from scipy.optimize import minimize
from sklearn.ensemble import GradientBoostingRegressor
import joblib

from config import MODEL_DIR, RANDOM_SEED, LUTEAL_PHASE_MEAN

log = logging.getLogger(__name__)

PRIOR_PATH    = MODEL_DIR / "population_prior.json"
XGBOOST_PATH  = MODEL_DIR / "xgb_irregular.pkl"

FEATURE_COLS = [
    "mean_length", "std_length", "mean_last3", "std_last3",
    "trend", "deviation_from_mean", "current_length",
    "period_duration", "is_irregular", "n_cycles",
]


# ══════════════════════════════════════════════════════════════════════════════
# Population Prior — trained once on public data
# ══════════════════════════════════════════════════════════════════════════════

class PopulationPrior:
    """
    Encodes population-level statistics for irregular-cycle users.
    Two sub-models:
      (a) NB parameters (mu, r) fitted per decile of mean_length
      (b) GradientBoosting regressor for point prediction when covariates known
    """

    def __init__(self) -> None:
        self.nb_params: dict        = {}   # mu, dispersion by decile
        self.gb_regressor           = None
        self.global_mu: float       = 35.0
        self.global_std: float      = 7.0
        self.global_r: float        = 5.0  # NB dispersion
        self.feature_cols: list[str]= FEATURE_COLS
        self.is_fitted: bool        = False

    # ── Fitting ───────────────────────────────────────────────────────────────

    def fit(self, features_df, target_col: str = "next_cycle_length") -> "PopulationPrior":
        import pandas as pd

        df = features_df.dropna(subset=["next_cycle_length", "mean_length"]).copy()
        y  = df[target_col].values.astype(float)

        # (a) Global NB fit
        self.global_mu, self.global_r = _fit_nb(y)
        self.global_std = y.std()
        log.info("Global NB: mu=%.2f, r=%.2f, std=%.2f", self.global_mu, self.global_r, self.global_std)

        # (b) NB by mean_length decile (captures long-cycle users)
        df["decile"] = pd.qcut(df["mean_length"], q=5, labels=False, duplicates="drop")
        for dec, grp in df.groupby("decile"):
            vals = grp[target_col].dropna().values
            if len(vals) >= 10:
                mu, r = _fit_nb(vals)
                self.nb_params[int(dec)] = {"mu": mu, "r": r, "n": len(vals)}

        # (c) GradientBoosting for covariate-informed point estimate
        avail = [c for c in self.feature_cols if c in df.columns]
        X = df[avail].fillna(df[avail].median()).values
        self.gb_regressor  = GradientBoostingRegressor(
            n_estimators=300, max_depth=4, learning_rate=0.05,
            subsample=0.8, random_state=RANDOM_SEED
        )
        self.gb_regressor.fit(X, y)
        self.feature_cols  = avail
        self.is_fitted     = True
        log.info("PopulationPrior fitted on %d cycles.", len(df))
        return self

    # ── Prediction ────────────────────────────────────────────────────────────

    def predict_distribution(
        self,
        mean_length: float,
        std_length: float = 7.0,
        covariates: dict | None = None,
    ) -> dict:
        """
        Returns a dict with:
            point_estimate, ci_lower, ci_upper (95%), std,
            nb_mu, nb_r, decile_mu (if available)
        """
        # Choose NB params from the matching decile
        nb_mu, nb_r = self.global_mu, self.global_r

        if self.nb_params:
            decile = _mean_to_decile(mean_length, list(self.nb_params.keys()))
            if decile in self.nb_params:
                nb_mu = self.nb_params[decile]["mu"]
                nb_r  = self.nb_params[decile]["r"]

        # GradientBoosting refinement if covariates supplied
        if covariates and self.gb_regressor is not None:
            row = np.array([[
                covariates.get(f, nb_mu if f == "mean_length" else 0)
                for f in self.feature_cols
            ]])
            gb_pred = float(self.gb_regressor.predict(row)[0])
            # Blend: 60% personal mean history + 40% population GB
            point = 0.6 * mean_length + 0.4 * gb_pred
        else:
            point = nb_mu

        # Confidence interval from NB distribution
        nb_dist = stats.nbinom(n=nb_r, p=nb_r / (nb_r + nb_mu))
        ci_lo   = float(nb_dist.ppf(0.1))
        ci_hi   = float(nb_dist.ppf(0.9))
        nb_std  = float(nb_dist.std())

        return {
            "point_estimate": round(point, 1),
            "ci_lower":       max(21, int(ci_lo)),
            "ci_upper":       min(60, int(ci_hi)),
            "std":            round(nb_std, 2),
            "nb_mu":          round(nb_mu, 2),
            "nb_r":           round(nb_r, 3),
            "source":         "population_prior",
        }

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self) -> None:
        data = {
            "global_mu":   self.global_mu,
            "global_std":  self.global_std,
            "global_r":    self.global_r,
            "nb_params":   self.nb_params,
            "feature_cols": self.feature_cols,
        }
        PRIOR_PATH.write_text(json.dumps(data, indent=2))
        if self.gb_regressor is not None:
            joblib.dump(self.gb_regressor, XGBOOST_PATH)
        log.info("PopulationPrior saved to %s", PRIOR_PATH)

    @classmethod
    def load(cls) -> "PopulationPrior":
        obj = cls()
        if not PRIOR_PATH.exists():
            log.warning("No saved prior at %s — using defaults.", PRIOR_PATH)
            return obj
        data = json.loads(PRIOR_PATH.read_text())
        obj.global_mu    = data["global_mu"]
        obj.global_std   = data["global_std"]
        obj.global_r     = data["global_r"]
        obj.nb_params    = {int(k): v for k, v in data["nb_params"].items()}
        obj.feature_cols = data.get("feature_cols", FEATURE_COLS)
        if XGBOOST_PATH.exists():
            obj.gb_regressor = joblib.load(XGBOOST_PATH)
        obj.is_fitted = True
        return obj


# ══════════════════════════════════════════════════════════════════════════════
# Bayesian Personalisation — Phase 2 (3–7 personal cycles)
# ══════════════════════════════════════════════════════════════════════════════

class BayesianPersonalModel:
    """
    Conjugate Gamma-Poisson model for personal cycle length.

    Cycle lengths modelled as Poisson(λ) where λ ~ Gamma(α, β).
    Posterior after n observations:
        α_post = α_prior + Σ(lengths)
        β_post = β_prior + n
    Predictive distribution: Negative Binomial(α_post, β_post / (β_post + 1))

    The prior (α_prior, β_prior) is initialised from the population model
    so that the first personal cycle contributes meaningfully.
    """

    def __init__(self, population_prior: PopulationPrior) -> None:
        mu = population_prior.global_mu
        r  = population_prior.global_r
        # Method-of-moments: match NB mean and variance to Gamma-Poisson
        self.alpha = r          # shape
        self.beta  = r / mu     # rate
        self.personal_lengths: list[float] = []
        self.population_prior  = population_prior

    def update(self, new_lengths: list[float]) -> "BayesianPersonalModel":
        """Conjugate update: incorporate new observed cycle lengths."""
        valid = [x for x in new_lengths if 21 <= x <= 60]
        if not valid:
            return self
        self.personal_lengths.extend(valid)
        self.alpha += sum(valid)
        self.beta  += len(valid)
        log.info(
            "Bayesian update: +%d cycles → α=%.2f β=%.4f (personal mean=%.1f)",
            len(valid), self.alpha, self.beta,
            self.alpha / self.beta,
        )
        return self

    def predict_distribution(self, covariates: dict | None = None) -> dict:
        """Posterior predictive: Negative Binomial(α, β/(β+1))."""
        mu_post  = self.alpha / self.beta
        # NB parameterisation: n=alpha, p=beta/(beta+1)
        p        = self.beta / (self.beta + 1)
        nb_dist  = stats.nbinom(n=self.alpha, p=p)

        point  = float(nb_dist.mean())
        ci_lo  = float(nb_dist.ppf(0.10))
        ci_hi  = float(nb_dist.ppf(0.90))
        nb_std = float(nb_dist.std())

        n_personal = len(self.personal_lengths)
        # Weight: personal confidence grows with more cycles (caps at 1.0 at 8 cycles)
        personal_weight = min(n_personal / 8, 1.0)

        # Blend with population point estimate if covariates available
        pop_pred = self.population_prior.predict_distribution(
            mean_length=mu_post, covariates=covariates
        )["point_estimate"]
        blended = personal_weight * point + (1 - personal_weight) * pop_pred

        return {
            "point_estimate":   round(blended, 1),
            "ci_lower":         max(21, int(ci_lo)),
            "ci_upper":         min(60, int(ci_hi)),
            "std":              round(nb_std, 2),
            "posterior_mean":   round(mu_post, 2),
            "personal_weight":  round(personal_weight, 2),
            "n_personal":       n_personal,
            "source":           "bayesian_personal",
        }

    def save(self) -> None:
        path = MODEL_DIR / "bayesian_state.json"
        state = {
            "alpha":            self.alpha,
            "beta":             self.beta,
            "personal_lengths": self.personal_lengths,
        }
        path.write_text(json.dumps(state, indent=2))

    @classmethod
    def load(cls, population_prior: PopulationPrior) -> "BayesianPersonalModel":
        path = MODEL_DIR / "bayesian_state.json"
        obj  = cls(population_prior)
        if path.exists():
            state = json.loads(path.read_text())
            obj.alpha            = state["alpha"]
            obj.beta             = state["beta"]
            obj.personal_lengths = state["personal_lengths"]
        return obj


# ══════════════════════════════════════════════════════════════════════════════
# Symptom phase predictor — Random Forest (runs from Phase 1 onward)
# ══════════════════════════════════════════════════════════════════════════════

SYMPTOM_FEATURES = [
    "day_of_cycle", "flow_intensity", "avg_flow", "avg_stress", "avg_sleep",
    "symptom_cramps", "symptom_bloating", "symptom_fatigue",
    "symptom_breast_tender", "symptom_headache",
    "mean_length", "std_length", "is_irregular",
]

PHASE_LABELS = ["menstrual", "follicular", "ovulatory", "luteal"]

SYMPTOM_MODEL_PATH = MODEL_DIR / "symptom_rf.pkl"


def predict_current_phase(
    day_of_cycle: int,
    cycle_features: dict,
    mean_length: float = 35.0,
) -> dict:
    """
    Rule-based phase predictor (fallback when symptom RF not yet trained).
    Adjusts phase boundaries for longer cycles.
    """
    follicular_end = max(12, round(mean_length - 16))  # LH surge ~16d before end
    ovulatory_end  = follicular_end + 2
    luteal_end     = round(mean_length)

    if day_of_cycle <= 5:
        phase = "menstrual"
        pct   = (day_of_cycle - 1) / 4
    elif day_of_cycle <= follicular_end:
        phase = "follicular"
        pct   = (day_of_cycle - 5) / max(follicular_end - 5, 1)
    elif day_of_cycle <= ovulatory_end:
        phase = "ovulatory"
        pct   = (day_of_cycle - follicular_end) / 2
    else:
        phase = "luteal"
        pct   = (day_of_cycle - ovulatory_end) / max(luteal_end - ovulatory_end, 1)

    # Estimated ovulation day for irregular cycles: cycle_length - luteal_mean
    est_ovulation = round(mean_length - LUTEAL_PHASE_MEAN)

    return {
        "phase":          phase,
        "day_of_cycle":   day_of_cycle,
        "est_ovulation":  est_ovulation,
        "fertile_window": {"start": est_ovulation - 5, "end": est_ovulation},
        "phase_progress": round(min(pct, 1.0), 2),
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

def _fit_nb(y: np.ndarray) -> tuple[float, float]:
    """MLE fit of Negative Binomial to sample y. Returns (mu, r)."""
    mu0 = float(y.mean())
    var0 = float(y.var())
    r0 = max(mu0 ** 2 / max(var0 - mu0, 1e-3), 0.5)

    def neg_log_lik(params):
        mu, r = params
        if mu <= 0 or r <= 0:
            return 1e9
        p = r / (r + mu)
        return -np.sum(stats.nbinom.logpmf(y.astype(int), n=r, p=p))

    try:
        res = minimize(neg_log_lik, [mu0, r0], method="Nelder-Mead",
                       options={"xatol": 1e-4, "fatol": 1e-4, "maxiter": 2000})
        mu, r = res.x
        return max(float(mu), 21.0), max(float(r), 0.1)
    except Exception:
        return mu0, r0


def _mean_to_decile(mean_length: float, deciles: list[int]) -> int:
    """Map a mean_length value to the nearest decile key."""
    if not deciles:
        return 0
    boundaries = sorted(deciles)
    for b in boundaries:
        if mean_length <= 28 + b * 3:
            return b
    return boundaries[-1]
