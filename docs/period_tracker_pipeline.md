# Period Tracker ML Pipeline — End-to-End Walkthrough

This document traces the period-tracker prediction pipeline from initial setup through inference and online updates. It walks through every function in [pipeline.py](../pipeline.py), [models/base_model.py](../models/base_model.py), [models/lstm_model.py](../models/lstm_model.py), [data/preprocessor.py](../data/preprocessor.py), and [data/loaders.py](../data/loaders.py), plus the routes that drive them from the UI.

---

## 0. High-level shape

The system has **three phases**, gated by how many personal cycles have been logged. The phase resolver is the only branch point — once the phase is known, each path is independent:

```
Personal cycle count
        ▼
resolve_phase(n)          [pipeline.py:64]
        │
        ├── n < 3   → "cold_start" → PopulationPrior.predict_distribution()
        ├── 3 ≤ n<8 → "bayesian"   → BayesianPersonalModel.update() + predict
        └── n ≥ 8   → "lstm"       → LSTMTrainer.predict() with MC Dropout
```

Phases / thresholds live in [config.py:48](../config.py):

| Phase        | Trigger          | Model                                       |
| ------------ | ---------------- | ------------------------------------------- |
| `cold_start` | < 3 personal     | Negative-Binomial population prior + GB blend |
| `bayesian`   | 3 to 7 personal  | Gamma-Poisson conjugate update              |
| `lstm`       | ≥ 8 personal     | Fine-tuned 2-layer LSTM + MC Dropout        |

Entry points:

- **CLI** — `python pipeline.py --setup | --predict | --update | --status | --results`.
- **HTTP** — `POST /api/cycles/complete` and `POST /api/predict` in [api/main.py](../api/main.py) call `predict_next_cycle()` / `update_with_new_cycle()`.

---

## 1. One-time setup — `setup_pipeline()`

Located at [pipeline.py:113](../pipeline.py). Run with `--setup` once per install.

Steps:

1. **Load public data.** Try `load_all_public()` then `irregular_subset(...)`. If everything fails (missing CSVs, parse errors), log a warning and call `_make_synthetic_population()` to fabricate a calibrated population fallback.
2. **Threshold.** If fewer than 10 rows remain after filtering, also fall back to synthetic so the prior is never under-fit.
3. **Feature engineering.** `build_cycle_features(irr)` → drop rows missing `next_cycle_length` or `mean_length`.
4. **Fit `PopulationPrior`.** `.fit(feats)` then `.save()` writes `population_prior.json` + `xgb_irregular.pkl`.
5. **Fit feature scaler.** `fit_scaler(feats, available_numeric_cols)` saves `feature_scaler.pkl`.
6. **LSTM pre-training.** `build_sequences(feats, lookback=LSTM_LOOKBACK)`. If ≥ 50 sequences and PyTorch is importable, `LSTMTrainer(input_size).pretrain(X, y)` and `save_meta(feature_cols)`. Otherwise skipped (LSTM phase still works via fallback to Bayesian).

### 1.1 `_make_synthetic_population(n_subjects=120, seed=0)` — [pipeline.py:76](../pipeline.py)

Generates 120 synthetic subjects with personalised mean/std drawn from `U(28,45)` / `U(5,13)`, then 6–15 cycles each drawn from `N(personal_mean, personal_std)` clipped to `[21, 60]`. Each row carries `subject_id`, `cycle_number`, `cycle_length`, plus simulated `period_duration`, `ovulation_day = round(length - 14)`, `luteal_length`, `age`, `bmi`, `avg_flow/stress/sleep`, and an `irregular_flag` (`personal_std > 7`). Source tag: `"synthetic_population"`.

---

## 2. Data loading — `data/loaders.py`

### 2.1 `load_all_public()` — [data/loaders.py:401](../data/loaders.py)

Master loader. Tries each of `load_fehring`, `load_mcphases` and concatenates whatever succeeds. Raises `RuntimeError` only if **all** sources fail. Drops rows missing `cycle_length`.

