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
      borderRadius: "5px"
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
// ── Model explanation component ───────────────────────────────────────────────

const PHASE_INFO = {
  cold_start: {
    name: 'COLD START (0–2 cycles)',
    color: '#F090A8',
    desc: 'Uses a Negative Binomial distribution fitted to 1,600+ cycles from the Fehring/Marquette and mcPHASES public datasets, filtered to irregular-cycle users. NB is preferred over Gaussian because cycle lengths are positive integers with right-skew — very long cycles happen but very short ones do not, which a bell curve cannot model honestly.',
  },
  bayesian: {
    name: 'BAYESIAN (3–7 cycles)',
    color: '#FFB8C8',
    desc: 'Upgrades to a Gamma-Poisson conjugate update. Each new cycle you log shifts the model posterior toward your personal pattern. Personal weight grows from 37% at 3 cycles to 87% at 7 cycles. No neural network needed — pure statistics with a closed-form update (one line of math per new cycle).',
  },
  lstm: {
    name: 'LSTM NEURAL NETWORK (8+ cycles)',
    color: '#C4E8D0',
    desc: 'A 2-layer LSTM pre-trained on population data and fine-tuned on your personal sequence. Monte Carlo Dropout runs 100 forward passes at inference time to produce a full probability distribution rather than a single guess. Fine-tuned at 0.2x learning rate to prevent the network from forgetting population patterns.',
  },
}

function InfoBlock({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontFamily: FONT, fontSize: SIZE.xs, color: C.frame,
        letterSpacing: '.06em', marginBottom: 4,
        borderLeft: `3px solid ${C.frame}`, paddingLeft: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: FONT, fontSize: 7, color: C.txt,
        lineHeight: 2, paddingLeft: 10,
      }}>
        {children}
      </div>
    </div>
  )
}

function ModelExplanation({ personalCycles }) {
  const [open, setOpen] = useState(false)

  const phase = personalCycles < 3 ? 'cold_start' : personalCycles < 8 ? 'bayesian' : 'lstm'
  const phaseInfo = PHASE_INFO[phase]

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
          background: C.face, border: `1px solid ${C.grd}`,
          boxShadow: open ? SUNKEN : RAISED,
          padding: '4px 12px', cursor: 'pointer', width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          letterSpacing: '.04em',borderRadius: "5px"
        }}
      >
        <span>ABOUT THIS MODEL — WHAT AM I LOOKING AT?</span>
        <span>{open ? '\u25b2 HIDE' : '\u25bc SHOW'}</span>
      </button>

      {open && (
        <div style={{
          background: C.r1, border: `1px solid ${C.grd}`,
          borderTop: 'none', padding: '12px 14px',
        }}>

          {/* Current phase */}
          <div style={{
            background: phaseInfo.color, padding: '8px 10px', marginBottom: 12,
            border: `1px solid ${C.frame}`,borderRadius: "5px"
          }}>
            <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: '#3A0018', letterSpacing: '.06em', marginBottom: 4 }}>
              YOUR CURRENT MODEL PHASE
            </div>
            <div style={{ fontFamily: FONT, fontSize: 8, color: '#3A0018', fontWeight: 'bold', marginBottom: 4 }}>
              {phaseInfo.name}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 7, color: '#3A0018', lineHeight: 2 }}>
              {phaseInfo.desc}
            </div>
          </div>

          <InfoBlock label="WHAT THE PREDICTION FIELDS MEAN">
            <div><strong>NEXT LENGTH EST.</strong> — The model's best single guess for how many days your next cycle will last.</div>
            <div><strong>80% CI [X – Y days]</strong> — There is an 80% probability your next cycle falls between X and Y days. Narrower = more confident.</div>
            <div><strong>CI WIDTH</strong> — Your uncertainty window in days. This SHRINKS as you log more cycles. Target: &lt;8 days (Bayesian), &lt;4 days (LSTM).</div>
            <div><strong>NEXT PERIOD</strong> — Calendar date estimate: last cycle start + predicted length.</div>
            <div><strong>EST. OVULATION</strong> — Estimated as: next period date − 14 days (stable luteal phase assumption).</div>
            <div><strong>FERTILE WINDOW</strong> — 5 days before estimated ovulation + ovulation day = 6-day window.</div>
            <div><strong>CONFIDENCE</strong> — How much of the prediction comes from YOUR personal data vs population averages. Grows with every new cycle.</div>
            <div><strong>NB_MU / NB_R</strong> — Parameters of the Negative Binomial distribution. mu = population mean cycle length for your profile. r = dispersion (higher r = tighter distribution).</div>
            <div><strong>PERSONAL_WEIGHT</strong> — At 37% (3 cycles) the model is mostly population. At 100% (LSTM phase) it is entirely yours.</div>
          </InfoBlock>

          <InfoBlock label="FEATURES THE MODEL LEARNS FROM">
            <div><strong>Cycle length history</strong> — The last 6 completed cycle lengths (LSTM) or all cycles (Bayesian).</div>
            <div><strong>Personal mean & std dev</strong> — Your average cycle length and how variable it is.</div>
            <div><strong>Trend</strong> — Whether your cycles are getting longer or shorter over time (linear slope).</div>
            <div><strong>Period duration</strong> — How many days your period lasts per cycle.</div>
            <div><strong>Average flow, sleep, stress</strong> — Aggregated from your daily logs. Higher stress correlates with delayed ovulation.</div>
            <div><strong>Deviation from mean</strong> — How much the most recent cycle differed from your personal average.</div>
          </InfoBlock>

          <InfoBlock label="HOW TO IMPROVE ACCURACY">
            <div>Log EVERY day during your cycle — especially flow, sleep, and stress.</div>
            <div>Mark cycles complete as soon as your next period starts so the model gets accurate lengths.</div>
            <div>At 3 cycles: Bayesian phase unlocks. Confidence interval narrows by ~30%.</div>
            <div>At 8 cycles: LSTM phase unlocks. The model learns YOUR temporal patterns directly.</div>
          </InfoBlock>

          <InfoBlock label="EVALUATION METRICS">
            <div><strong>MAE (Mean Absolute Error)</strong> — Average error in days across all stored predictions. Target: &lt;3 days at LSTM phase. Currently: computed when actual vs predicted can be compared.</div>
            <div><strong>CI Width</strong> — Primary maturity metric. Cold start: ~24–28 days. Bayesian: ~8–12 days. LSTM: ~3–6 days.</div>
            <div><strong>Personal Weight %</strong> — How personalised the model is. 0% = pure population; 100% = entirely your data.</div>
            <div><strong>NB_R (dispersion)</strong> — How well the model captures your cycle variability. Higher R = the model believes you are more regular.</div>
          </InfoBlock>

        </div>
      )}
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
        padding: '8px 10px', marginBottom: 10, borderRadius: "5px"
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
            borderRadius: "5px"
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
   {/* ── Model explanation ────────────────────────────────────────────── */}
      <div style={{ marginTop: 16, borderTop: `2px solid ${C.grd}`, paddingTop: 10 }}>
        <ModelExplanation personalCycles={runs.length > 0 ? runs[runs.length - 1]?.personal_cycles : 0} />
      </div>
    </div>
  )
}

