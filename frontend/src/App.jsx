// App.jsx — multi-window pixel desktop with animated dock icons

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './api.js'
import { C, FONT, RAISED, SUNKEN, SIZE } from './theme.js'
import { Notification } from './components/Shared.jsx'
import LogTab        from './components/LogTab.jsx'
import CyclesTab     from './components/CyclesTab.jsx'
import LogsTab       from './components/LogsTab.jsx'
import ResultsTab    from './components/ResultsTab.jsx'
import InsightsTab   from './components/InsightsTab.jsx'
import JournalWindow from './components/JournalWindow.jsx'
import ETFWindow from './components/ETFWindow.jsx'
import HomeScreen from './components/HomeWidgets.jsx'


// ── Error boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 24, fontFamily: FONT, fontSize: 9,
        color: '#7A1A38', background: '#FFE8F2', border: '2px solid #7A1A38',
        margin: 20, lineHeight: 2 }}>
        <div style={{ marginBottom: 10 }}>✗ RENDER ERROR</div>
        <div style={{ fontSize: 7, color: '#9A4060' }}>{String(this.state.error)}</div>
        <div style={{ fontSize: 7, color: '#9A4060', marginTop: 8 }}>Open F12 console for stack trace</div>
      </div>
    )
    return this.props.children
  }
}

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'log',      label: 'LOG TODAY'     },
  { id: 'cycles',   label: 'MY CYCLES'     },
  { id: 'logs',     label: 'DAILY LOGS'    },
  { id: 'results',  label: 'MODEL RESULTS' },
  { id: 'insights', label: 'INSIGHTS'      },
]

// ── Decoration data ───────────────────────────────────────────────────────────
const STARS_BACK = [
  { x: '12%', y: '4%',  s: 26, o: 0.92 }, { x: '52%', y: '2%',  s: 34, o: 1.00 },
  { x: '85%', y: '5%',  s: 22, o: 0.88 }, { x: '94%', y: '28%', s: 24, o: 0.80 },
  { x: '88%', y: '62%', s: 26, o: 0.85 }, { x: '80%', y: '13%', s: 16, o: 0.70 },
  { x: '30%', y: '7%',  s: 16, o: 0.68 }, { x: '65%', y: '4%',  s: 20, o: 0.78 },
  { x: '58%', y: '94%', s: 22, o: 0.82 }, { x: '22%', y: '90%', s: 18, o: 0.75 },
  { x: '10%', y: '50%', s: 14, o: 0.55 }, { x: '92%', y: '75%', s: 18, o: 0.70 },
]
const STARS_FRONT = [
  { x: '8%',  y: '6%',  s: 30, o: 0.95 }, { x: '96%', y: '8%',  s: 22, o: 0.90 },
  { x: '40%', y: '93%', s: 30, o: 0.92 }, { x: '72%', y: '91%', s: 26, o: 0.88 },
  { x: '90%', y: '80%', s: 20, o: 0.82 }, { x: '12%', y: '82%', s: 24, o: 0.85 },
]
const SPARKLES_BACK = [
  { x: '25%', y: '15%' }, { x: '82%', y: '24%' }, { x: '15%', y: '58%' },
  { x: '91%', y: '47%' }, { x: '68%', y: '9%'  }, { x: '45%', y: '3%'  },
]
const SPARKLES_FRONT = [
  { x: '58%', y: '91%' }, { x: '33%', y: '96%' }, { x: '75%', y: '88%' },
]
const CLOUDS_BACK = [
  { bottom: '-4%', left: '-2%',  w: 160, h: 78, op: 0.88 },
  { bottom: '-6%', right: '-2%', w: 130, h: 65, op: 0.82, flip: true },
  { bottom: '32%', left: '-3%',  w:  90, h: 45, op: 0.45 },
]
const CLOUDS_FRONT = [
  { bottom: '1%',  left: '10%',  w: 120, h: 58, op: 0.78 },
  { bottom: '-2%', right: '20%', w: 110, h: 55, op: 0.72, flip: true },
  { bottom: '4%',  left: '40%',  w:  90, h: 45, op: 0.65 },
  { bottom: '8%',  right: '6%',  w:  80, h: 40, op: 0.60, flip: true },
]

