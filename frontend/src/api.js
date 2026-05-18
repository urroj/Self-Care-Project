// api.js — typed client for the FastAPI backend

const BASE = '/api'

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // ── Status ───────────────────────────────────────────────────────────────
  getStatus: () => req('/status'),

  // ── Cycles ───────────────────────────────────────────────────────────────
  getCycles:      () => req('/cycles'),
  getActiveCycle: () => req('/cycles/active'),

  startCycle: (data) => req('/cycles/start', {
    method: 'POST', body: JSON.stringify(data),
  }),
  completeCycle: (data) => req('/cycles/complete', {
    method: 'POST', body: JSON.stringify(data),
  }),

  // ── Daily logs ────────────────────────────────────────────────────────────
  getLogs:  (limit = 300) => req(`/logs?limit=${limit}`),
  saveLog:  (data) => req('/logs', { method: 'POST', body: JSON.stringify(data) }),

  // ── Predictions ───────────────────────────────────────────────────────────
  getPredictions: () => req('/predictions'),
  runPredict:     (day = 1) => req(`/predict?day=${day}`, { method: 'POST' }),

  // ── Insights ──────────────────────────────────────────────────────────────
  getInsights: () => req('/insights'),
}
