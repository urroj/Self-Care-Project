// components/HomeWidgets.jsx — home screen widgets shown when all windows are closed

import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { C, FONT, SIZE, RAISED, SUNKEN } from '../theme.js'

const TODAY = new Date().toLocaleDateString('sv')

function dayOfCycle(startDate) {
  if (!startDate) return null
  return Math.max(1, Math.round((new Date(TODAY) - new Date(startDate)) / 86_400_000) + 1)
}

// ── Widget chrome ─────────────────────────────────────────────────────────────
function WidgetCard({ title, children, width = 310, barColor }) {
  return (
    <div style={{
      width,
      border: `2px solid ${C.frame}`,
      borderRadius: '14px',
      boxShadow: `0 8px 32px rgba(122,26,56,0.16), 0 2px 8px rgba(122,26,56,0.08)`,
      background: C.win,
      fontFamily: FONT,
    }}>
      <div style={{
        background: barColor || C.bar,
        borderTopLeftRadius: '12px',
        borderTopRightRadius: '12px',
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `2px solid ${C.frame}`,
        userSelect: 'none',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>♡ ♡</span>
        <span style={{ color: '#fff', fontSize: SIZE.xs, letterSpacing: '.1em' }}>{title}</span>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>♡ ♡</span>
      </div>
      <div style={{ padding: '14px 16px' }}>
        {children}
      </div>
    </div>
  )
}

function WRow({ label, value, valueColor }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginBottom: 8,
    }}>
      <span style={{ fontSize: SIZE.xs, color: C.mut }}>{label}</span>
      <span style={{ fontSize: SIZE.sm, color: valueColor || C.txt }}>{value ?? '—'}</span>
    </div>
  )
}

function WDivider() {
  return <div style={{ borderTop: `1px solid ${C.grd}`, margin: '10px 0' }} />
}

// ── Cycle Widget ──────────────────────────────────────────────────────────────
function getCyclePhase(periodDay, ovulday) {
  if (!periodDay) return null
  if (periodDay === null)  return { label: 'MENSTRUAL',  color: '#C4506A' }
  if (periodDay != null && ovulday == null)  return { label: 'FOLLICULAR', color: '#5A8E72' }
  if (periodDay != null && ovulday != null) return { label: 'OVULATORY',  color: '#9A4060' }
  return { label: 'LUTEAL', color: '#7A4A00' }
}

function CycleWidget({ activeCycle, status, animDelay = 0 }) {
  const [vis, setVis] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVis(true), animDelay); return () => clearTimeout(t) }, [animDelay])

  const isLoading  = activeCycle === undefined
  const nextPeriod = status?.next_period_est
  const periodDay  = activeCycle ? dayOfCycle(activeCycle.period_end) : null
  const ovulday    = activeCycle ? dayOfCycle(activeCycle.ovulation_date) : null
  const day        = activeCycle ? dayOfCycle(activeCycle.start_date) : null
  const phase      = getCyclePhase(periodDay, ovulday)

  return (
    <div style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(26px)',
      transition: 'opacity 0.44s ease, transform 0.44s cubic-bezier(0.34,1.4,0.64,1)',
    }}>
      <WidgetCard title="CYCLE TRACKER">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', fontSize: SIZE.xs, color: C.mut }}>
            LOADING…
          </div>
        ) : activeCycle ? (
          <>
            <div style={{ textAlign: 'center', paddingBottom: 10 }}>
              <div style={{ fontSize: SIZE.xs, color: C.mut, marginBottom: 5 }}>ACTIVE CYCLE</div>
              <div style={{ fontSize: SIZE.lg, color: C.frame }}>CYCLE #{activeCycle.cycle_number}</div>
            </div>
            <WDivider />
            <WRow label="STARTED"     value={String(activeCycle.start_date).slice(0, 10)} />
            <WRow label="CURRENT DAY" value={day ? `DAY ${day}` : '—'} valueColor={C.sage} />
            <WRow label="PHASE"       value={phase ? phase.label : '—'} valueColor={phase ? phase.color : C.mut} />
            <WDivider />
            <WRow label="NEXT PERIOD" value={nextPeriod || 'calculating…'} valueColor={C.frame} />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: SIZE.xs, color: C.mut, lineHeight: 2.4 }}>NO ACTIVE CYCLE</div>
            <div style={{ fontSize: SIZE.xs, color: C.mut, marginTop: 6 }}>open cycle tracker to start</div>
          </div>
        )}
      </WidgetCard>
    </div>
  )
}