// ── Witch sprite ──────────────────────────────────────────────────────────────
const WITCH_FRAMES = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east']

function WitchSprite() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % WITCH_FRAMES.length), 180)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{
      pointerEvents: 'none', zIndex: 1,
    }}>
      <img
        src={`/create_a_cute_witch_with/rotations/${WITCH_FRAMES[frame]}.png`}
        width={88} height={88}
        style={{ imageRendering: 'pixelated', display: 'block' }}
        alt=""
      />
    </div>
  )
}

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
    <svg width={w} height={h} viewBox="0 0 150 75" style={{
      position: 'absolute', bottom, left, right, opacity: op,
      pointerEvents: 'none', transform: flip ? 'scaleX(-1)' : undefined,
    }}>
      <ellipse cx="75"  cy="60" rx="68" ry="18" fill="#FFE0F0" />
      <ellipse cx="38"  cy="48" rx="32" ry="28" fill="#FFE0F0" />
      <ellipse cx="85"  cy="38" rx="42" ry="34" fill="#FFE0F0" />
      <ellipse cx="115" cy="50" rx="28" ry="22" fill="#FFE0F0" />
      <ellipse cx="55"  cy="42" rx="22" ry="20" fill="#FFF0F8" />
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

// ── Pixel SVG dock icons ──────────────────────────────────────────────────────

// Home icon — pixel house
function PixelHomeIcon({ size = 36, color = '#7A1A38' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
      {/* roof */}
      <rect x="7" y="1" width="2" height="2" fill={color}/>
      <rect x="5" y="3" width="6" height="2" fill={color}/>
      <rect x="3" y="5" width="10" height="2" fill={color}/>
      {/* walls */}
      <rect x="3" y="7" width="10" height="7" fill={color}/>
      {/* door */}
      <rect x="6" y="10" width="4" height="4" fill="rgba(255,240,248,0.9)"/>
      {/* windows */}
      <rect x="4" y="8" width="2" height="2" fill="rgba(255,240,248,0.9)"/>
      <rect x="10" y="8" width="2" height="2" fill="rgba(255,240,248,0.9)"/>
      {/* chimney */}
      <rect x="10" y="0" width="2" height="3" fill={color}/>
    </svg>
  )
}

// Tracker icon — pixel moon + stars
function PixelTrackerIcon({ size = 36, color = '#7A1A38' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
      {/* crescent moon body */}
      <rect x="4" y="2" width="4" height="2" fill={color}/>
      <rect x="3" y="4" width="3" height="2" fill={color}/>
      <rect x="2" y="6" width="3" height="2" fill={color}/>
      <rect x="2" y="8" width="3" height="2" fill={color}/>
      <rect x="3" y="10" width="3" height="2" fill={color}/>
      <rect x="4" y="12" width="4" height="2" fill={color}/>
      {/* inner cutout — crescent shape */}
      <rect x="7" y="4"  width="4" height="2" fill="transparent" opacity="0"/>
      <rect x="8" y="4"  width="3" height="8" fill="rgba(255,240,248,0)" />
      {/* stars next to moon */}
      <rect x="13" y="2"  width="2" height="2" fill={color} opacity="0.7"/>
      <rect x="13" y="6"  width="1" height="1" fill={color}/>
      <rect x="14" y="10" width="1" height="1" fill={color} opacity="0.8"/>
      <rect x="1"  y="10" width="1" height="1" fill={color} opacity="0.6"/>
    </svg>
  )
}