### 2.2 `load_fehring(force_reload=False)` — [data/loaders.py:119](../data/loaders.py)

- Reads `data/raw/fehring_cycle_data.csv` with `utf-8-sig` to strip the BOM.
- Renames columns via `FEHRING_COL_MAP` (`ClientID → subject_id`, `LengthofCycle → cycle_length`, etc.).
- Coerces numeric columns.
- Rescales `MeanBleedingIntensity` (0–15 composite) to `avg_flow` on 0–5 by `/3.0` then clipping.
- Computes `irregular_flag = within-subject std(cycle_length) > 7`.
- Calls `_enforce_schema(df, "fehring_2012")` and caches to parquet via `_save`.

### 2.3 `load_mcphases(force_reload=False)` — [data/loaders.py:297](../data/loaders.py)

Physionet mcPHASES 2024 daily-level → cycle-level conversion.

- Required: `hormones_and_selfreport.csv` (joined by `id` + `day_in_study`).
- Optional enrichments merged on the same key:
  - `resting_heart_rate.csv` → `rhr_bpm`.
  - `sleep_score.csv` (`overall_score`) → `sleep_hours = score × 0.09`.
  - `stress_score.csv` → binned to Likert 1–3 (`cut bins=[0,33,66,100]`).
  - `computed_temperature.csv` → `nightly_temperature` (renamed `sleep_start_day_in_study → day_in_study`).
- `subject-info.csv` → `age = 2023 − birth_year`.
- Per subject, calls `_infer_cycles_from_daily(subj_daily)` to get one row per detected cycle, then attaches age and emits standard schema.

### 2.4 `_infer_cycles_from_daily(daily)` — [data/loaders.py:225](../data/loaders.py)

Cycle-boundary detection for one subject:

- Normalises `phase` to lowercase, maps `flow_volume` strings (`"light"`, `"heavy"`, …) via `FLOW_MAP` to 0–5.
- `is_bleed(i)` = phase in `MENSTRUAL_PHASES` or `flow_volume > 0`.
- `is_new_cycle(i)` = first day, OR `study_interval` changed, OR `is_bleed(i)` and not `is_bleed(i-1)`.
- Cumulatively assigns `_cycle_id`, then aggregates per cycle:
  - `cycle_length` = span of `day_in_study` (NaN if `< MIN_CYCLE_DAYS`).
  - `period_duration` = number of days with `flow_volume > 0`.
  - `ovulation_day` = day where `LH` column peaks within the cycle.
  - `luteal_length = cycle_length − ovulation_day`.
  - Means of `flow_volume`, `stress`, `sleep_hours`.

### 2.5 `_enforce_schema(df, source)` / `_save` / `_cache_path` — [data/loaders.py:57–77](../data/loaders.py)

Adds missing standard columns as `NaN`, tags `source`, drops rows with implausible `cycle_length` (outside `MIN_CYCLE_DAYS..MAX_CYCLE_DAYS`), then caches to `data/cache/{name}_standardised.parquet`.

### 2.6 `irregular_subset(df)` — [data/loaders.py:436](../data/loaders.py)

Keeps subjects with either `irregular_flag == True` **or** mean cycle length `≥ 30`. The pipeline trains exclusively on this irregular subset because the target user has irregular cycles.

---

## 3. Feature engineering — `data/preprocessor.py`

### 3.1 `build_cycle_features(cycles_df)` — [data/preprocessor.py:23](../data/preprocessor.py)

Converts long-form completed cycles into a feature matrix where **each row uses only that subject's history up to and including cycle `i`**, with target `next_cycle_length = lengths[i+1]`. Iterates per subject in `cycle_number` order, builds rolling stats via `_history_stats(past)`, attaches static (`age`, `bmi`) and per-cycle measurements (`period_duration`, `ovulation_day`, `luteal_length`) plus daily-log aggregates (`avg_flow`, `avg_stress`, `avg_sleep`).

