// App.jsx — pixel desktop shell + state orchestration

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './api.js'
import { C, FONT, RAISED, SIZE } from './theme.js'
import { Notification } from './components/Shared.jsx'
import LogTab      from './components/LogTab.jsx'
import CyclesTab   from './components/CyclesTab.jsx'
import LogsTab     from './components/LogsTab.jsx'
import ResultsTab  from './components/ResultsTab.jsx'
import InsightsTab from './components/InsightsTab.jsx'

const TABS = [
  { id: 'log',      label: 'LOG TODAY'     },
  { id: 'cycles',   label: 'MY CYCLES'     },
  { id: 'logs',     label: 'DAILY LOGS'    },
  { id: 'results',  label: 'MODEL RESULTS' },
  { id: 'insights', label: 'INSIGHTS'      },
]

// ── Decoration data ───────────────────────────────────────────────────────────
// Stars and sparkles behind the window
const STARS_BACK = [
  { x: '7%',  y: '4%',  s: 26, o: 0.92 },
  { x: '48%', y: '1%',  s: 34, o: 1.00 },
  { x: '83%', y: '5%',  s: 22, o: 0.88 },
  { x: '93%', y: '26%', s: 24, o: 0.80 },
  { x: '3%',  y: '40%', s: 18, o: 0.75 },
  { x: '91%', y: '62%', s: 26, o: 0.85 },
  { x: '5%',  y: '68%', s: 20, o: 0.80 },
  { x: '76%', y: '13%', s: 16, o: 0.70 },
  { x: '25%', y: '7%',  s: 16, o: 0.68 },
  { x: '62%', y: '4%',  s: 20, o: 0.78 },
  { x: '55%', y: '94%', s: 22, o: 0.82 },
  { x: '18%', y: '90%', s: 18, o: 0.75 },
]

// Stars in front of the window — overlap effect
const STARS_FRONT = [
  { x: '1%',  y: '6%',  s: 30, o: 0.95 },
  { x: '95%', y: '8%',  s: 22, o: 0.90 },
  { x: '37%', y: '93%', s: 30, o: 0.92 },
  { x: '70%', y: '91%', s: 26, o: 0.88 },
  { x: '89%', y: '78%', s: 20, o: 0.82 },
  { x: '9%',  y: '80%', s: 24, o: 0.85 },
  { x: '50%', y: '95%', s: 18, o: 0.78 },
]

const SPARKLES_BACK = [
  { x: '20%', y: '15%' }, { x: '80%', y: '22%' },
  { x: '12%', y: '55%' }, { x: '90%', y: '45%' },
  { x: '65%', y: '8%'  }, { x: '97%', y: '35%' },
  { x: '1%',  y: '25%' }, { x: '42%', y: '3%'  },
]

const SPARKLES_FRONT = [
  { x: '55%', y: '91%' }, { x: '30%', y: '96%' },
  { x: '72%', y: '88%' }, { x: '5%',  y: '87%' },
]

// Clouds behind and in front
const CLOUDS_BACK = [
  { bottom: '-4%', left: '-2%',  w: 160, h: 78,  op: 0.88 },
  { bottom: '-6%', right: '-2%', w: 130, h: 65,  op: 0.82, flip: true },
  { bottom: '30%', left: '-4%',  w: 100, h: 50,  op: 0.50 },
]

const CLOUDS_FRONT = [
  { bottom: '1%',  left: '8%',   w: 120, h: 58,  op: 0.78 },
  { bottom: '-2%', right: '18%', w: 110, h: 55,  op: 0.72, flip: true },
  { bottom: '4%',  left: '38%',  w:  90, h: 45,  op: 0.65 },
  { bottom: '8%',  right: '5%',  w:  80, h: 40,  op: 0.60, flip: true },
]

// ── Decoration components ─────────────────────────────────────────────────────

function StarIcon({ size, opacity, x, y }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20"
      style={{ position: 'absolute', left: x, top: y, opacity, pointerEvents: 'none' }}>
      <polygon points="10,2 12,8 18,8 13,12 15,18 10,14 5,18 7,12 2,8 8,8"
        fill="#FFD700" stroke="#C8A000" strokeWidth="1" />
      <rect x="8" y="1" width="2" height="1" fill="rgba(255,255,255,0.7)" />
    </svg>
  )
}