// Journal icon — pixel notebook (matches the attached image aesthetic)
function PixelJournalIcon({ size = 36, color = '#7A1A38', accent = '#F090A8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
      {/* back page shadow */}
      <rect x="5" y="2" width="9" height="11" fill={accent} opacity="0.5"/>
      {/* main book cover */}
      <rect x="3" y="1" width="9" height="12" fill={color}/>
      {/* book pages (white fill) */}
      <rect x="4" y="2" width="7" height="10" fill="rgba(255,245,250,0.95)"/>
      {/* spine lines */}
      <rect x="3" y="1" width="1" height="12" fill={color}/>
      {/* ruled lines */}
      <rect x="5" y="5"  width="5" height="1" fill={accent}/>
      <rect x="5" y="7"  width="5" height="1" fill={accent}/>
      <rect x="5" y="9"  width="3" height="1" fill={accent}/>
      {/* binding dots */}
      <rect x="3" y="3"  width="1" height="1" fill="rgba(255,245,250,0.8)"/>
      <rect x="3" y="6"  width="1" height="1" fill="rgba(255,245,250,0.8)"/>
      <rect x="3" y="9"  width="1" height="1" fill="rgba(255,245,250,0.8)"/>
      {/* bottom page stack */}
      <rect x="4" y="13" width="8" height="1" fill={color} opacity="0.6"/>
      <rect x="5" y="14" width="7" height="1" fill={color} opacity="0.4"/>
    </svg>
  )
}
// Pixel bar chart / ETF icon
function PixelETFIcon({ size = 36, color = '#7A1A38' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
      {/* bars */}
      <rect x="1"  y="10" width="3" height="5" fill={color}/>
      <rect x="5"  y="6"  width="3" height="9" fill={color}/>
      <rect x="9"  y="8"  width="3" height="7" fill={color}/>
      <rect x="13" y="3"  width="2" height="12" fill={color}/>
      {/* trend line */}
      <rect x="1"  y="9"  width="2" height="1" fill="rgba(255,245,250,0.7)"/>
      <rect x="3"  y="7"  width="3" height="1" fill="rgba(255,245,250,0.7)"/>
      <rect x="6"  y="5"  width="3" height="1" fill="rgba(255,245,250,0.7)"/>
      <rect x="9"  y="7"  width="3" height="1" fill="rgba(255,245,250,0.7)"/>
      <rect x="12" y="4"  width="3" height="1" fill="rgba(255,245,250,0.7)"/>
      {/* currency symbol */}
      <rect x="6"  y="0"  width="1" height="4" fill={color} opacity="0.6"/>
      <rect x="5"  y="1"  width="3" height="1" fill={color} opacity="0.6"/>
      <rect x="5"  y="2"  width="3" height="1" fill={color} opacity="0.6"/>
    </svg>
  )
}