### 3.2 `_history_stats(lengths)` — [data/preprocessor.py:69](../data/preprocessor.py)

Rolling statistics computed from all cycles seen so far:

| Feature                | Definition                                         |
| ---------------------- | -------------------------------------------------- |
| `n_cycles`             | count of non-NaN lengths                           |
| `current_length`       | last value in `lengths`                            |
| `prev_length`          | second-to-last                                     |
| `mean_length`/`std_length` | overall mean and std                           |
| `min_length`/`max_length`/`range_length` | extremes & span                  |
| `trend`                | OLS slope of `lengths` vs index (needs ≥ 3 obs)    |
| `deviation_from_mean`  | `current_length − mean_length`                     |
| `is_irregular`         | `1` if `std_length > 7` else `0`                   |
| `mean_last3`/`std_last3` | window over the most recent 3 cycles             |
| `est_luteal`           | constant `LUTEAL_PHASE_MEAN` (14)                  |

### 3.3 `build_sequences(features_df, lookback=6, target_col="next_cycle_length")` — [data/preprocessor.py:109](../data/preprocessor.py)

LSTM sequence builder.

- Picks features from `SEQUENCE_FEATURES` that exist and aren't entirely NaN.
- Per subject (no cross-subject contamination), for each `i ∈ [lookback, len)` emits `(X = feat[i-lookback:i], y = target[i])` if the label is not NaN.
- Returns `X` shape `(N, lookback, n_features)`, `y` shape `(N,)`, plus the list of feature column names — saved into LSTM meta so inference reuses the same column order.

### 3.4 Scaler utilities — [data/preprocessor.py:158](../data/preprocessor.py)

- `fit_scaler(df, feature_cols)` — `StandardScaler` fitted on rows with no NaNs in `feature_cols`; persisted to `feature_scaler.pkl`.
- `load_scaler()` — returns the saved scaler or `None`.
- `apply_scaler(df, feature_cols, scaler=None)` — imputes column medians for NaNs, then transforms.

### 3.5 `personal_db_to_features(cycle_summaries)` — [data/preprocessor.py:188](../data/preprocessor.py)

Bridges PostgreSQL `cycle_summaries` view rows to the same feature layout as public data:

- Maps DB keys (`cycle_length`, `period_duration`, `ovulation_day_of_cycle`, `luteal_length`, `avg_flow/stress/sleep`, `age`, `bmi`) into the standard record.
- Adds symptom-derived features via `_safe_frac(row, "days_cramps", "logged_days")` etc.
- Finally re-runs `build_cycle_features(df)` so the same rolling stats apply to personal data.

---

## 4. Phase 1 — `PopulationPrior` ([models/base_model.py:57](../models/base_model.py))

A Negative Binomial regression layered over a Gradient Boosting refinement.

### 4.1 `__init__()`

Initialises `global_mu = 35.0`, `global_std = 7.0`, `global_r = 5.0` (NB dispersion). Holds an empty `nb_params` dict (decile → `{mu, r, n}`) and a `gb_regressor` placeholder.

### 4.2 `fit(features_df, target_col="next_cycle_length")` — [models/base_model.py:76](../models/base_model.py)

1. **Global NB fit** via `_fit_nb(y)` — MLE for `(mu, r)`.
2. **Per-decile NB**. `mean_length` is split into 5 quantile buckets via `pd.qcut(..., q=5, duplicates="drop")`. For each bucket with ≥ 10 cycles, fit a separate NB and store `{mu, r, n}` keyed by decile.
3. **Gradient Boosting regressor**. `GradientBoostingRegressor(n_estimators=300, max_depth=4, lr=0.05, subsample=0.8)` trained on available `FEATURE_COLS` with median imputation. Feature columns actually used are remembered in `self.feature_cols`.

### 4.3 `predict_distribution(mean_length, std_length=7.0, covariates=None)` — [models/base_model.py:110](../models/base_model.py)

