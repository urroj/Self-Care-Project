# Self Care Journal

Take charge of your data. With the barrier to entry for coding at an all time low, you can build your own applications instead of handing money and private health data to third-party apps.

This started as a personal menstrual cycle tracker and ovulation predictor for irregular cycles (if you want normal cycles check `data/loaders.py`). All data stays local — PostgreSQL on your own machine, no cloud, no third parties.

The ML model improves automatically every month as you log new cycles, progressing through three phases from a population prior all the way to a fine-tuned personal LSTM.

It does not stop at cycle tracking. The desktop now has four windows: Cycle Tracker, Journal (with daily habits), ETF Tracker, and a Home screen with live widgets. Future iterations can keep adding windows — the desktop is yours.

Future changes planned:
1. Add a prediction model for the ETFs

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
  journal_entries table   ──┤      Phase 1 (<3 cycles)  → Population Prior
  daily_habits table      ──┤      Phase 2 (3–7 cycles) → Bayesian update
  etf_investments table   ──┤      Phase 3 (8+ cycles)  → Fine-tuned LSTM
  model_runs table        ──┘

Yahoo Finance (live)  ──► FastAPI proxy ──► ETF charts

FastAPI backend ──► React frontend ──► PyWebView native window
                                         ├── Home screen (widgets)
                                         ├── Cycle Tracker window
                                         ├── Journal window (journal + habits)
                                         └── ETF Tracker window
```

---

## Project structure

```
cycle_tracker_app/
├── app.py                      Desktop launcher (FastAPI + PyWebView)
├── config.py                   All constants, paths, model thresholds
├── demo.py                     Runs the pipeline without a database
├── pipeline.py                 ML orchestrator CLI (setup / predict / update)
├── README.md                   This file
├── requirements.txt            Python dependencies
├── schema.sql                  PostgreSQL table and view definitions
├── journal_migration.sql       Adds journal_entries table
├── habits_migration.sql        Adds daily_habits table
├── setup.sh                    One-shot automated setup script
│
├── api/
│   └── main.py                 FastAPI — all API routes including journal, habits, ETF proxy
│
├── db/
│   └── connector.py            All PostgreSQL reads and writes
│
├── models/
│   ├── base_model.py           Population prior (NB) + Bayesian personal model
│   └── lstm.py                 LSTM network definition and trainer
│
├── data/
│   ├── loaders.py              Public dataset loaders (Fehring, mcPHASES)
│   ├── preprocessor.py         Feature engineering and sequence builder
│   ├── raw/                    Place downloaded public CSVs here
│   └── cache/                  Auto-generated parquet cache (do not edit)
│
├── saved_models/               Auto-generated model checkpoints (do not edit)
│
└── frontend/
    ├── index.html              HTML entry point — pixel font, custom cursors, gradients
    ├── vite.config.js          Vite build config and dev-server API proxy
    ├── package.json            npm dependencies (React, Recharts, Vite)
    └── src/
        ├── main.jsx            React entry point — mounts App into index.html
        ├── App.jsx             Multi-window desktop shell — dock, animations, drag
        ├── api.js              All fetch() calls to the FastAPI backend
        ├── theme.js            Design tokens — pixel pink palette, fonts, bevel helpers
        └── components/
            ├── Shared.jsx          Reusable UI primitives (inputs, buttons, cards)
            ├── LogTab.jsx          Daily log form — flow, mood, symptoms, sleep
            ├── CyclesTab.jsx       Cycle management — start, complete, stats table
            ├── LogsTab.jsx         Filterable scrollable daily logs table
            ├── ResultsTab.jsx      Predictions + model explanation panel
            ├── InsightsTab.jsx     Charts: CI trend, cycle length, symptoms, mood
            ├── JournalWindow.jsx   Journal (ruled paper + weather) and daily habits tabs
            ├── ETFWindow.jsx       Islamic ETF tracker — live charts, investments
            └── HomeWidgets.jsx     Home screen widgets — cycle, journal, ETF summaries
