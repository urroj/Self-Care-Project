# Self Care Journal

A personal menstrual cycle tracker and ovulation predictor for irregular cycles.
All data stays local — PostgreSQL on your own machine, no cloud, no third parties.

The ML model improves automatically every month as you log new cycles, progressing
through three phases from a population prior all the way to a fine-tuned personal LSTM.

---

## Table of Contents

1. [How it works](#how-it-works)
2. [Project structure](#project-structure)
3. [File reference](#file-reference)
4. [Setup](#setup)
5. [Running the app](#running-the-app)
6. [Development mode](#development-mode)
7. [CLI reference](#cli-reference)
8. [Model phases](#model-phases)
9. [Database schema](#database-schema)

---

## How it works

```
PUBLIC DATASETS (bootstrap)
  Fehring/Marquette 2012  ──┐
  Physionet mcPHASES 2024 ──┼──► Population Prior (Negative Binomial)
                             │    + LSTM pre-trained weights
                             │
YOUR DATA (PostgreSQL)       │
  cycles table            ──┤
  daily_logs table        ──┼──► Active Model
  model_runs table        ──┘      Phase 1 (<3 cycles)  → Population Prior
                                   Phase 2 (3–7 cycles) → Bayesian update
                                   Phase 3 (8+ cycles)  → Fine-tuned LSTM

FastAPI backend ──► React frontend ──► PyWebView native window
```

---

## Project structure

```
cycle_tracker_app/
├── app.py                  Desktop launcher (FastAPI + PyWebView)
├── config.py               All constants, paths, model thresholds
├── demo.py                 Runs the pipeline without a database
├── pipeline.py             ML orchestrator CLI (setup / predict / update)
├── README.md               This file
├── requirements.txt        Python dependencies
├── schema.sql              PostgreSQL table and view definitions
├── setup.sh                One-shot automated setup script
│
├── api/
│   └── main.py             FastAPI application — all API routes
│
├── db/
│   └── connector.py        All PostgreSQL reads and writes
│
├── models/
│   ├── base_model.py       Population prior (NB) + Bayesian personal model
│   └── lstm.py             LSTM network definition and trainer
│
├── data/
│   ├── loaders.py          Public dataset loaders (Fehring, mcPHASES)
│   ├── preprocessor.py     Feature engineering and sequence builder
│   ├── raw/                Place downloaded public CSVs here
│   └── cache/              Auto-generated parquet cache (do not edit)
│
├── saved_models/           Auto-generated model checkpoints (do not edit)
│
└── frontend/
    ├── index.html          HTML entry point — mounts the React app
    ├── vite.config.js      Vite build config and dev-server API proxy
    ├── package.json        npm dependencies (React, Recharts, Vite)
    └── src/
        ├── main.jsx        React entry point — mounts App into index.html
        ├── App.jsx         Root component — window chrome, tabs, state
        ├── api.js          All fetch() calls to the FastAPI backend
        ├── theme.js        Design tokens — colors, fonts, bevel helpers
        └── components/
            ├── Shared.jsx      Reusable UI primitives (inputs, buttons, cards)
            ├── LogTab.jsx      Daily log form — saves to POST /api/logs
            ├── CyclesTab.jsx   Cycle management — start, complete, stats table
            ├── LogsTab.jsx     Filterable scrollable daily logs table
            ├── ResultsTab.jsx  Stored predictions + run-prediction button
            └── InsightsTab.jsx Charts (CI trend, cycle length, symptoms, mood)
```

---

## File reference

### Root

**`app.py`**
The single command you run to launch the app. Starts FastAPI in a background
thread, waits for it to be ready, then opens a PyWebView native desktop window
pointing at `http://localhost:8000`. Accepts `--dev` to point the window at the
Vite dev server instead, and `--api-only` to run without a window (useful for
testing routes in the browser at `localhost:8000/docs`).

**`config.py`**
Single source of truth for all constants: file paths, cycle biology thresholds
(min/max cycle length, luteal phase mean), model phase cutoffs (3 cycles to
Bayesian, 8 cycles to LSTM), and LSTM hyperparameters. Reads `DB_URL` and
`MODEL_DIR` from the `.env` file via `python-dotenv`.

**`demo.py`**
Runs the full prediction pipeline with synthetic data — no PostgreSQL required.
Useful for testing that the ML code works before the database is configured.
Simulates 1, 3, 6, and 10 personal cycles to show how predictions improve
across all three model phases.

**`pipeline.py`**
CLI orchestrator for the ML pipeline. Five commands:
- `--setup`   trains the population prior from public data
- `--predict` generates and stores a next-cycle prediction
- `--update`  runs after a cycle completes — Bayesian update + LSTM fine-tune
- `--status`  shows current phase and cycles logged
- `--results` displays stored predictions from the database

**`requirements.txt`**
All Python dependencies. Key packages: `fastapi` and `uvicorn` for the API
server, `psycopg2-binary` for PostgreSQL, `scikit-learn`, `scipy`, and
`xgboost` for the ML pipeline, `pywebview` for the native desktop window.
`torch` is listed but commented out — it is only needed at Phase 3 (8+ cycles).

**`schema.sql`**
PostgreSQL DDL. Run once to create all tables and the `cycle_summaries` view.
Contains: `cycles`, `daily_logs`, and `model_runs` tables, and the
`cycle_summaries` view that aggregates daily logs per completed cycle.
Apply with: `psql -d period_tracker -f schema.sql`

**`setup.sh`**
Automates the entire first-time setup: installs Python deps, applies the
database schema, creates `.env` from `.env.example`, runs `pipeline.py --setup`
to train the population prior, and builds the React frontend with `npm run build`.

---

### `api/`

**`api/main.py`**
FastAPI application. Wraps the Python pipeline and database connector so the
React frontend can call them over HTTP. In production, also serves the compiled
React app from `frontend/dist/` so PyWebView only needs to point at one port.

| Method | Route                  | Purpose                                          |
|--------|------------------------|--------------------------------------------------|
| GET    | `/api/status`          | Model phase, cycles logged, next period estimate |
| GET    | `/api/cycles`          | All cycles (completed + active)                  |
| GET    | `/api/cycles/active`   | The current incomplete cycle                     |
| POST   | `/api/cycles/start`    | Open a new cycle                                 |
| POST   | `/api/cycles/complete` | Close cycle, Bayesian update, new prediction     |
| GET    | `/api/logs`            | All daily logs joined with cycle number          |
| POST   | `/api/logs`            | Insert one daily log row                         |
| GET    | `/api/predictions`     | Stored model_runs rows                           |
| POST   | `/api/predict`         | Run prediction and store result                  |
| GET    | `/api/insights`        | Aggregated data for Insights charts              |

---

### `db/`

**`db/connector.py`**
All database interaction in one file. Uses raw `psycopg2` with a context-manager
connection helper. Contains every read and write the app needs: `insert_cycle`,
`complete_cycle`, `insert_daily_log`, `get_completed_cycles`, `get_active_cycle`,
`get_all_logs_with_cycle`, `get_model_runs`, `save_model_run`, `get_insights_data`,
and more. No ORM — plain SQL for transparency and performance.

---

### `models/`

**`models/base_model.py`**
Two classes used in Phases 1 and 2:

`PopulationPrior` fits a Negative Binomial distribution to the irregular-cycle
subset of public data, plus a GradientBoosting regressor for covariate-informed
point estimates. Cycle length is modelled as NB rather than Gaussian because it
is a positive integer with right-skew overdispersion. Serialised to
`saved_models/population_prior.json`.

`BayesianPersonalModel` is a conjugate Gamma-Poisson update. Each new personal
cycle shifts the posterior mean toward your actual pattern. The population prior
provides the starting parameters. The personal weight grows from 37% at 3 cycles
to 87% at 7 cycles. Serialised to `saved_models/bayesian_state.json`.

**`models/lstm.py`**
Two-layer stacked LSTM with Monte Carlo Dropout for uncertainty estimation.
`LSTMTrainer` handles pre-training on public data sequences and fine-tuning on
personal sequences at 0.2x learning rate to prevent catastrophic forgetting.
Inference runs 100 forward passes with dropout active to produce a full
predictive distribution (mean and confidence intervals) rather than a point
estimate. Uses Huber loss (delta=2.0) for robustness to outlier cycle lengths.

---

### `data/`

**`data/loaders.py`**
Loads and standardises the two public datasets from local CSV files.
All network download logic has been removed — files must be placed manually.

`load_fehring()` reads `data/raw/fehring_cycle_data.csv`. Maps the real column
names (`ClientID`, `LengthofCycle`, `EstimatedDayofOvulation`, `LengthofLutealPhase`,
`LengthofMenses`, `MeanBleedingIntensity`, `Age`, `BMI`), handles the UTF-8 BOM,
and rescales `MeanBleedingIntensity` from its 0–15 composite range to a 0–5 flow scale.

`load_mcphases()` reads all CSVs from `data/raw/mcphases/`. Infers cycle boundaries
from phase transitions in `hormones_and_selfreport.csv`, detects ovulation day
from the LH column peak, merges optional enrichment files (sleep score converted
to hours, stress score inverted to 1–3 Likert, skin temperature).

`load_all_public()` combines both datasets. The Kaggle Bisht 2021 dataset is
intentionally excluded — it is structurally identical to Fehring and loading
both would inflate the prior with duplicate subjects.

`irregular_subset()` filters to subjects with cycle std > 7 days or mean >= 30
days, matching the target user profile of an irregular ~35 day cycle.

**`data/preprocessor.py`**
Converts raw cycle records into feature matrices for each model phase.

`build_cycle_features()` computes rolling statistics per cycle: personal mean,
std, last-3 mean and std, linear trend, deviation from mean, and irregularity
flag. These features are used by all three model phases.

`build_sequences()` builds (X, y) numpy arrays with a configurable lookback
window (default 6 cycles) for LSTM training. Sequences are built per subject
so no cross-subject contamination occurs.

`fit_scaler()` and `apply_scaler()` handle StandardScaler persistence so the
same normalisation is applied consistently at training and inference time.

`personal_db_to_features()` converts cycle summary dicts from PostgreSQL into
the same feature format as the public data, so the LSTM trains on both sources
without needing separate code paths.

---

### `frontend/`

**`frontend/index.html`**
The single HTML page the entire React app lives inside. Contains only a
`<div id="root">` where React mounts, a link tag for Tabler Icons, and a
script tag pointing at `src/main.jsx`. Vite uses this as its build entry point
and injects the compiled JS bundle here automatically.

**`frontend/vite.config.js`**
Configures Vite with the React plugin for JSX compilation and a dev-server
proxy that forwards all `/api/*` requests to FastAPI on port 8000. This means
the frontend code always calls `/api/...` without hardcoding a port — Vite
handles the routing in development and FastAPI handles it in production.
The build output goes to `frontend/dist/`.

**`frontend/package.json`**
npm manifest. Runtime dependencies: `react`, `react-dom`, and `recharts`
for the charts. Dev dependencies: `vite` and `@vitejs/plugin-react`.
No CSS framework — all styling uses inline JavaScript objects defined in
`theme.js`, keeping the pixel aesthetic consistent without a build step for CSS.

---

### `frontend/src/`

**`src/main.jsx`**
Three-line React entry point. Calls `ReactDOM.createRoot()` on the `#root` div
from `index.html` and renders `<App />` inside `React.StrictMode`. This is the
file Vite follows from the script tag in `index.html`.

**`src/App.jsx`**
Root component and state orchestrator. Renders the pixel desktop window shell:
title bar, menu bar, tab bar, and status bar. Manages three pieces of shared
state — the active cycle object, the status bar data fetched from `/api/status`,
and a `refreshKey` counter that triggers data reloads across all tabs after any
mutation. All tab components receive `notify()` for timed notifications and
`onSaved()` / `onCycleAction()` callbacks that increment `refreshKey`.

**`src/api.js`**
Single file containing every `fetch()` call the app makes. All paths are
prefixed with `/api`. Throws an `Error` with the server's `detail` message on
non-2xx responses so components can display meaningful error notifications
rather than generic failure messages.

**`src/theme.js`**
Design token file shared by every component. Exports the full colour palette
object (`C`), the font constant, bevel shadow strings (`RAISED` for protruding
buttons, `SUNKEN` for input wells), and shared table cell and header style
objects (`TD`, `TH`). Changing a colour here updates the entire app.

**`src/components/Shared.jsx`**
Reusable pixel-aesthetic UI primitives used across all five tabs: `Label`,
`Inp` (text and number input), `Sel` (dropdown), `CheckRow`, `RadioRow`,
`GroupBox` (styled fieldset), `PixelBtn`, `StatCard`, `PhaseTag`,
`Notification` (timed floating banner), `LoadingRow`, `EmptyRow`, and
`PhaseProgress` (the three-phase progress bar with cycle count). Centralising
these means future theme changes need edits in one place only.

**`src/components/LogTab.jsx`**
The main daily entry form. Twelve fields: date, flow intensity (0–5), cervical
mucus type, weight (kg), exercise minutes, sleep hours, sleep quality (radio),
stress level (radio), eight mood checkboxes, and nine symptom checkboxes.
On save, automatically calculates `day_of_cycle` from the active cycle's start
date, posts to `POST /api/logs`, shows a success or error notification,
and resets the form while keeping the current date.

**`src/components/CyclesTab.jsx`**
Cycle lifecycle management. If an active cycle exists, shows the active cycle
panel with start date, days elapsed, and a date picker to mark the cycle
complete. Validates the end date is between 15 and 60 days after the start
before calling `POST /api/cycles/complete`. The API response includes the new
prediction which is shown in the success notification. If no active cycle
exists, shows a form to start a new one. Also renders the phase progress bar,
four summary stat cards, and the full cycles table.

**`src/components/LogsTab.jsx`**
Scrollable table of all daily logs from `GET /api/logs`. A filter input
searches across date, cycle number, mucus type, and moods client-side.
Symptom columns use tick and dash indicators. Flow intensity is colour-coded
red when above 3. Shows up to 300 rows by default.

**`src/components/ResultsTab.jsx`**
Displays stored predictions from `GET /api/predictions` as cards, newest first.
Each card shows the model phase tag, personal cycle count, next cycle length
estimate, 80% confidence interval, next period date, ovulation estimate,
fertile window, and CI width in days. Includes a run-prediction control where
you enter today's cycle day number and click RUN to call `POST /api/predict`.

**`src/components/InsightsTab.jsx`**
Four live Recharts visualisations built from data at `GET /api/insights`:

1. CI width over time (bar chart) — shows the model becoming more precise with
   each prediction. A dashed red line marks the 8-day Bayesian phase target.

2. Cycle length history (composed chart) — actual lengths as bars with average
   sleep as a dashed line overlay, showing the two signals side by side.

3. Symptom frequency (horizontal bar chart) — total days each symptom was logged
   across all cycles, sorted by frequency.

4. Mood frequency (bar chart) — most common moods across all logged days.

Below the charts, six insight callout cards show: top symptom, top mood,
average sleep, average stress, progress toward the next model phase, and total
predictions stored.

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- PostgreSQL running locally

### First-time setup

```bash
cd cycle_tracker_app

# Edit .env and set: DB_URL=postgresql://user:password@localhost:5432/period_tracker

# Create the database if it does not exist yet
createdb period_tracker

# Automated setup (installs deps, schema, trains prior, builds frontend)
bash setup.sh
```

### Manual setup (step by step)

```bash
# 1. Python dependencies
pip install -r requirements.txt

# 2. Database schema
psql -d period_tracker -f schema.sql

# 3. Public data — optional but strongly recommended
#    Fehring/Marquette 2012:
#      https://epublications.marquette.edu/data_nfp/7/
#      Save as  data/raw/fehring_cycle_data.csv
#
#    Physionet mcPHASES 2024 (free account required):
#      https://physionet.org/content/mcphases/1.0.0/
#      Save all CSVs flat in  data/raw/mcphases/

# 4. Train population prior
python pipeline.py --setup

# 5. Build the React frontend
cd frontend
npm install
npm run build
cd ..
```

---

## Running the app

```bash
python app.py
```

Opens a native desktop window at 780x800 px. FastAPI runs on port 8000
internally. You do not need to open a browser.

---

## Development mode

Three terminals for hot-reload on both frontend and backend simultaneously:

```bash
# Terminal 1 — FastAPI with auto-reload on Python file changes
uvicorn api.main:app --reload --port 8000

# Terminal 2 — Vite dev server with hot module replacement
cd frontend && npm run dev

# Terminal 3 — PyWebView pointed at Vite (port 5173)
python app.py --dev
```

The Vite proxy forwards `/api/*` to FastAPI automatically. You can also test
API routes directly at `http://localhost:8000/docs` (Swagger UI).

---

## CLI reference

```bash
# Train population prior from public data — run once after setup
python pipeline.py --setup

# Generate and store a prediction
python pipeline.py --predict
python pipeline.py --predict --day 14        # --day = today's cycle day

# Update model after a new cycle completes
python pipeline.py --update --cycle-number 3

# Show current phase and cycle count
python pipeline.py --status

# View stored predictions in the terminal
python pipeline.py --results
python pipeline.py --results --limit 20

# Test without PostgreSQL
python demo.py

# API server only, no desktop window
python app.py --api-only
```

---

## Model phases

| Phase | Cycles logged | Model | Typical CI |
|---|---|---|---|
| `cold_start` | 0 – 2 | Negative Binomial fitted to irregular-cycle subjects from Fehring and mcPHASES public datasets. GradientBoosting regressor for covariate adjustment. | ±10–14 days |
| `bayesian` | 3 – 7 | Conjugate Gamma-Poisson update. Each new cycle shifts the posterior toward your personal pattern. Blended with the population prior — personal weight grows from 37% at 3 cycles to 87% at 7 cycles. | ±4–7 days |
| `lstm` | 8+ | Two-layer LSTM pre-trained on public data, fine-tuned on personal sequences at 0.2x learning rate. Monte Carlo Dropout (100 passes) gives calibrated uncertainty estimates. 6-cycle lookback window. | ±2–4 days |

---

## Database schema

Three tables and one view. Apply with `psql -d period_tracker -f schema.sql`.

**`cycles`** — one row per menstrual cycle. The `cycle_length` and
`period_duration` columns are generated automatically from the start and end
dates so they never go out of sync.

**`daily_logs`** — one row per day. Stores: flow intensity (0–5), cervical
mucus type, moods as a `TEXT[]` array, nine boolean symptom flags, sleep hours,
sleep quality (1–3), stress level (1–3), weight in kg, and exercise minutes.

**`model_runs`** — audit trail of every prediction. Stores the full predictions
`JSONB`, model phase string, and personal cycle count at the time of the run.
This table feeds the Results tab and the CI-width chart in Insights.

**`cycle_summaries`** (view) — joins `cycles` and `daily_logs` to produce one
aggregate row per completed cycle: average flow, sleep, and stress; total days
with each symptom; and dominant mood from the moods array.

---

## Privacy

All data is stored locally in your PostgreSQL instance.
Nothing is sent to any external server at any point.
The public datasets (Fehring, mcPHASES) are used only during `--setup` to
initialise model weights and are not consulted again after that.