function Cloud({ bottom, left, right, w = 150, h = 75, op = 0.88, flip }) {
  return (
    <svg width={w} height={h} viewBox="0 0 150 75"
      style={{
        position: 'absolute', bottom, left, right,
        opacity: op, pointerEvents: 'none',
        transform: flip ? 'scaleX(-1)' : undefined,
      }}>
      <ellipse cx="75"  cy="60" rx="68"  ry="18"  fill="#FFE0F0" />
      <ellipse cx="38"  cy="48" rx="32"  ry="28"  fill="#FFE0F0" />
      <ellipse cx="85"  cy="38" rx="42"  ry="34"  fill="#FFE0F0" />
      <ellipse cx="115" cy="50" rx="28"  ry="22"  fill="#FFE0F0" />
      <ellipse cx="55"  cy="42" rx="22"  ry="20"  fill="#FFF0F8" />
    </svg>
  )
}

function DecoLayer({ stars, sparkles, clouds, zIndex }) {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex, overflow: 'hidden' }}>
      {stars.map((s, i) => <StarIcon key={i} x={s.x} y={s.y} size={s.s} opacity={s.o} />)}
      {sparkles.map((s, i) => (
        <div key={i} style={{
          position: 'absolute', left: s.x, top: s.y,
          color: 'rgba(255,255,255,0.80)', fontSize: 16,
          lineHeight: 1, userSelect: 'none',
        }}>✦</div>
      ))}
      {clouds.map((cl, i) => <Cloud key={i} {...cl} />)}
    </div>
  )
}

// ── Window chrome ─────────────────────────────────────────────────────────────

function TitleBar({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        background: C.bar, padding: '3px 5px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        userSelect: 'none',
        cursor: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><path d='M10,17 C10,17 2,11.5 2,6.5 A4,4 0 0,1 10,5.5 A4,4 0 0,1 18,6.5 C18,11.5 10,17 10,17 Z' fill='%23FFB8C8' stroke='%237A1A38' stroke-width='2'/></svg>\") 10 17, grab",
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <i className="ti ti-moon" style={{ fontSize: 12, color: C.barT }} aria-hidden="true" />
        <span style={{ color: C.barT, fontSize: SIZE.md, letterSpacing: '.1em', fontFamily: FONT }}>
          Self Care Tracker
        </span>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {['_', '□', '✕'].map(b => (
          <button key={b} style={{
            fontFamily: FONT, fontSize: 10, color: C.txt,
            background: C.face, border: 'none',
            width: 18, height: 14,
            boxShadow: RAISED, textAlign: 'center',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: 2,
          }}>{b}</button>
        ))}
      </div>
    </div>
  )
}

function TabBar({ tab, setTab }) {
  return (
    <div style={{
      background: C.face, borderBottom: `2px solid ${C.frame}`,
      padding: '5px 6px 0', display: 'flex', gap: 2, alignItems: 'flex-end',
    }}>
      {TABS.map(t => {
        const active = tab === t.id
        return (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontFamily: FONT, fontSize: SIZE.sm, letterSpacing: '.06em',
            color: active ? C.txt : C.mut,
            background: active ? C.win : C.desk,
            border: `1px solid ${C.frame}`,
            borderBottom: active ? `2px solid ${C.win}` : `1px solid ${C.frame}`,
            padding: '4px 10px 5px',
            boxShadow: active ? `inset 1px 1px 0 ${C.hi}` : `inset -1px -1px 0 ${C.sh}66`,
            marginBottom: active ? -2 : 0,
            position: 'relative', zIndex: active ? 2 : 1,
          }}>{t.label}</button>
        )
      })}
    </div>
  )
}

