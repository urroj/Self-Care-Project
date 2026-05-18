#!/usr/bin/env bash
# setup.sh — cycle.tracker first-time setup
# Run once: bash setup.sh
# Then start the app: python app.py

set -e

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   cycle.tracker — setup v2.0    ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# ── 1. Python dependencies ───────────────────────────────────────────────────
echo "  [1/5] Installing Python dependencies…"
pip install -r requirements.txt --quiet
echo "  ✓ Python dependencies installed"

# ── 2. PostgreSQL database ───────────────────────────────────────────────────
echo "  [2/5] Applying database schema…"
echo "  (Requires PostgreSQL running and period_tracker DB to exist)"
echo "  If needed, first run:  createdb period_tracker"
psql -d period_tracker -f db/schema.sql -q && echo "  ✓ Schema applied" || {
  echo "  ✗ Could not apply schema — set DB_URL in .env and re-run"
  echo "    Example: export DB_URL=postgresql://user:pass@localhost:5432/period_tracker"
}

# ── 3. Environment file ──────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "  [3/5] Creating .env from example…"
  cp .env.example .env
  echo "  ✓ .env created — edit it with your DB credentials"
else
  echo "  [3/5] .env already exists, skipping"
fi

# ── 4. ML pipeline setup (trains on public data) ─────────────────────────────
echo "  [4/5] Running ML pipeline setup (public data → population prior)…"
echo "  (Place fehring_cycle_data.csv in data/raw/ for best results)"
python pipeline.py --setup
echo "  ✓ ML prior trained"

# ── 5. Frontend build ────────────────────────────────────────────────────────
echo "  [5/5] Building React frontend…"
cd frontend

if ! command -v npm &> /dev/null; then
  echo "  ✗ npm not found. Install Node.js from https://nodejs.org/ then re-run."
  exit 1
fi

echo "  Installing npm packages…"
npm install --silent
echo "  Building production bundle…"
npm run build --silent
cd ..
echo "  ✓ Frontend built → frontend/dist/"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║           SETUP COMPLETE        ║"
echo "  ╚══════════════════════════════════╝"
echo ""
echo "  Launch the app:"
echo "    python app.py                 # native desktop window"
echo ""
echo "  Development mode (hot-reload):"
echo "    Terminal 1:  uvicorn api.main:app --reload --port 8000"
echo "    Terminal 2:  cd frontend && npm run dev"
echo "    Terminal 3:  python app.py --dev"
echo ""