// ── Dock ──────────────────────────────────────────────────────────────────────
// dockRefs: { cycle: ref to cycle dock button, journal: ref to journal dock button }
function DockBtn({ children, label, active, onClick, btnRef }) {
  const [hov, setHov] = useState(false)
  const [act, setAct] = useState(false)
  return (
    <button
      ref={btnRef}
      onClick={onClick}
      title={label}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setAct(false) }}
      onMouseDown={() => setAct(true)}
      onMouseUp={() => setAct(false)}
      style={{
        width: 64, height: 64,
        background: active
          ? 'rgba(255, 240, 248, 0.88)'
          : hov ? 'rgba(255, 240, 248, 0.55)' : 'rgba(255, 240, 248, 0.28)',
        border: `2px solid ${active ? C.frame : hov ? 'rgba(122,26,56,0.50)' : 'rgba(122,26,56,0.22)'}`,
        borderRadius: '12px',
        boxShadow: active
          ? `0 4px 22px rgba(122,26,56,0.32), 0 2px 8px rgba(122,26,56,0.18)`
          : hov
            ? `0 4px 16px rgba(122,26,56,0.18), 0 1px 4px rgba(122,26,56,0.10)`
            : `0 2px 8px rgba(122,26,56,0.08)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        transition: 'background 0.14s, border-color 0.14s, transform 0.12s, box-shadow 0.14s',
        transform: act ? 'scale(0.90)' : active ? 'scale(1.08)' : hov ? 'scale(1.12)' : 'scale(1)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function Dock({ cycleOpen, journalOpen, etfOpen, onHome, onCycle, onJournal, onETF, cycleRef, journalRef, etfRef }) {
  return (
    <div style={{
      position: 'fixed', left: 14, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: 12,
      zIndex: 2000,
    }}>
      <DockBtn label="HOME" active={!((journalOpen || etfOpen || cycleOpen) === false)} onClick={onHome}>
        <PixelHomeIcon size={34} color={C.frame} />
      </DockBtn>
      <DockBtn label="CYCLE TRACKER" active={cycleOpen} onClick={onCycle} btnRef={cycleRef}>
        <PixelTrackerIcon size={34} color={cycleOpen ? C.frame : '#B05070'} />
      </DockBtn>
      <DockBtn label="JOURNAL" active={journalOpen} onClick={onJournal} btnRef={journalRef}>
        <PixelJournalIcon size={34} color={journalOpen ? C.frame : '#B05070'} accent="#F090A8" />
      </DockBtn>
      <DockBtn label="ETF TRACKER" active={etfOpen} onClick={onETF} btnRef={etfRef}>
        <PixelETFIcon size={34} color={etfOpen ? C.frame : '#B05070'} />
      </DockBtn>
    </div>
  )
}

// ── Animated window wrapper — collapses toward its dock icon ──────────────────
// phase: 'entering' | 'open' | 'closing' | 'closed'
// transformOrigin is set to the dock icon's screen position
function AnimatedWindow({ open, dockRef, children, style, onMouseDown }) {
  const [phase, setPhase] = useState(open ? 'open' : 'closed')
  const [origin, setOrigin] = useState('left center')
  const prevOpen = useRef(open)

  useEffect(() => {
    if (dockRef?.current) {
      const r = dockRef.current.getBoundingClientRect()
      setOrigin(`${r.left + r.width / 2}px ${r.top + r.height / 2}px`)
    }
    if (open && !prevOpen.current) {
      setPhase('entering')
      const t = setTimeout(() => setPhase('open'), 16)
      prevOpen.current = true
      return () => clearTimeout(t)
    }
    if (!open && prevOpen.current) {
      setPhase('closing')
      const t = setTimeout(() => setPhase('closed'), 300)
      prevOpen.current = false
      return () => clearTimeout(t)
    }
  }, [open, dockRef])

  if (phase === 'closed') return null

  const isSmall = phase === 'entering' || phase === 'closing'
  const transition =
    phase === 'entering' ? 'none' :
    phase === 'open'     ? 'transform 0.44s cubic-bezier(0.34,1.56,0.64,1), opacity 0.34s ease' :
    phase === 'closing'  ? 'transform 0.26s cubic-bezier(0.4,0,1,1), opacity 0.20s ease' : 'none'

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        ...style,
        transformOrigin: origin,
        borderRadius: '14px',
        transform: isSmall ? 'scale(0.06) translateX(-60px)' : 'scale(1) translateX(0)',
        opacity:   isSmall ? 0 : 1,
        transition,
        pointerEvents: isSmall ? 'none' : 'auto',
      }}
    >
      {children}
    </div>
  )
}

// ── Window chrome ─────────────────────────────────────────────────────────────
function TitleBar({ title, icon, onMouseDown }) {
  return (
    <div onMouseDown={onMouseDown} style={{
      background: C.bar, padding: '6px 12px',
      display: 'flex', alignItems: 'center',
      userSelect: 'none', cursor: 'grab',
      borderTopLeftRadius: '10px',
      borderTopRightRadius: '10px',
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 12, color: C.barT, marginRight: 7 }} />
      <span style={{ color: C.barT, fontSize: SIZE.md, letterSpacing: '.08em', fontFamily: FONT }}>
        {title}
      </span>
    </div>
  )
}

function TabBtn({ label, active, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => !active && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: FONT, fontSize: SIZE.sm, letterSpacing: '.06em',
        color: active ? C.txt : hov ? C.txt : C.mut,
        background: active ? C.win : hov ? `${C.desk}dd` : C.desk,
        border: `1px solid ${C.frame}`,
        borderTopLeftRadius: '5px', borderTopRightRadius: '5px',
        borderBottom: active ? `2px solid ${C.win}` : `1px solid ${C.frame}`,
        padding: '5px 12px 6px',
        boxShadow: active ? `inset 1px 1px 0 ${C.hi}` : `inset -1px -1px 0 rgba(90,0,32,0.22)`,
        marginBottom: active ? -2 : 0,
        position: 'relative', zIndex: active ? 2 : 1,
        transition: 'color 0.12s, background 0.12s',
        cursor: 'pointer',
      }}
    >{label}</button>
  )
}

function TabBar({ tab, setTab }) {
  return (
    <div style={{
      background: C.face, borderBottom: `2px solid ${C.frame}`,
      padding: '5px 8px 0', display: 'flex', gap: 3, alignItems: 'flex-end',
    }}>
      {TABS.map(t => (
        <TabBtn key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
      ))}
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
      borderBottomLeftRadius: "10px", borderBottomRightRadius: "10px",
    }}>
      <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>PHASE: {phase.toUpperCase()}</span>
      <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>CYCLES: {n} / 8</span>
      <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>NEXT: {nextPeriod}</span>
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
  const [tab, setTab]                 = useState('log')
  const [notif, setNotif]             = useState(null)
  const [status, setStatus]           = useState(null)
  const [activeCycle, setActiveCycle] = useState(undefined)
  const [refreshKey, setRefreshKey]   = useState(0)
  const [cycleOpen,   setCycleOpen]   = useState(false)
  const [journalOpen, setJournalOpen] = useState(false)
  const [cyclePos,    setCyclePos]    = useState({ x: 96, y: 20 })
  const [journalPos,  setJournalPos]  = useState({ x: 148, y: 70 })
  const [etfOpen,  setEtfOpen]  = useState(false)
  const [etfPos,   setEtfPos]   = useState({ x: 200, y: 40 })
 
  // Z-index management
  const zRef     = useRef(10)
  const [cycleZ,   setCycleZ]   = useState(10)
  const [journalZ, setJournalZ] = useState(9)
  const [etfZ,     setEtfZ]     = useState(11)
  

  // Refs for dock buttons (used as animation origin)
  const cycleDockRef   = useRef(null)
  const journalDockRef = useRef(null)
  const etfDockRef     = useRef(null)

  const focusCycle = useCallback(() => {
    zRef.current += 1; setCycleZ(zRef.current)
  }, [])
  const focusJournal = useCallback(() => {
    zRef.current += 1; setJournalZ(zRef.current)
  }, [])
  const focusETF = useCallback(() => {
    zRef.current += 1; setEtfZ(zRef.current)
  }, [])

  // Shared drag handler
  const activeDrag = useRef(null)
  const startDrag = useCallback((e, pos, setPos) => {
    activeDrag.current = {
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
      setPos,
    }
    e.preventDefault()
    e.stopPropagation()
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!activeDrag.current) return
      const { offsetX, offsetY, setPos } = activeDrag.current
      setPos({
        x: Math.max(96, e.clientX - offsetX),
        y: Math.max(0,  e.clientY - offsetY),
      })
    }
    const onUp = () => { activeDrag.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  // Dock actions
  const closeAll = useCallback(() => {
    setCycleOpen(false); setJournalOpen(false); setEtfOpen(false)
  }, [])

  const toggleCycle = useCallback(() => {
    setCycleOpen(o => {
      if (!o) { zRef.current += 1; setCycleZ(zRef.current) }
      return !o
    })
  }, [])
  const toggleJournal = useCallback(() => {
    setJournalOpen(o => {
      if (!o) { zRef.current += 1; setJournalZ(zRef.current) }
      return !o
    })
  }, [])

  const toggleETF = useCallback(() => {
    setEtfOpen(o => {
      if (!o) { zRef.current += 1; setEtfZ(zRef.current) }
      return !o
    })
  }, [])

  const notify  = useCallback((type, msg) => {
    setNotif({ type, msg })
    const t = setTimeout(() => setNotif(null), 3500)
    return () => clearTimeout(t)
  }, [])
  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    api.getStatus().then(setStatus).catch(() => setStatus(null))
    api.getActiveCycle().then(c => setActiveCycle(c || null)).catch(() => setActiveCycle(null))
  }, [refreshKey])

  // Window styles (shared base)
  const winBase = {
    border: `2px solid ${C.frame}`,
    boxShadow: `0 8px 40px rgba(122,26,56,0.16), 0 2px 10px rgba(122,26,56,0.09)`,
    background: 'rgba(255, 240, 248, 0.93)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
  }
  return (
    <ErrorBoundary>
      <div style={{ fontFamily: FONT }}>
        <DecoLayer stars={STARS_BACK} sparkles={SPARKLES_BACK} clouds={CLOUDS_BACK} zIndex={0} />
        <div style={{ position: 'fixed', left: '32%', top: '37%'}}><WitchSprite /></div>
        <div style={{ background: 'transparent', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
          <Dock
            cycleOpen={cycleOpen} journalOpen={journalOpen} etfOpen={etfOpen}
            onHome={closeAll} onCycle={toggleCycle} onJournal={toggleJournal} onETF={toggleETF}
            cycleRef={cycleDockRef} journalRef={journalDockRef} etfRef={etfDockRef}
          />

          {/* ── CYCLE TRACKER WINDOW ──────────────────────────────── */}
          <AnimatedWindow
            open={cycleOpen}
            dockRef={cycleDockRef}
            onMouseDown={focusCycle}
            style={{
              ...winBase,
              position: 'absolute',
              left: cyclePos.x, top: cyclePos.y,
              width: 'calc(100vw - 108px)', maxWidth: 940,
              zIndex: cycleZ
            }}
          >
            <TitleBar
              title="CYCLE TRACKER"
              icon="ti-moon-stars"
              onMouseDown={(e) => { startDrag(e, cyclePos, setCyclePos); focusCycle() }}
            />
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
          </AnimatedWindow>

          {/* ── JOURNAL WINDOW ────────────────────────────────────── */}
          <AnimatedWindow
            open={journalOpen}
            dockRef={journalDockRef}
            onMouseDown={focusJournal}
            style={{
              ...winBase,
              position: 'absolute',
              left: journalPos.x, top: journalPos.y,
              width: 520,
              zIndex: journalZ,
            }}
          >
            <JournalWindow
              pos={{ x: 0, y: 0 }}
              zIndex={0}
              onFocus={() => {}}
              onTitleDown={(e) => { startDrag(e, journalPos, setJournalPos); focusJournal() }}
              embedded
            />
          </AnimatedWindow>

          {/* ── ETF TRACKER WINDOW ──────────────────────────────── */}
          <AnimatedWindow
            open={etfOpen}
            dockRef={etfDockRef}
            onMouseDown={focusETF}
            style={{
              ...winBase,
              position: 'absolute',
              left: etfPos.x, top: etfPos.y,
              width: 580,
              zIndex: etfZ,
            }}
          >
            <ETFWindow
              onFocus={focusETF}
              onTitleDown={(e) => { startDrag(e, etfPos, setEtfPos); focusETF() }}
              embedded
            />
          </AnimatedWindow>

          {!cycleOpen && !journalOpen && !etfOpen && (
            <HomeScreen
              activeCycle={activeCycle}
              status={status}
              refreshKey={refreshKey}
            />
          )}
          
        </div>

        <DecoLayer stars={STARS_FRONT} sparkles={SPARKLES_FRONT} clouds={CLOUDS_FRONT} zIndex={999} />
      </div>
    </ErrorBoundary>
  )
}