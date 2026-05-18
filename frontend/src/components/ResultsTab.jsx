// components/ResultsTab.jsx — stored model_runs + run-prediction button

import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { C, FONT, RAISED, SUNKEN ,SIZE} from '../theme.js'
import { PhaseTag, PixelBtn, SectionLabel } from './Shared.jsx'

function Field({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut, letterSpacing: '.04em' }}>{label}</div>
      <div style={{
        fontFamily: FONT, fontSize: SIZE.lg,
        color: accent ? C.sage : C.txt,
        fontWeight: accent ? 'bold' : 'normal',
        marginTop: 1,
      }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

function RunCard({ run, index, total }) {
  const p   = run.predictions || {}
  const lo  = p.ci_lower_80 ?? p.ci_lower ?? '?'
  const hi  = p.ci_upper_80 ?? p.ci_upper ?? '?'
  const ts  = String(run.run_date || '').slice(0, 16).replace('T', ' ')

  return (
    <div style={{
      border: `1px solid ${C.grd}`,
      background: index % 2 === 0 ? C.r1 : C.r2,
      padding: '8px 10px', marginBottom: 6,
      boxShadow: `inset -1px -1px 0 ${C.hi}`,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 6,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: FONT, fontSize: SIZE.xs, fontWeight: 'bold', color: C.txt }}>
            PREDICTION #{total - index}
          </span>
          <PhaseTag phase={run.model_phase} />
        </div>
        <span style={{ fontFamily: FONT, fontSize: SIZE.sm, color: C.mut }}>{ts}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <Field label="PERSONAL CYCLES"    value={run.personal_cycles} />
        <Field label="NEXT LENGTH EST."   value={p.point_estimate ? `${p.point_estimate}d` : '—'} accent />
        <Field label="80% CI"             value={`[${lo} – ${hi}] days`} />
        <Field label="NEXT PERIOD"        value={p.next_period_start_est} />
        <Field label="EST. OVULATION"     value={p.ovulation_date_est} />
        <Field label="CI WIDTH"
          value={lo !== '?' && hi !== '?' ? `${hi - lo}d uncertainty` : '—'} />
        {p.fertile_window_start && (
          <Field label="FERTILE WINDOW"
            value={`${p.fertile_window_start} → ${p.fertile_window_end}`} />
        )}
        {p.confidence && (
          <Field label="CONFIDENCE" value={p.confidence} />
        )}
      </div>
    </div>
  )
}

export default function ResultsTab({ refreshKey, notify }) {
  const [runs, setRuns]       = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [dayInput, setDayInput] = useState('1')

  const load = () => {
    setLoading(true)
    api.getPredictions()
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false))
  }

  useEffect(load, [refreshKey])

  const handleRunPredict = async () => {
    setRunning(true)
    try {
      await api.runPredict(parseInt(dayInput) || 1)
      notify('ok', 'PREDICTION RUN AND STORED')
      load()
    } catch (e) {
      notify('err', e.message || 'PREDICTION FAILED')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' }}>

      {/* Run prediction bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: C.r1, border: `1px solid ${C.grd}`,
        padding: '8px 10px', marginBottom: 10,
      }}>
        <span style={{ fontFamily: FONT, fontSize: SIZE.sm, color: C.mut }}>
          RUN NEW PREDICTION · today is cycle day
        </span>
        <input
          type="number" min="1" max="60"
          value={dayInput}
          onChange={e => setDayInput(e.target.value)}
          style={{
            fontFamily: FONT, fontSize: SIZE.md, color: C.txt,
            background: '#FEFAF4', border: `1px solid ${C.grd}`,
            boxShadow: `inset 1px 1px 0 ${C.sh}`,
            padding: '2px 5px', width: 50, outline: 'none',
          }}
        />
        <PixelBtn onClick={handleRunPredict} disabled={running} color={C.sage}>
          {running ? 'RUNNING…' : '▶ RUN'}
        </PixelBtn>
        <span style={{ fontFamily: FONT, fontSize: SIZE.md, color: C.mut, marginLeft: 'auto' }}>
          {runs.length} STORED PREDICTIONS
        </span>
      </div>

      {/* Predictions list */}
      <SectionLabel>MODEL_RUNS TABLE · SORTED BY DATE DESC</SectionLabel>

      {loading ? (
        <div style={{ fontFamily: FONT, fontSize: SIZE.sm, color: C.mut, padding: '12px 0', textAlign: 'center' }}>
          LOADING…
        </div>
      ) : runs.length === 0 ? (
        <div style={{
          fontFamily: FONT, fontSize: SIZE.sm, color: C.mut,
          padding: '16px 0', textAlign: 'center', border: `1px dashed ${C.grd}`,
        }}>
          NO PREDICTIONS YET · Click ▶ RUN to generate your first prediction
        </div>
      ) : (
        [...runs].reverse().map((r, i) => (
          <RunCard key={r.id || i} run={r} index={i} total={runs.length} />
        ))
      )}
    </div>
  )
}