- Selects the matching decile's NB params if any are stored, else uses globals.
- **Blends point estimate** when covariates are supplied: `point = 0.6 × mean_length + 0.4 × gb_prediction`. Without covariates, `point = nb_mu`.
- Builds CI from `scipy.stats.nbinom(n=r, p=r/(r+mu))`: 10th/90th percentiles → `ci_lower/ci_upper`, plus NB std.
- Returns `{point_estimate, ci_lower, ci_upper, std, nb_mu, nb_r, source="population_prior"}`, with bounds clamped to `[21, 60]`.

### 4.4 Persistence — [models/base_model.py:160](../models/base_model.py)

- `save()` writes `population_prior.json` and `joblib.dump`s the GB regressor to `xgb_irregular.pkl`.
- `load()` repopulates `global_*` and `nb_params` (re-casting decile keys to int); restores GB if pickle exists. Returns the empty default if no JSON found.

### 4.5 Internal helpers — [models/base_model.py:343](../models/base_model.py)

- `_fit_nb(y)` — MLE for NB using Nelder-Mead on the negative log-likelihood `−Σ logpmf(y; n=r, p=r/(r+mu))`. Seeded by method-of-moments `r0 = mu²/(var − mu)`. Clamps `mu ≥ 21` and `r ≥ 0.1`.
- `_mean_to_decile(mean_length, deciles)` — maps a personal `mean_length` to the nearest decile via the heuristic `mean_length ≤ 28 + b*3` per ascending boundary.

---

## 5. Phase 2 — `BayesianPersonalModel` ([models/base_model.py:195](../models/base_model.py))

Conjugate Gamma-Poisson, parameterised so the population prior shows through until enough personal data accumulates.

### 5.1 `__init__(population_prior)`

Method-of-moments seeding from the NB:
- `alpha = r` (shape).
- `beta = r / mu` (rate).

This matches the NB's mean (`alpha/beta = mu`) and variance to the population.

### 5.2 `update(new_lengths)` — [models/base_model.py:218](../models/base_model.py)

Conjugate Gamma-Poisson update:

- Keep only valid lengths (`21 ≤ x ≤ 60`).
- `alpha += Σ(valid)`, `beta += len(valid)`, append to `personal_lengths`.
- Returns `self` so calls can be chained.

### 5.3 `predict_distribution(covariates=None)` — [models/base_model.py:233](../models/base_model.py)

- Posterior predictive is `NegBinom(n=alpha, p=beta/(beta+1))`.
- `point` is the NB mean; `ci_lower/ci_upper` are the 10/90 NB percentiles; `nb_std` is NB std.
- **Personal weight** caps at 1.0 after 8 cycles: `personal_weight = min(n_personal / 8, 1.0)`.
- **Blend with population**: `blended = personal_weight × point + (1 − personal_weight) × pop_pred`, where `pop_pred = self.population_prior.predict_distribution(mean_length=mu_post, covariates=...)["point_estimate"]`.
- Returns `{point_estimate (blended), ci_lower, ci_upper, std, posterior_mean, personal_weight, n_personal, source="bayesian_personal"}`.

### 5.4 Persistence — [models/base_model.py:266](../models/base_model.py)

`save()` and `load(population_prior)` round-trip `{alpha, beta, personal_lengths}` to `bayesian_state.json`. Load returns a fresh model seeded from `population_prior` if no state exists.

---

## 6. Phase 3 — LSTM ([models/lstm_model.py](../models/lstm_model.py))

### 6.1 `CycleLSTM` module — [models/lstm_model.py:50](../models/lstm_model.py)

- `nn.LSTM(input_size, hidden_size=LSTM_HIDDEN_SIZE=64, num_layers=LSTM_NUM_LAYERS=2, dropout=0.2, batch_first=True)`.
- Forward pass takes `(batch, lookback, features)`, picks the **last timestep** of the LSTM output, applies dropout, then a `Linear(hidden, 1)` head returning the predicted next cycle length.

