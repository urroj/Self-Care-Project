// components/HomeWidgets.jsx — home screen widgets shown when all windows are closed

import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { C, FONT, SIZE } from '../theme.js'

const TODAY = new Date().toLocaleDateString('sv')

function dayOfCycle(startDate) {
  if (!startDate) return null
  return Math.max(1, Math.round((new Date(TODAY) - new Date(startDate)) / 86_400_000) + 1)
}

// ── Widget chrome ─────────────────────────────────────────────────────────────
function WidgetCard({ title, children, width = 265, barColor }) {
  return (
    <div style={{
      width,
      border: `2px solid ${C.frame}`,
      boxShadow: `3px 3px 0 ${C.sh}, 0 10px 28px rgba(122,26,56,0.20)`,
      background: C.win,
      fontFamily: FONT,
    }}>
      <div style={{
        background: barColor || C.bar,
        padding: '5px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `2px solid ${C.frame}`,
        userSelect: 'none',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.50)', fontSize: 7, letterSpacing: 3 }}>♥ ♥ ♥</span>
        <span style={{ color: '#fff', fontSize: SIZE.xs, letterSpacing: '.1em' }}>{title}</span>
        <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 8 }}>✕</span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        {children}
      </div>
    </div>
  )
}

function WRow({ label, value, valueColor }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginBottom: 5,
    }}>
      <span style={{ fontSize: 7, color: C.mut }}>{label}</span>
      <span style={{ fontSize: SIZE.xs, color: valueColor || C.txt }}>{value ?? '—'}</span>
    </div>
  )
}

function WDivider() {
  return <div style={{ borderTop: `1px solid ${C.grd}`, margin: '7px 0' }} />
}

// ── Cycle Widget ──────────────────────────────────────────────────────────────
function getCyclePhase(day) {
  if (!day) return null
  if (day <= 5)  return { label: 'MENSTRUAL',   color: '#C4506A' }
  if (day <= 13) return { label: 'FOLLICULAR',  color: '#5A8E72' }
  if (day <= 16) return { label: 'OVULATORY',   color: '#9A4060' }
  return           { label: 'LUTEAL',      color: '#7A4A00' }
}

function CycleWidget({ activeCycle, status }) {
  const isLoading  = activeCycle === undefined
  const nextPeriod = status?.next_period_est
  const day        = activeCycle ? dayOfCycle(activeCycle.start_date) : null
  const phase      = getCyclePhase(day)

  return (
    <WidgetCard title="CYCLE TRACKER">
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '14px 0', fontSize: SIZE.xs, color: C.mut }}>
          LOADING…
        </div>
      ) : activeCycle ? (
        <>
          <div style={{ textAlign: 'center', paddingBottom: 8 }}>
            <div style={{ fontSize: 7, color: C.mut, marginBottom: 4 }}>ACTIVE CYCLE</div>
            <div style={{ fontSize: SIZE.lg, color: C.frame }}>CYCLE #{activeCycle.cycle_number}</div>
          </div>
          <WDivider />
          <WRow label="STARTED"     value={String(activeCycle.start_date).slice(0, 10)} />
          <WRow label="CURRENT DAY" value={day ? `DAY ${day}` : '—'} valueColor={C.sage} />
          <WRow label="PHASE"       value={phase ? phase.label : '—'} valueColor={phase ? phase.color : C.mut} />
          <WDivider />
          <WRow label="NEXT EXPECTED PERIOD" value={nextPeriod || 'calculating…'} valueColor={C.frame} />
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '14px 0' }}>
          <div style={{ fontSize: SIZE.xs, color: C.mut, lineHeight: 2.2 }}>NO ACTIVE CYCLE</div>
          <div style={{ fontSize: 7, color: C.mut, marginTop: 4 }}>open cycle tracker to start</div>
        </div>
      )}
    </WidgetCard>
  )
}

// ── Journal Widget ────────────────────────────────────────────────────────────
const WEATHER_ICONS = {
  sunny: '☀', cloudy: '☁', rainy: '🌧', stormy: '⛈',
  snowy: '❄', windy: '💨', foggy: '🌫', partly_cloudy: '⛅', clear: '✨',
}