function StatusBar({ status }) {
  const phase      = status?.model_phase || 'cold_start'
  const n          = status?.personal_cycles ?? 0
  const nextPeriod = status?.next_period_est || '—'
  const dbOk       = status !== null
  return (
    <div style={{
      background: C.face, borderTop: `1px solid ${C.grd}`,
      padding: '2px 8px', display: 'flex', gap: 16, alignItems: 'center',
    }}>
      <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>
        PHASE: {phase.toUpperCase()}
      </span>
      <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>
        CYCLES: {n} / 8
      </span>
      <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>
        NEXT: {nextPeriod}
      </span>
      <span style={{
        fontFamily: FONT, fontSize: SIZE.xs, marginLeft: 'auto',
        color: dbOk ? '#5A8E72' : '#7A1A38',
      }}>
        {dbOk ? '◉ DB: CONNECTED' : '○ DB: OFFLINE'}
      </span>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]                   = useState('log')
  const [notif, setNotif]               = useState(null)
  const [status, setStatus]             = useState(null)
  const [activeCycle, setActiveCycle]   = useState(undefined)
  const [refreshKey, setRefreshKey]     = useState(0)

  // ── Draggable window state ────────────────────────────────────────────────
  const [winPos, setWinPos]   = useState({ x: 10, y: 10 })
  const dragging              = useRef(false)
  const dragOffset            = useRef({ x: 0, y: 0 })
  const desktopRef            = useRef(null)

  const onTitleMouseDown = useCallback((e) => {
    dragging.current = true
    dragOffset.current = {
      x: e.clientX - winPos.x,
      y: e.clientY - winPos.y,
    }
    e.preventDefault()
  }, [winPos])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current || !desktopRef.current) return
      const desk = desktopRef.current.getBoundingClientRect()
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.current.x, desk.width  - 200))
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.current.y, desk.height - 100))
      setWinPos({ x: newX, y: newY })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  const notify = useCallback((type, msg) => {
    setNotif({ type, msg })
    const t = setTimeout(() => setNotif(null), 3500)
    return () => clearTimeout(t)
  }, [])

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    api.getStatus()
      .then(s => setStatus(s))
      .catch(() => setStatus(null))
    api.getActiveCycle()
      .then(c => setActiveCycle(c || null))
      .catch(() => setActiveCycle(null))
  }, [refreshKey])

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Background decoration layer (behind window) ────────────── */}
      <DecoLayer
        stars={STARS_BACK} sparkles={SPARKLES_BACK} clouds={CLOUDS_BACK}
        zIndex={0}
      />

      {/* ── Desktop surface ─────────────────────────────────────────── */}
      <div
        ref={desktopRef}
        style={{
          background: 'transparent',
          minHeight: '100vh',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* ── Draggable window ──────────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          left: winPos.x,
          top:  winPos.y,
          width: 'calc(100vw - 40px)',
          maxWidth: 780,
          border: `2px solid ${C.frame}`,
          boxShadow: `3px 3px 0 ${C.sh}, 0 12px 40px rgba(180,60,120,0.30)`,
          /* Frosted glass — blends window into background gradient */
          background: 'rgba(255, 240, 248, 0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          position: 'absolute',
          zIndex: 2,
        }}>
          <TitleBar onMouseDown={onTitleMouseDown} />
          <TabBar tab={tab} setTab={setTab} />

          {notif && <Notification type={notif.type} msg={notif.msg} />}

          <div style={{ display: tab === 'log'      ? '' : 'none' }}>
            <LogTab activeCycle={activeCycle} notify={notify} onSaved={refresh} />
          </div>
          <div style={{ display: tab === 'cycles'   ? '' : 'none' }}>
            <CyclesTab refreshKey={refreshKey} activeCycle={activeCycle}
              notify={notify} onCycleAction={refresh} />
          </div>
          <div style={{ display: tab === 'logs'     ? '' : 'none' }}>
            <LogsTab refreshKey={refreshKey} />
          </div>
          <div style={{ display: tab === 'results'  ? '' : 'none' }}>
            <ResultsTab refreshKey={refreshKey} notify={notify} />
          </div>
          <div style={{ display: tab === 'insights' ? '' : 'none' }}>
            <InsightsTab refreshKey={refreshKey} />
          </div>

          <StatusBar status={status} />
        </div>
      </div>

      {/* ── Foreground decoration layer (overlaps the window) ─────── */}
      <DecoLayer
        stars={STARS_FRONT} sparkles={SPARKLES_FRONT} clouds={CLOUDS_FRONT}
        zIndex={10}
      />

    </div>
  )
}