### 6.2 `LSTMTrainer(input_size, device="cpu")` — [models/lstm_model.py:83](../models/lstm_model.py)

Owns the `CycleLSTM`, the training device, and a `history: list[float]` of per-epoch losses.

### 6.3 `pretrain(X, y, epochs=150, lr=1e-3, val_split=0.15)` — [models/lstm_model.py:93](../models/lstm_model.py)

Delegates to `_train_loop(... save_path=LSTM_CHECKPOINT, patience=20)`. Holds out the **last 15%** of sequences (time-ordered split — never shuffles across subjects) for validation.

### 6.4 `finetune(X, y, epochs=60, lr=LSTM_LR*0.2)` — [models/lstm_model.py:109](../models/lstm_model.py)

Runs `_train_loop(... save_path=LSTM_PERSONAL, patience=15, val_split=0.0)`. Lower LR (0.2× pre-training) to avoid catastrophic forgetting of the population pre-training. Requires at least 2 personal sequences.

### 6.5 `_train_loop(X, y, epochs, lr, val_split, patience, save_path)` — [models/lstm_model.py:125](../models/lstm_model.py)

- Time-ordered split when `val_split > 0` and `len(X) > 10`.
- DataLoader (`batch_size=LSTM_BATCH_SIZE=32`, shuffle=True), `Adam(lr=lr, weight_decay=1e-4)`, `ReduceLROnPlateau(patience=5, factor=0.5)`, `HuberLoss(delta=2.0)` for robustness to outlier cycles.
- Per epoch: train, clip grads to norm 1.0, then validate. Saves `state_dict` whenever val loss improves; early-stops after `patience` epochs without improvement. Logs train/val every 20 epochs.
- If `val_split == 0`, saves every epoch (no early stopping). A final unconditional save guarantees a checkpoint exists.

### 6.6 `predict(x, n_samples=100)` — [models/lstm_model.py:200](../models/lstm_model.py)

**Monte Carlo Dropout** inference for uncertainty:

- Reshapes `x` from `(lookback, n_features)` to `(1, lookback, n_features)`.
- Calls `self.model.train()` to **keep dropout active** during inference.
- Runs `n_samples` forward passes (default 100), collecting predictions.
- Returns `{point_estimate=mean, std, ci_lower_80=p10, ci_upper_80=p90, ci_lower_95=p2.5, ci_upper_95=p97.5, source="lstm_personal"}`.

### 6.7 Persistence — [models/lstm_model.py:231](../models/lstm_model.py)

- `save_meta(feature_cols)` writes `lstm_meta.json` with `{input_size, feature_cols}`.
- `load(personal=True)` — reads meta, picks `LSTM_PERSONAL` if present and `personal=True`, else `LSTM_CHECKPOINT`. Returns `(trainer, feature_cols)` or `None` if either file is missing.

---

## 7. Inference orchestrator — `predict_next_cycle()`

Located at [pipeline.py:183](../pipeline.py). Called by the FastAPI route `POST /api/predict` and (after a cycle completes) `POST /api/cycles/complete`.

### 7.1 Loading personal data

- `use_db=True` (default): `count_completed_cycles()` and `get_completed_cycles()` from [db/connector.py](../db/connector.py).
- `use_db=False`: caller supplies `personal_cycles` directly.

`phase = resolve_phase(n_personal)`; `personal_lengths` extracted; `personal_mean`/`personal_std` computed (`35.0` / `7.0` defaults when no history).

### 7.2 Phase dispatch

- **`cold_start`** — `prior.predict_distribution(mean_length, std_length, covariates={"mean_length", "std_length"})`. Annotated with `phase_label="cold_start"` and `confidence="low — fewer than 3 personal cycles logged"`.
- **`bayesian`** — `BayesianPersonalModel.load(prior).update(personal_lengths).save()`, then `predict_distribution(covariates=...)`. Confidence string includes `personal_weight` percentage.
- **`lstm`** — delegates to `_predict_lstm(cycles, personal_mean, personal_std, prior)`.