function JournalWidget({ refreshKey }) {
  const [entry, setEntry] = useState(undefined)
  const [todos, setTodos] = useState([])

  useEffect(() => {
    setEntry(undefined)
    api.getJournalEntry(TODAY)
      .then(data => setEntry(data || null))
      .catch(() => setEntry(null))
    api.getHabits(TODAY)
      .then(data => setTodos(Array.isArray(data?.todos) ? data.todos : []))
      .catch(() => setTodos([]))
  }, [refreshKey])

  const firstLine = entry?.content
    ? (() => {
        const line = entry.content.replace(/\r\n|\r/g, '\n').split('\n').find(l => l.trim())
        return line ? (line.length > 70 ? line.slice(0, 70) + '…' : line) : null
      })()
    : null

  return (
    <WidgetCard title="JOURNAL" barColor="#A03A5A">
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: SIZE.xs, color: C.frame }}>{TODAY}</div>
        {entry?.weather && (
          <div style={{ fontSize: 9, marginTop: 3 }}>
            {WEATHER_ICONS[entry.weather] || ''}{' '}
            <span style={{ fontSize: 7, color: C.mut }}>{entry.weather.replace('_', ' ')}</span>
          </div>
        )}
      </div>
      <WDivider />
      <div style={{
        fontSize: 7,
        color: entry === undefined ? C.mut : firstLine ? C.txt : C.mut,
        lineHeight: 2.2,
        minHeight: 44,
      }}>
        {entry === undefined
          ? 'LOADING…'
          : firstLine
            ? `"${firstLine}"`
            : 'no entry today yet ♥'}
      </div>
      {entry?.last_saved && (
        <div style={{ fontSize: 6, color: C.mut, marginTop: 6, textAlign: 'right' }}>
          last saved {entry.last_saved}
        </div>
      )}
      {todos.length > 0 && (
        <>
          <WDivider />
          <div style={{ fontSize: 7, color: C.mut, marginBottom: 5 }}>TODAY'S TASKS</div>
          {todos.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <div style={{
                width: 9, height: 9, flexShrink: 0,
                border: `1px solid ${t.done ? C.ok : C.frame}`,
                background: t.done ? C.ok : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {t.done && <span style={{ color: '#fff', fontSize: 6, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{
                fontSize: 6, fontFamily: FONT, color: t.done ? C.mut : C.txt,
                textDecoration: t.done ? 'line-through' : 'none',
                opacity: t.done ? 0.5 : 1, lineHeight: 1.8,
              }}>
                {t.text}
              </span>
            </div>
          ))}
        </>
      )}
    </WidgetCard>
  )
}

// ── ETF Widget ────────────────────────────────────────────────────────────────
const ETF_LIST = [
  { symbol: 'ISWD.SW', label: 'MSCI WORLD ISLAMIC',   color: '#C4506A' },
  { symbol: 'IGDA.L',  label: 'ISLAMIC GLOBAL DEV.',   color: '#5A8E72' },
]

function ETFWidget({ refreshKey }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all(
      ETF_LIST.map(etf =>
        Promise.all([
          api.getETF(etf.symbol, '1wk'),
          api.getETFInvestments(etf.symbol),
        ]).then(([priceResp, investments]) => {
          const data       = priceResp?.data ?? []
          const latest     = data.length ? data[data.length - 1].close : null
          const currency   = priceResp?.currency ?? ''
          const totalUnits = investments.reduce((s, inv) => s + (inv.units || 0), 0)
          const portValue  = (latest != null && totalUnits > 0) ? totalUnits * latest : null
          return { ...etf, latest, currency, portValue }
        }).catch(() => ({ ...etf, latest: null, currency: '', portValue: null }))
      )
    ).then(results => { setRows(results); setLoading(false) })
  }, [refreshKey])

  return (
    <WidgetCard title="ETF TRACKER" barColor="#5A7A6A">
      {loading ? (
        <div style={{ textAlign: 'center', padding: '14px 0', fontSize: SIZE.xs, color: C.mut }}>
          LOADING…
        </div>
      ) : (
        rows.map((etf, i) => (
          <div key={etf.symbol}>
            {i > 0 && <WDivider />}
            <div style={{ fontSize: 7, color: etf.color, marginBottom: 5, letterSpacing: '.05em' }}>
              {etf.label}
            </div>
            <WRow
              label="CURRENT PRICE"
              value={etf.latest != null ? `${etf.currency} ${Number(etf.latest).toFixed(2)}` : '—'}
            />
            <WRow
              label="PORTFOLIO"
              value={etf.portValue != null ? `${etf.currency} ${Number(etf.portValue).toFixed(2)}` : '—'}
              valueColor={etf.portValue != null ? C.ok : C.mut}
            />
          </div>
        ))
      )}
    </WidgetCard>
  )
}

// ── Home Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen({ activeCycle, status, refreshKey }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20)
    return () => { clearTimeout(t); setVisible(false) }
  }, [])

  const h        = new Date().getHours()
  const greeting = h < 12 ? 'GOOD MORNING' : h < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      paddingLeft: 90,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 5,
      pointerEvents: 'none',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.45s ease',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 22, pointerEvents: 'none' }}>
        <div style={{ fontSize: SIZE.xs, color: C.frame, letterSpacing: '.14em', marginBottom: 4 }}>
          {greeting} ♥
        </div>
        <div style={{ fontSize: 7, color: C.mut, letterSpacing: '.08em' }}>{TODAY}</div>
      </div>

      <div style={{
        display: 'flex',
        gap: 18,
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-start',
        pointerEvents: 'auto',
      }}>
        <CycleWidget activeCycle={activeCycle} status={status} />
        <JournalWidget refreshKey={refreshKey} />
        <ETFWidget refreshKey={refreshKey} />
      </div>
    </div>
  )
}