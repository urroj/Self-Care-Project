"""
config.py — Central configuration for the period tracker ML pipeline.
Reads secrets from a .env file so nothing sensitive is hard-coded.

Create a .env file in the project root:
    DB_URL=postgresql://user:password@localhost:5432/period_tracker
    MODEL_DIR=/home/you/period_tracker/saved_models
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
DATA_DIR   = BASE_DIR / "data" / "raw"
MODEL_DIR  = Path(os.getenv("MODEL_DIR", BASE_DIR / "saved_models"))
CACHE_DIR  = BASE_DIR / "data" / "cache"

for d in [DATA_DIR, MODEL_DIR, CACHE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ── Database ───────────────────────────────────────────────────────────────
DB_URL = os.getenv(
    "DB_URL",
    "postgresql://postgres:postgres@localhost:5432/period_tracker"
)

# ── Cycle Biology Constants ────────────────────────────────────────────────
# Irregular cycle definition: variation > 7 days across cycles
IRREGULAR_THRESHOLD_DAYS = 7

# Fertile window = ovulation day + 5 preceding days
FERTILE_WINDOW_DAYS_BEFORE = 5

# Minimum/maximum plausible cycle lengths
MIN_CYCLE_DAYS = 21
MAX_CYCLE_DAYS = 60

# Luteal phase is fairly stable: 12–16 days
LUTEAL_PHASE_MEAN = 14
LUTEAL_PHASE_STD  = 2

# ── Model Phases ──────────────────────────────────────────────────────────
# Phase thresholds (number of PERSONAL completed cycles in the DB)
PHASE_COLD_START     = 3   # < 3  → population prior only
PHASE_BAYESIAN       = 8   # 3–7  → Bayesian personalisation
PHASE_LSTM           = 8   # 8+   → fine-tune LSTM on personal sequence

# ── Training ──────────────────────────────────────────────────────────────
LSTM_HIDDEN_SIZE  = 64
LSTM_NUM_LAYERS   = 2
LSTM_DROPOUT      = 0.2
LSTM_LOOKBACK     = 6      # number of past cycles fed into LSTM
LSTM_EPOCHS       = 150
LSTM_LR           = 1e-3
LSTM_BATCH_SIZE   = 32

RANDOM_SEED = 42