### 7.3 `_predict_lstm(...)` — [pipeline.py:312](../pipeline.py)

1. `LSTMTrainer.load(personal=True)`; raises if no checkpoint.
2. `feats = personal_db_to_features(cycles)`; raises if `len(feats) < LSTM_LOOKBACK` (6).
3. `X_raw = feats.tail(LSTM_LOOKBACK)[feature_cols].fillna(0).values`.
4. Scale via `load_scaler()`; if no scaler exists, use raw values.
5. Return `trainer.predict(X_scaled)`.

Any exception is logged and the function **falls back to the Bayesian posterior** so the user always gets a prediction.

### 7.4 Derived dates

- `next_period_start_est = last_cycle_start + timedelta(days=int(next_len))` when a previous start date exists; otherwise `today + next_len`.
- `est_ovulation = next_period − 14` days (`LUTEAL_PHASE_MEAN`).
- `fertile_window` = `[est_ovulation − 5, est_ovulation]`.

The result dict is merged with `n_personal_cycles`, `personal_mean_length`, `personal_std_length`, `next_cycle_length_est`, `next_period_start_est`, `ovulation_date_est`, `fertile_window_start/end`, and `generated_on`.

### 7.5 Current phase

If `day_of_current_cycle` was provided, `predict_current_phase(...)` annotates `result["current_phase"]`.

### 7.6 Audit log

When `use_db=True`, the dict is persisted via `save_model_run(model_phase, personal_cycles, predictions)` to the `model_runs` table. Failures are logged but do not break the response.

---

## 8. Rule-based phase classifier — `predict_current_phase()`

[models/base_model.py:303](../models/base_model.py). A fallback that's also used when there's no symptom RF model yet:

- `follicular_end = max(12, round(mean_length − 16))`.
- `ovulatory_end = follicular_end + 2`.
- `luteal_end = round(mean_length)`.
- Bucketing day-of-cycle:
  - `1–5` → `menstrual`, progress `(d-1)/4`.
  - `≤ follicular_end` → `follicular`, progress `(d-5)/(follicular_end-5)`.
  - `≤ ovulatory_end` → `ovulatory`, progress `(d-follicular_end)/2`.
  - else → `luteal`, progress `(d-ovulatory_end)/(luteal_end-ovulatory_end)`.
- `est_ovulation = round(mean_length − LUTEAL_PHASE_MEAN)`; fertile window `[est_ovulation−5, est_ovulation]`.
- Returns `{phase, day_of_cycle, est_ovulation, fertile_window, phase_progress}`.

Phase boundaries shift with personal `mean_length`, so a user with 35-day cycles gets `follicular_end ≈ 19` while a 28-day user gets `follicular_end ≈ 12`.

---

## 9. Online update — `update_with_new_cycle(cycle_number=None)`

Located at [pipeline.py:352](../pipeline.py). Called from `POST /api/cycles/complete` ([api/main.py:206](../api/main.py)).

1. Pull all completed cycles (`get_completed_cycles`) and the count.
2. **Always update Bayesian state** (cheap conjugate update — runs even in cold_start/lstm so the Bayesian model is always usable as a fallback).
3. If currently in `lstm` phase:
   - Build personal sequences via `personal_db_to_features(cycles)` then `build_sequences(feats, lookback=LSTM_LOOKBACK)`.
   - If at least 2 sequences exist, **load the pre-trained checkpoint** (`LSTMTrainer.load(personal=False)`) and `.finetune(X, y)`. The result is saved to `LSTM_PERSONAL` so subsequent inference uses it.

The route runs the Bayesian update **synchronously** inline; the LSTM fine-tune is dispatched to a daemon thread via `_finetune_lstm()` ([api/main.py:249](../api/main.py)) so the HTTP response doesn't block.