```

---

## File reference

### Root

**`app.py`**
The single command you run to launch the app. Starts FastAPI in a background
thread, waits for it to be ready, then opens a PyWebView native desktop window.
Accepts `--dev` to point the window at the Vite dev server, and `--api-only`
to run without a window (useful for testing routes at `localhost:8000/docs`).

**`config.py`**
Single source of truth for all constants: file paths, cycle biology thresholds,
model phase cutoffs (3 cycles to Bayesian, 8 cycles to LSTM), and LSTM
hyperparameters. Reads `DB_URL` and `MODEL_DIR` from `.env` via `python-dotenv`.

**`demo.py`**
Runs the full prediction pipeline with synthetic data — no PostgreSQL required.
Simulates 1, 3, 6, and 10 personal cycles to show how predictions narrow across
all three model phases.

**`pipeline.py`**
CLI orchestrator for the ML pipeline:
- `--setup`   trains the population prior from public data
- `--predict` generates and stores a next-cycle prediction
- `--update`  runs after a cycle completes — Bayesian update + LSTM fine-tune
- `--status`  shows current phase and cycles logged
- `--results` displays stored predictions from the database

**`requirements.txt`**
All Python dependencies. Key packages: `fastapi` and `uvicorn` (API server),
`psycopg2-binary` (PostgreSQL), `scikit-learn`, `scipy`, `xgboost` (ML pipeline),
`pywebview` (native window), `requests` (ETF data proxy).
`torch` is commented out — only needed at Phase 3 (8+ cycles).

**`schema.sql`**
PostgreSQL DDL. Creates `cycles`, `daily_logs`, `model_runs`,'daily_habits','journal_entries' tables and the
`cycle_summaries` view. Apply with: `psql -d period_tracker -f schema.sql`

**`setup.sh`**
Automates the entire first-time setup: installs Python deps, applies the
database schema, creates `.env`, trains the population prior, and builds
the React frontend.

---

### `api/`

**`api/main.py`**
FastAPI application. Wraps the Python pipeline, database connector, and external
data sources so the React frontend can reach them all over HTTP.
In production, also serves the compiled React app from `frontend/dist/`.

| Method | Route                                  | Purpose                                              |
|--------|----------------------------------------|------------------------------------------------------|
| GET    | `/api/status`                          | Model phase, cycles logged, next period estimate     |
| GET    | `/api/cycles`                          | All cycles (completed + active)                      |
| GET    | `/api/cycles/active`                   | The current incomplete cycle                         |
| POST   | `/api/cycles/dates`                    | Save period end and ovulation date for active cycle  |
| POST   | `/api/cycles/start`                    | Open a new cycle                                     |
| POST   | `/api/cycles/complete`                 | Close cycle, Bayesian update, new prediction         |
| GET    | `/api/logs`                            | All daily logs joined with cycle number              |
| POST   | `/api/logs`                            | Insert one daily log row                             |
| GET    | `/api/predictions`                     | Stored model_runs rows                               |
| POST   | `/api/predict`                         | Run prediction and store result                      |
| GET    | `/api/insights`                        | Aggregated data for Insights charts                  |
| GET    | `/api/journal/{date}`                  | Fetch journal entry for a given date                 |
| POST   | `/api/journal`                         | Save or update a journal entry (upsert)              |
| GET    | `/api/habits/{date}`                   | Fetch habits entry for a given date                  |
| POST   | `/api/habits`                          | Save or update a habits entry (upsert)               |
| GET    | `/api/etf/{symbol}/investments`        | Fetch saved investments for a ticker from DB         |
| POST   | `/api/etf/investments`                 | Fetch closing price from Yahoo Finance and store     |
| DELETE | `/api/etf/investments/{investment_id}` | Delete a stored investment                           |
| GET    | `/api/etf/{symbol}`                    | Proxy Yahoo Finance chart data for an ETF ticker     |

The ETF route accepts a `?range=1wk|1mo|1y` query parameter and maps it to
Yahoo Finance interval values. It handles CORS, user-agent spoofing, and
normalises the response to `{ symbol, data, current, prev_close, currency }`.

---

### `db/`

**`db/connector.py`**
All database interaction in one file. Uses raw `psycopg2` with a context-manager
connection helper. No ORM — plain SQL for transparency and performance.

Key functions:

*Cycles*
- `insert_cycle` / `complete_cycle` — cycle lifecycle writes
- `get_completed_cycles` / `get_active_cycle` / `get_all_cycles_raw` — cycle reads
- `get_last_n_cycle_lengths` — returns cycle lengths as a plain list for the model

*Daily logs*
- `insert_daily_log` — dynamic column builder; accepts any subset of log columns as kwargs
- `get_all_logs_with_cycle` — joined logs + cycle number for the Daily Logs tab

*Habits*
- `get_habits` — fetch one habits row by date; returns None if no entry exists
- `upsert_habits` — insert or update water intake, prayers, Quran, to-dos, and project ideas for a date (ON CONFLICT DO UPDATE); wraps `todos` in `psycopg2.extras.Json` for JSONB storage

*Journal*
- `get_journal_entry` — fetch one journal entry by date; returns None if no entry exists
- `upsert_journal_entry` — insert or update a journal entry (ON CONFLICT DO UPDATE)

*ETF investments*
- `get_etf_investments` — fetch all investments for a ticker symbol, ordered by date
- `add_etf_investment` — insert a new investment row; computes `units = amount / price_on_date` and stores it alongside the amount, date, and notes; returns the new UUID
- `delete_etf_investment` — delete an investment row by UUID

*Model*
- `get_insights_data` — four aggregation queries in one call for the Insights tab
- `save_model_run` / `get_model_runs` — prediction audit trail

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
cycle shifts the posterior mean toward your actual pattern. Personal weight grows
from 37% at 3 cycles to 87% at 7 cycles. Serialised to
`saved_models/bayesian_state.json`.

**`models/lstm.py`**
Two-layer stacked LSTM with Monte Carlo Dropout for uncertainty estimation.
`LSTMTrainer` handles pre-training on public sequences and fine-tuning on
personal sequences at 0.2x learning rate to prevent catastrophic forgetting.
Inference runs 100 stochastic forward passes to produce a full predictive
distribution. Uses Huber loss (delta=2.0) for robustness to outlier cycles.

---

### `data/`

**`data/loaders.py`**
Loads and standardises the two public datasets from local CSV files.

`load_fehring()` — reads `data/raw/fehring_cycle_data.csv`, handles UTF-8 BOM,
rescales `MeanBleedingIntensity` from 0–15 to 0–5 flow scale.

`load_mcphases()` — reads all CSVs from `data/raw/mcphases/`, infers cycle
boundaries from LH peaks, merges optional wearable enrichment files.

`irregular_subset()` — filters to subjects with cycle std > 7 days or mean >= 30
days, matching the target user profile.

**`data/preprocessor.py`**
Converts raw cycle records into feature matrices. Computes rolling statistics
(personal mean, std, last-3 mean/std, linear trend, deviation, irregularity flag),
builds LSTM sequences with a 6-cycle lookback, and handles StandardScaler
persistence for consistent normalisation between training and inference.

---

### `frontend/`

**`frontend/index.html`**
HTML entry point. Sets the Press Start 2P pixel font via Google Fonts, Tabler
Icons via CDN, pink-to-mauve gradient background, tile grid overlay, custom pixel
heart cursor (default), gold star cursor (text inputs), and pink heart cursor
(buttons). All three cursors are SVG data URIs — no image files needed.

**`frontend/vite.config.js`**
Configures Vite with the React plugin and a dev-server proxy that forwards all
`/api/*` requests to FastAPI on port 8000, so the frontend never hardcodes a port.

**`frontend/package.json`**
Runtime dependencies: `react`, `react-dom`, `recharts`. Dev: `vite`,
`@vitejs/plugin-react`. No CSS framework — all styling is inline JS objects
from `theme.js`.

---

### `frontend/src/`

**`src/main.jsx`**
Three-line React entry point. Mounts `<App />` into `#root`.

**`src/App.jsx`**
Multi-window pixel desktop shell. Manages three independent windows (Cycle
Tracker, Journal, ETF Tracker) plus the Home screen. Each window has its own
open/closed state, position, and z-index. Key systems:

- **Left dock** — four pixel SVG icons (house, crescent moon, notebook, bar chart).
  Clicking toggles the corresponding window. Home icon closes all windows and
  returns to the Home screen.
- **Home screen** — shown whenever all windows are closed. Displays three live
  widgets: Cycle summary, Journal preview, and ETF prices. Fades in with a
  greeting based on time of day.
- **AnimatedWindow** — wrapper that animates open/close using CSS transform +
  opacity transitions. On open: spring-bounces from the dock icon position to
  full size. On close: shrinks back toward the dock icon using `transformOrigin`
  set to the button's screen coordinates.
- **Single global drag handler** — one `activeDrag` ref shared across all windows.
  `startDrag(e, pos, setPos)` records the offset; global `mousemove`/`mouseup`
  listeners update the position.
- **Z-index management** — a monotonic counter `zRef` increments on every focus
  event so the clicked window always comes to the front.

**`src/api.js`**
Single file with all `fetch()` calls. All paths prefixed with `/api`. Throws
an `Error` with the server's `detail` message on non-2xx responses. Methods:
`getStatus`, `getCycles`, `getActiveCycle`, `startCycle`, `completeCycle`,
`updateCycleDates`, `getLogs`, `saveLog`, `getPredictions`, `runPredict`,
`getInsights`, `getJournalEntry`, `saveJournalEntry`, `getHabits`, `saveHabits`,
`getETF`, `getETFInvestments`, `addETFInvestment`, `deleteETFInvestment`.

**`src/theme.js`**
Design token file. Exports the full colour palette (`C`), font constant,
bevel shadow strings (`RAISED`, `SUNKEN`), font size scale (`SIZE`), and shared
table cell/header style objects (`TD`, `TH`). Changing a colour here updates
the entire app.

**`src/components/Shared.jsx`**
Reusable pixel UI primitives: `Label`, `SectionLabel`, `Inp`, `Sel`,
`CheckRow`, `RadioRow`, `GroupBox`, `PixelBtn`, `StatCard`, `PhaseTag`,
`Notification`, `LoadingRow`, `EmptyRow`, `PhaseProgress`.

**`src/components/LogTab.jsx`**
Daily entry form. Fields: date, flow intensity (0–5), cervical mucus type,
weight, exercise, sleep hours, sleep quality, stress level, eight mood
checkboxes, nine symptom checkboxes. Calculates `day_of_cycle` automatically
from the active cycle start date before posting to `POST /api/logs`. Detects
existing logs for the selected date (including rows added directly via SQL) and
shows an overwrite confirmation before updating.

**`src/components/CyclesTab.jsx`**
Cycle lifecycle management. Active cycle panel shows start date, days elapsed,
and an end-date picker to mark the cycle complete (validates 15–60 day range).
Completion calls `POST /api/cycles/complete` which triggers the Bayesian update
and returns the new prediction shown in the success notification. Also shows the
phase progress bar, four stat cards, and the full cycles table.

**`src/components/LogsTab.jsx`**
Scrollable table of all daily logs. Client-side filter searches date, cycle
number, mucus type, and moods. Symptom columns use ✓/— indicators. Flow
intensity colour-coded red above 3. Default limit 300 rows.

**`src/components/ResultsTab.jsx`**
Stored predictions from `GET /api/predictions` displayed as cards, newest first.
Each card shows model phase tag, personal cycle count, next length estimate,
80% CI, next period date, ovulation estimate, fertile window, and CI width.
Includes a collapsible model explanation panel.

**`src/components/InsightsTab.jsx`**
Four Recharts visualisations: CI width trend, cycle length history with sleep
overlay, symptom frequency (horizontal bar), and mood frequency. Six insight
callout cards below the charts summarise top symptom, top mood, average sleep,
average stress, phase progress, and prediction count.

**`src/components/JournalWindow.jsx`**
Floating window with two tabs sharing the same date navigation:

*JOURNAL tab* — pixel-art ruled textarea with pink lines and a red left-margin
line. Date navigation with ◄ / ► buttons and a date-picker for jumping to any
past date. Six weather emoji buttons (single-select). Saves via
`POST /api/journal` (upsert). Shows last-saved timestamp and unsaved-changes
indicator. Entries stored in PostgreSQL with TOAST compression — 10 years of
daily entries use under 10 MB.

*HABITS tab* — daily habit tracker for the same date. Sections:
- **Water intake** — eight clickable droplets that fill left to right; click a
  filled droplet to reduce the count
- **Prayers & Quran** — pixel checkboxes for Fajr, Zuhr, Asr, Maghrib, Isha, and
  a Quran recitation toggle; prayer completion count shown in the section title
- **To-do today** — text input with Enter-key support; items have a pixel checkbox
  for done/undone and a ✕ delete button; completed items show strikethrough
- **Project ideas** — text input list with ♥ bullets and ✕ delete; no checkboxes

Habits save independently from the journal entry via `POST /api/habits` (upsert
by date). Each tab has its own save button and last-saved timestamp in the footer.

**`src/components/ETFWindow.jsx`**
Islamic ETF tracker showing live price charts for two funds:

| Ticker   | Fund                                               | Type     |
|----------|----------------------------------------------------|----------|
| ISWD.SW  | iShares MSCI World Islamic UCITS ETF               | USD Dist |
| IGDA.L   | Invesco Dow Jones Islamic Global Developed Markets | USD Acc  |

Three time ranges: 1W (1-hour bars), 1M (daily bars), 1Y (daily bars). Each
chart shows a reference line at the previous close with a footer showing range
high/low, exchange name, and data point count. Auto-refreshes every hour.
Data is fetched via the FastAPI proxy which calls the Yahoo Finance v8 chart API
— the browser never contacts Yahoo Finance directly (avoids CORS). Data is
delayed 15–20 minutes for LSE and SIX listings.

Each ETF has an **Investment panel** below the chart. Add an investment by
entering an amount and date — the backend fetches the closing price on that date
from Yahoo Finance, computes units, and persists the row. The panel shows a
cumulative **Invested vs Current Value** chart using historical price data as the
x-axis, so a single investment still produces a full time-series line.

**`src/components/HomeWidgets.jsx`**
Home screen shown when all windows are closed or when the Home dock button is
clicked. Displays three read-only summary widgets that fade in with a time-of-day
greeting:

- **Cycle widget** — active cycle number, start date, current day, menstrual
  phase (derived from day number: menstrual 1–5, follicular 6–13, ovulatory
  14–16, luteal 17+), and next period prediction from the latest model run
- **Journal widget** — today's date, weather selection, first line of today's
  journal entry, and today's to-do list with pixel checkboxes showing done/undone
  state (read-only; editing happens inside the Journal window)
- **ETF widget** — current price and portfolio value for each tracked ETF,
  fetched from the 1-week price history

All widgets use the same pixel window chrome (title bar, RAISED bevel, C.frame
border) as the main application windows.

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- PostgreSQL running locally

### First-time setup

```bash
cd cycle_tracker_app

# Copy and edit the environment file
cp .env.example .env
# Set: DB_URL=postgresql://user:password@localhost:5432/period_tracker

# Create the database
createdb period_tracker

# Automated setup (installs deps, schema, trains prior, builds frontend)
bash setup.sh
```

### Manual setup (step by step)

```bash
# 1. Python dependencies
pip install -r requirements.txt

# 2. Main database schema
psql -d period_tracker -f schema.sql

# 3. Additional tables
psql -d period_tracker -f journal_migration.sql
psql -d period_tracker -f habits_migration.sql

# 4. Public data — optional but recommended
#    Fehring/Marquette 2012:
#      https://epublications.marquette.edu/data_nfp/7/
#      Save as  data/raw/fehring_cycle_data.csv
#
#    Physionet mcPHASES 2024 (free account required):
#      https://physionet.org/content/mcphases/1.0.0/
#      Save all CSVs flat in  data/raw/mcphases/

# 5. Train population prior
python pipeline.py --setup

# 6. Build the React frontend
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

Opens a native desktop window. FastAPI runs on port 8000 internally.
You do not need to open a browser separately.

---

## Development mode

```bash
# Terminal 1 — FastAPI with auto-reload
uvicorn api.main:app --reload --port 8000

# Terminal 2 — Vite dev server with hot module replacement
cd frontend && npm run dev

# Terminal 3 — PyWebView pointed at Vite
python app.py --dev
```

The Vite proxy forwards `/api/*` to FastAPI automatically. Test API routes
directly at `http://localhost:8000/docs` (Swagger UI).

---

## CLI reference

```bash
# Train population prior — run once after setup
python pipeline.py --setup

# Generate and store a prediction
python pipeline.py --predict
python pipeline.py --predict --day 14

# Update model after a cycle completes
python pipeline.py --update --cycle-number 3

# Show current phase and cycle count
python pipeline.py --status

# View stored predictions
python pipeline.py --results
python pipeline.py --results --limit 20

# Test without PostgreSQL
python demo.py

# API server only, no desktop window
python app.py --api-only
```

---

## Model phases

| Phase | Cycles | Model | Typical CI |
|---|---|---|---|
| `cold_start` | 0–2 | Negative Binomial on irregular-cycle subjects from Fehring and mcPHASES. GradientBoosting for covariate adjustment. | ±10–14 days |
| `bayesian` | 3–7 | Conjugate Gamma-Poisson update. Personal weight grows from 37% at 3 cycles to 87% at 7 cycles. | ±4–7 days |
| `lstm` | 8+ | Two-layer LSTM pre-trained on public data, fine-tuned at 0.2x LR. MC Dropout (100 passes) for uncertainty. 6-cycle lookback. | ±2–4 days |

---

## Database schema

Six tables and one view. `schema.sql` creates the first three; the migration
files add the rest.

**`cycles`** — one row per menstrual cycle. `cycle_length` and `period_duration`
are generated columns (computed from dates, never go out of sync).

**`daily_logs`** — one row per day logged in the Cycle Tracker. Flow intensity
(0–5), cervical mucus type, moods as `TEXT[]`, nine boolean symptom flags, sleep
hours, sleep quality (1–3), stress level (1–3), weight in kg, exercise minutes.
Unique constraint on `(cycle_id, log_date)`.

**`journal_entries`** — one row per calendar day. `entry_date` has a UNIQUE
constraint. `weather` (VARCHAR 30) and `content` (TEXT, TOAST-compressed).
`updated_at` refreshed on every upsert.

**`daily_habits`** — one row per calendar day, keyed by `habit_date` (UNIQUE).
Stores water glass count (INTEGER), five prayer boolean flags (Fajr, Zuhr, Asr,
Maghrib, Isha), Quran recitation flag, `todos` (JSONB array of `{text, done}`
objects), and `project_ideas` (TEXT array). Completely independent from
`daily_logs` — a habit entry does not require a cycle to be active.

**`etf_investments`** — one row per investment entry. Stores ticker symbol,
amount invested, investment date, closing price on that date (fetched from
Yahoo Finance at insert time), and computed units (`amount / price_on_date`).
The units field is used by the frontend to calculate current portfolio value
against live prices.

**`model_runs`** — audit trail. Every prediction stored with full `JSONB`
payload, model phase string, and personal cycle count at the time of the run.

**`cycle_summaries`** (view) — joins `cycles` and `daily_logs` to produce one
aggregate row per completed cycle: average flow, sleep, stress; total days with
each symptom; dominant mood.

---

## Privacy

All personal data (cycles, logs, journal entries, habits, investments) is stored
locally in your PostgreSQL instance. Nothing is sent to any external server.

The one exception is the ETF Tracker: live price data and historical investment
prices are fetched from Yahoo Finance via the FastAPI proxy. No personal data is
included in those requests — they only ask for publicly available market prices
by ticker symbol.

The public datasets (Fehring, mcPHASES) are used only during `--setup` and are
not consulted again after that.
