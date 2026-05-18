// components/InsightsTab.jsx — data visualisations from /api/insights

import { useState, useEffect } from 'react'
import {
  BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { api } from '../api.js'
import { C, FONT, SIZE } from '../theme.js'
import { SectionLabel } from './Shared.jsx'

const TT_STYLE = {
  fontFamily: FONT, fontSize: SIZE.md,
  background: '#FFF0F5', border: `1px solid ${C.grd}`,
  padding: '4px 8px', color: '#3A0018',
}

function ChartWrap({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{
        background: C.r1, border: `1px solid ${C.grd}`, padding: '8px 8px 4px',
      }}>
        {children}
        {subtitle && (
          <div style={{
            fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
            textAlign: 'center', marginTop: 2, paddingBottom: 2,
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

function InsightCard({ label, value, sub }) {
  return (
    <div style={{
      background: C.r2, border: `1px solid ${C.grd}`,
      padding: '6px 8px',
      boxShadow: `inset -1px -1px 0 ${C.hi}`,
    }}>
      <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut, letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontFamily: FONT, fontSize: SIZE.md, color: C.txt, fontWeight: 'bold', margin: '2px 0' }}>{value}</div>
      <div style={{ fontFamily: FONT, fontSize: SIZE.sm, color: C.sage }}>{sub}</div>
    </div>
  )
}

function NoData({ msg = 'LOG MORE CYCLES TO SEE THIS CHART' }) {
  return (
    <div style={{
      height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, fontSize: SIZE.sm, color: C.mut,
    }}>
      {msg}
    </div>
  )
}

export default function InsightsTab({ refreshKey }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getInsights()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [refreshKey])

  if (loading) {
    return (
      <div style={{ padding: '10px 12px', fontFamily: FONT, fontSize: SIZE.md, color: C.mut, textAlign: 'center' }}>
        LOADING INSIGHTS…
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: '10px 12px', fontFamily: FONT, fontSize: SIZE.md, color: C.mut, textAlign: 'center' }}>
        COULD NOT LOAD INSIGHTS — IS THE DB CONNECTED?
      </div>
    )
  }

  // ── Transform data for charts ───────────────────────────────────────────

  // CI width narrowing (from model_runs predictions JSON)
  const ciData = (data.model_runs || []).map((r, i) => {
    const p  = r.predictions || {}
    const lo = p.ci_lower_80 ?? p.ci_lower ?? 0
    const hi = p.ci_upper_80 ?? p.ci_upper ?? 0
    return {
      label:    `Run ${i + 1}`,
      width:    hi - lo,
      estimate: p.point_estimate ?? 0,
      phase:    r.model_phase,
    }
  })

  // Cycle length vs prediction
  const cycleData = (data.cycle_stats || []).map(c => ({
    name:    `Cycle ${c.cycle_number}`,
    actual:  Number(c.cycle_length) || null,
    sleep:   Number(c.avg_sleep)   || null,
    stress:  Number(c.avg_stress)  || null,
  }))

  // Symptom frequency
  const symMap = {
    cramps:        'Cramps',
    bloating:      'Bloating',
    breast_tender: 'Breast tender',
    headache:      'Headache',
    acne:          'Acne',
    back_pain:     'Back pain',
    nausea:        'Nausea',
    fatigue:       'Fatigue',
    ov_pain:       'Ov. pain',
  }
  const symData = Object.entries(data.symptoms || {})
    .map(([k, v]) => ({ name: symMap[k] || k, value: Number(v) || 0 }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)

  // Mood frequency
  const moodData = (data.moods || []).map(m => ({
    name: m.mood, value: Number(m.count) || 0,
  }))

  // Derive insight callouts from available data
  const topSym   = symData[0]
  const topMood  = moodData[0]
  const hasLogs  = symData.length > 0

  // Avg sleep and stress across all cycle stats
  const allSleep  = cycleData.filter(d => d.sleep).map(d => d.sleep)
  const avgSleep  = allSleep.length ? (allSleep.reduce((s,v)=>s+v,0)/allSleep.length).toFixed(1) : '—'
  const allStress = cycleData.filter(d => d.stress).map(d => d.stress)
  const avgStress = allStress.length ? (allStress.reduce((s,v)=>s+v,0)/allStress.length).toFixed(1) : '—'

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' }}>

      {/* Chart 1: CI width narrowing */}
      <ChartWrap
        title="MODEL IMPROVEMENT — CONFIDENCE INTERVAL WIDTH OVER TIME"
        subtitle={ciData.length > 1 ? 'target: <8d (bayesian) · <4d (lstm)' : undefined}
      >
        {ciData.length < 2
          ? <NoData msg="RUN 2+ PREDICTIONS TO SEE CI TREND" />
          : (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={ciData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke={C.grd} />
                <XAxis dataKey="label" tick={{ fontFamily: FONT, fontSize: SIZE.md, fill: C.mut }} />
                <YAxis tick={{ fontFamily: FONT, fontSize: SIZE.md, fill: C.mut }} />
                <Tooltip contentStyle={TT_STYLE} formatter={v => [`${v} days`, 'CI width']} />
                <Bar dataKey="width" radius={0} name="CI width">
                  {ciData.map((_, i) => (
                    <Cell key={i} fill={C.sage} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </ChartWrap>

      {/* Chart 2: Cycle length actual vs predicted */}
      <ChartWrap
        title="CYCLE LENGTH HISTORY"
        subtitle="bars = actual completed cycles"
      >
        {cycleData.length === 0
          ? <NoData msg="COMPLETE 1+ CYCLES TO SEE LENGTH HISTORY" />
          : (
            <ResponsiveContainer width="100%" height={120}>
              <ComposedChart data={cycleData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke={C.grd} />
                <XAxis dataKey="name" tick={{ fontFamily: FONT, fontSize: SIZE.md, fill: C.mut }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontFamily: FONT, fontSize: SIZE.md, fill: C.mut }} />
                <Tooltip contentStyle={TT_STYLE} />
                <Bar dataKey="actual" name="actual (days)" fill={C.bar} radius={0} />
                <Line
                  type="monotone" dataKey="sleep"
                  name="avg sleep (hrs)" stroke="#B5664A"
                  strokeWidth={1.5} dot={{ r: 2, fill: '#C4506A' }}
                  strokeDasharray="3 2"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )
        }
      </ChartWrap>

      {/* Chart 3: Symptom frequency */}
      <ChartWrap
        title="SYMPTOM FREQUENCY — ALL LOGGED DAYS"
        subtitle={symData.length > 0 ? 'total days each symptom was logged' : undefined}
      >
        {symData.length === 0
          ? <NoData msg="LOG SYMPTOMS TO SEE FREQUENCY CHART" />
          : (
            <ResponsiveContainer width="100%" height={Math.max(100, symData.length * 22 + 10)}>
              <BarChart
                data={symData} layout="vertical"
                margin={{ top: 2, right: 24, left: 20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="2 2" stroke={C.grd} horizontal={false} />
                <XAxis type="number" tick={{ fontFamily: FONT, fontSize: SIZE.md, fill: C.mut }} />
                <YAxis
                  type="category" dataKey="name" width={72}
                  tick={{ fontFamily: FONT, fontSize: SIZE.md, fill: C.mut }}
                />
                <Tooltip contentStyle={TT_STYLE} formatter={v => [`${v} days`, 'symptom']} />
                <Bar dataKey="value" name="days" radius={0} fill={C.frame} />
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </ChartWrap>

      {/* Chart 4: Mood distribution */}
      {moodData.length > 0 && (
        <ChartWrap title="MOOD FREQUENCY — ALL LOGGED DAYS">
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={moodData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={C.grd} />
              <XAxis dataKey="name" tick={{ fontFamily: FONT, fontSize: SIZE.md, fill: C.mut }} />
              <YAxis tick={{ fontFamily: FONT, fontSize: SIZE.md, fill: C.mut }} />
              <Tooltip contentStyle={TT_STYLE} formatter={v => [`${v} days`, 'mood']} />
              <Bar dataKey="value" fill="#8BAAB6" radius={0} name="days" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>
      )}

      {/* Insight callouts */}
      <SectionLabel>PATTERNS DETECTED</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <InsightCard
          label="MOST COMMON SYMPTOM"
          value={topSym ? `${topSym.name} (${topSym.value}d)` : 'Not enough data yet'}
          sub={topSym ? 'across all logged cycles' : 'log more to see patterns'}
        />
        <InsightCard
          label="MOST COMMON MOOD"
          value={topMood ? `${topMood.name} (${topMood.value}d)` : 'Not enough data yet'}
          sub={topMood ? 'across all logged days' : 'log moods to see patterns'}
        />
        <InsightCard
          label="AVERAGE SLEEP"
          value={avgSleep !== '—' ? `${avgSleep} hrs / night` : 'Not enough data yet'}
          sub="mean across all completed cycles"
        />
        <InsightCard
          label="AVERAGE STRESS"
          value={avgStress !== '—' ? `${avgStress} / 3` : 'Not enough data yet'}
          sub="1 = low · 2 = moderate · 3 = high"
        />
        <InsightCard
          label="CYCLES COMPLETED"
          value={`${cycleData.length} cycles`}
          sub={cycleData.length < 3 ? `${3 - cycleData.length} more to Bayesian phase` : cycleData.length < 8 ? `${8 - cycleData.length} more to LSTM phase` : 'LSTM phase active'}
        />
        <InsightCard
          label="TOTAL DAYS LOGGED"
          value={`${(data.model_runs || []).length} predictions stored`}
          sub="model improves with each new cycle"
        />
      </div>
    </div>
  )
}