---

## 10. Phase resolver

`resolve_phase(n_personal)` ([pipeline.py:64](../pipeline.py)):

```python
def resolve_phase(n_personal: int) -> str:
    if n_personal < PHASE_COLD_START:   # < 3
        return "cold_start"
    if n_personal < PHASE_LSTM:         # < 8
        return "bayesian"
    return "lstm"
```

Note that `PHASE_BAYESIAN` and `PHASE_LSTM` are both `8` in [config.py:48](../config.py) — only `PHASE_COLD_START` (3) and `PHASE_LSTM` (8) are used by the resolver.

---

## 11. CLI surface

`main()` in [pipeline.py:476](../pipeline.py) wires the argparse subcommands:

- `--setup` → `setup_pipeline()`.
- `--predict [--day N] [--no-db]` → `predict_next_cycle(...)` + `_print_prediction(pred)` (formatted block to stdout).
- `--update [--cycle-number N]` → `update_with_new_cycle(...)`.
- `--results [--limit N]` → `_show_results(limit)` queries `model_runs` via `get_model_runs(limit)` and prints a per-run table with run timestamp, phase, point estimate, 80% CI, derived dates, personal stats, and confidence.
- `--status` → counts personal cycles, prints which phase is active and how many more cycles are needed to unlock the next.

---

## 12. Output schema (returned to clients)

```jsonc
{
  // Phase + confidence
  "phase_label": "cold_start | bayesian | lstm",
  "confidence":  "<human-readable string>",

  // Point + intervals (set varies by phase)
  "point_estimate":  <float>,
  "std":             <float>,
  "ci_lower":        <int>,      // population/bayesian — 10th–90th NB percentiles
  "ci_upper":        <int>,
  "ci_lower_80":     <float>,    // LSTM only — MC dropout percentiles
  "ci_upper_80":     <float>,
  "ci_lower_95":     <float>,
  "ci_upper_95":     <float>,

  // Phase-specific diagnostics
  "nb_mu": <f>, "nb_r": <f>,                              // cold_start
  "posterior_mean": <f>, "personal_weight": <f>,          // bayesian
  "source": "population_prior | bayesian_personal | lstm_personal",

  // Derived dates + personal context
  "n_personal_cycles":    <int>,
  "personal_mean_length": <float>,
  "personal_std_length":  <float>,
  "next_cycle_length_est": <float>,
  "next_period_start_est": "YYYY-MM-DD",
  "ovulation_date_est":    "YYYY-MM-DD",
  "fertile_window_start":  "YYYY-MM-DD",
  "fertile_window_end":    "YYYY-MM-DD",
  "generated_on":          "YYYY-MM-DD",

  // Optional — only if day_of_current_cycle was supplied
  "current_phase": { phase, day_of_cycle, est_ovulation, fertile_window, phase_progress }
}
```

The full dict is also persisted to the `model_runs` table via `save_model_run` for the `/api/predictions` history view.

---

## 13. Graceful degradation summary

The pipeline is built to keep producing a prediction even when components are unavailable:

| Component                  | Failure mode                              | Fallback                                                |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Public CSV datasets        | Missing / unparseable files               | `_make_synthetic_population()` 120-subject fallback     |
| LSTM pre-training          | `< 50` public sequences, or no PyTorch    | Phase 3 falls back to Bayesian at inference time        |
| LSTM personal checkpoint   | Missing or fails to load                  | `_predict_lstm` catches and returns Bayesian prediction |
| Feature scaler             | No saved pickle                           | Use raw values without scaling                          |
| `model_runs` table         | DB unreachable on save                    | Error logged; prediction still returned to caller       |
| `last_cycle_start` missing | New user with no prior period date       | `next_period_est = today + next_len`                    |

The only hard prerequisite is that **`PopulationPrior.load()`** succeeds (returns defaults `mu=35, r=5` even when no file exists) and that `numpy` / `scipy` / `scikit-learn` are importable.