// ── Journal Widget ────────────────────────────────────────────────────────────
const WEATHER_ICONS = {
  sunny: '☀', cloudy: '☁', rainy: '🌧', stormy: '⛈',
  snowy: '❄', windy: '💨', foggy: '🌫', partly_cloudy: '⛅', clear: '✨',
}

function JournalWidget({ refreshKey, animDelay = 0 }) {
  const [vis, setVis] = useState(false)
  const [entry, setEntry] = useState(undefined)
  const [todos, setTodos] = useState([])

  useEffect(() => { const t = setTimeout(() => setVis(true), animDelay); return () => clearTimeout(t) }, [animDelay])

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
        return line ? (line.length > 68 ? line.slice(0, 68) + '…' : line) : null
      })()
    : null

  return (
    <div style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(26px)',
      transition: 'opacity 0.44s ease, transform 0.44s cubic-bezier(0.34,1.4,0.64,1)',
    }}>
      <WidgetCard title="JOURNAL" barColor="#A03A5A">
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: SIZE.sm, color: C.frame }}>{TODAY}</div>
          {entry?.weather && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {WEATHER_ICONS[entry.weather] || ''}{' '}
              <span style={{ fontSize: SIZE.xs, color: C.mut }}>{entry.weather.replace('_', ' ')}</span>
            </div>
          )}
        </div>
        <WDivider />
        <div style={{
          fontSize: SIZE.xs,
          color: entry === undefined ? C.mut : firstLine ? C.txt : C.mut,
          lineHeight: 2.4,
          minHeight: 50,
        }}>
          {entry === undefined
            ? 'LOADING…'
            : firstLine
              ? `"${firstLine}"`
              : 'no entry today yet ♡'}
        </div>
        {entry?.last_saved && (
          <div style={{ fontSize: SIZE.xs, color: C.mut, marginTop: 6, textAlign: 'right' }}>
            last saved {entry.last_saved}
          </div>
        )}
        {todos.length > 0 && (
          <>
            <WDivider />
            <div style={{ fontSize: SIZE.xs, color: C.mut, marginBottom: 8 }}>TODAY'S TASKS</div>
            {todos.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <div style={{
                  width: 12, height: 12, flexShrink: 0,
                  border: `1px solid ${t.done ? C.ok : C.frame}`,
                  background: t.done ? C.ok : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {t.done && <span style={{ color: '#fff', fontSize: 7, lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{
                  fontSize: SIZE.xs, fontFamily: FONT, color: t.done ? C.mut : C.txt,
                  textDecoration: t.done ? 'line-through' : 'none',
                  opacity: t.done ? 0.5 : 1, lineHeight: 2,
                }}>
                  {t.text}
                </span>
              </div>
            ))}
          </>
        )}
      </WidgetCard>
    </div>
  )
}

// ── ETF Widget ────────────────────────────────────────────────────────────────
const ETF_LIST = [
  { symbol: 'ISWD.SW', label: 'MSCI WORLD ISLAMIC',  color: '#C4506A' },
  { symbol: 'IGDA.L',  label: 'ISLAMIC GLOBAL DEV.', color: '#5A8E72' },
]

function ETFWidget({ refreshKey, animDelay = 0 }) {
  const [vis, setVis] = useState(false)
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { const t = setTimeout(() => setVis(true), animDelay); return () => clearTimeout(t) }, [animDelay])

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
    <div style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(26px)',
      transition: 'opacity 0.44s ease, transform 0.44s cubic-bezier(0.34,1.4,0.64,1)',
    }}>
      <WidgetCard title="ETF TRACKER" barColor="#5A7A6A">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', fontSize: SIZE.xs, color: C.mut }}>
            LOADING…
          </div>
        ) : (
          rows.map((etf, i) => (
            <div key={etf.symbol}>
              {i > 0 && <WDivider />}
              <div style={{ fontSize: SIZE.xs, color: etf.color, marginBottom: 8, letterSpacing: '.05em' }}>
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
    </div>
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
      paddingLeft: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 5,
      pointerEvents: 'none',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.50s ease',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 28, pointerEvents: 'none' }}>
        <div style={{ fontSize: SIZE.lg, color: C.frame, letterSpacing: '.14em', marginBottom: 6 }}>
          {greeting} ♡
        </div>
        <div style={{ fontSize: SIZE.xs, color: C.mut, letterSpacing: '.08em' }}>{TODAY}</div>
      </div>

      <div style={{
        display: 'flex',
        gap: 22,
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-start',
        pointerEvents: 'auto',
      }}>
        <CycleWidget activeCycle={activeCycle} status={status} animDelay={60} />
        <JournalWidget refreshKey={refreshKey} animDelay={160} />
        <ETFWidget refreshKey={refreshKey} animDelay={260} />
      </div>
    </div>
  )
}
