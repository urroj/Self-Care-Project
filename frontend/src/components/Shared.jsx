// components/Shared.jsx — reusable pixel-aesthetic UI primitives

import { useState } from 'react'
import { C, FONT, RAISED, SUNKEN, SIZE } from '../theme.js'

// ── Typography ────────────────────────────────────────────────────────────────

export function Label({ children, htmlFor, style }) {
  return (
    <label htmlFor={htmlFor} style={{ display: 'block',
      fontFamily: FONT, fontSize: SIZE.sm, color: C.mut,
      marginBottom: 2, letterSpacing: '.04em', ...style }}>
      {children}
    </label>
  )
}

export function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: FONT, fontSize: SIZE.sm, color: C.mut,
      marginBottom: 6, letterSpacing: '.04em' }}>
      {children}
    </div>
  )
}

// ── Inputs ────────────────────────────────────────────────────────────────────

export function Inp({ style, ...props }) {
  return (
    <input {...props} style={{
      fontFamily: FONT, fontSize: SIZE.md, color: C.txt,
      background: C.inp, border: `1px solid ${C.grd}`,
      boxShadow: SUNKEN, padding: '2px 5px',
      width: '100%', outline: 'none', ...style,
    }} />
  )
}

export function Sel({ children, style, ...props }) {
  return (
    <select {...props} style={{
      fontFamily: FONT, fontSize: SIZE.md, color: C.txt,
      background: C.inp, border: `1px solid ${C.grd}`,
      boxShadow: SUNKEN, padding: '2px 4px',
      width: '100%', outline: 'none', ...style,
    }}>
      {children}
    </select>
  )
}

// ── Form controls ─────────────────────────────────────────────────────────────

export function CheckRow({ label, checked, onChange, style }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 5,
      cursor: 'pointer', fontFamily: FONT, fontSize: SIZE.md,
      color: C.txt, marginBottom: 3, ...style,
    }}>
      <input type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ cursor: 'pointer', accentColor: C.accent }} />
      {label}
    </label>
  )
}

export function RadioRow({ name, value, current, onChange, label }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 4,
      cursor: 'pointer', fontFamily: FONT, fontSize: SIZE.md,
      color: C.txt, marginRight: 10,
    }}>
      <input type="radio" name={name} value={value}
        checked={current === value} onChange={() => onChange(value)}
        style={{ accentColor: C.accent }} />
      {label}
    </label>
  )
}

// ── Containers ────────────────────────────────────────────────────────────────

export function GroupBox({ title, children, cols, style }) {
  return (
    <fieldset style={{
      border: `1px solid ${C.grd}`, padding: '5px 8px',
      margin: '0 0 8px', background: C.win, ...style,
    }}>
      <legend style={{
        fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
        padding: '0 4px', letterSpacing: '.06em',
      }}>
        {title}
      </legend>
      {cols
        ? <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 8px' }}>{children}</div>
        : children
      }
    </fieldset>
  )
}

// ── Buttons ───────────────────────────────────────────────────────────────────

export function PixelBtn({ children, onClick, color, style, disabled, onMouseDown, title }) {
  const [hov, setHov] = useState(false)
  const [act, setAct] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseDown={e => { if (!disabled) { setAct(true); onMouseDown?.(e) } }}
      onMouseUp={() => setAct(false)}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => { setHov(false); setAct(false) }}
      disabled={disabled}
      title={title}
      style={{
        fontFamily: FONT, fontSize: SIZE.xs, letterSpacing: '.05em',
        color: disabled ? C.mut : (color || C.txt),
        background: C.face, border: 'none',
        boxShadow: disabled ? SUNKEN : act ? SUNKEN : RAISED,
        padding: '6px 14px', cursor: disabled ? 'default' : 'pointer',
        minHeight: 32,
        borderRadius: '6px',
        opacity: disabled ? 0.6 : 1,
        transform: !disabled && act ? 'scale(0.95) translateY(1px)' : !disabled && hov ? 'scale(1.04)' : 'scale(1)',
        filter: hov && !act && !disabled ? 'brightness(1.07)' : 'none',
        transition: 'transform 0.10s ease, filter 0.10s ease, box-shadow 0.10s ease',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

export function StatCard({ label, value, unit }) {
  return (
    <div style={{
      background: C.face, boxShadow: SUNKEN,
      padding: '5px 8px', textAlign: 'center',
      borderRadius: "5px"
    }}>
      <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut, letterSpacing: '.04em' }}>
        {label}
      </div>
      <div style={{ fontFamily: FONT, fontSize: SIZE.xl, color: C.txt, fontWeight: 'bold', marginTop: 1 }}>
        {value}
        {unit && <span style={{ fontSize: SIZE.xs, color: C.mut, marginLeft: 2 }}>{unit}</span>}
      </div>
    </div>
  )
}

// ── Phase tag ─────────────────────────────────────────────────────────────────

const PHASE_COLORS = {
  cold_start: ['#F090A8', '#3A0018'],
  bayesian:   ['#FFB8C8', '#3A0018'],
  lstm:       ['#C4E8D0', '#10562A'],
}

export function PhaseTag({ phase }) {
  const [bg, tx] = PHASE_COLORS[phase] || PHASE_COLORS.cold_start
  return (
    <span style={{
      fontFamily: FONT, fontSize: SIZE.xs, padding: '1px 5px',
      background: bg, color: tx,
      border: `1px solid ${tx}55`, letterSpacing: '.06em',
    }}>
      {phase?.replace(/_/g, ' ').toUpperCase()}
    </span>
  )
}

// ── Status / notification ─────────────────────────────────────────────────────

export function Notification({ type, msg }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute', top: 72, right: 12, zIndex: 200,
        background: type === 'ok' ? '#C8E8D4' : '#FFB8C8',
        border: `2px solid ${type === 'ok' ? C.ok : C.err}`,
        boxShadow: `2px 2px 0 ${C.sh}`,
        padding: '5px 14px',
        fontFamily: FONT, fontSize: SIZE.md, letterSpacing: '.05em',
        color: type === 'ok' ? '#1A4A30' : '#3A0018',
      }}>
      {type === 'ok' ? '✓ ' : '✗ '}{msg}
    </div>
  )
}

// ── Loading / empty states ────────────────────────────────────────────────────

export function LoadingRow({ cols = 5 }) {
  return (
    <tr>
      <td colSpan={cols} style={{
        fontFamily: FONT, fontSize: SIZE.md, color: C.mut,
        padding: '12px 8px', textAlign: 'center',
      }}>
        LOADING…
      </td>
    </tr>
  )
}

export function EmptyRow({ cols = 5, msg = 'NO DATA' }) {
  return (
    <tr>
      <td colSpan={cols} style={{
        fontFamily: FONT, fontSize: SIZE.md, color: C.mut,
        padding: '12px 8px', textAlign: 'center',
      }}>
        {msg}
      </td>
    </tr>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

export function PhaseProgress({ completed }) {
  let pct, label, ratio, color
  if (completed < 3) {
    pct   = Math.round(completed / 3 * 100)
    label = `${3 - completed} MORE CYCLE${3 - completed !== 1 ? 'S' : ''} TO BAYESIAN`
    ratio = `${completed} / 3`
    color = C.accent
  } else if (completed < 8) {
    pct   = Math.round(completed / 8 * 100)
    label = `${8 - completed} MORE CYCLE${8 - completed !== 1 ? 'S' : ''} TO LSTM`
    ratio = `${completed} / 8`
    color = '#E87090'
  } else {
    pct   = 100
    label = 'LSTM PHASE ACTIVE — MODEL FULLY PERSONALISED'
    ratio = `${completed} cycles`
    color = '#C4506A'
  }

  return (
    <div style={{ padding: '7px 10px', background: C.r1, border: `1px solid ${C.grd}`, marginBottom: 10 , borderRadius: "5px"}}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut, letterSpacing: '.04em' }}>
          {label}
        </span>
        <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: color }}>{ratio}</span>
      </div>
      <div style={{
        background: C.desk, height: 6, border: `1px solid ${C.sh}`,
        boxShadow: SUNKEN,
      }}>
        <div style={{ background: color, height: '100%', width: `${pct}%`, transition: 'width .4s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        {[['COLD_START', C.frame], ['BAYESIAN (3+)', C.mut], ['LSTM (8+)', C.mut]].map(([l, c]) => (
          <span key={l} style={{ fontFamily: FONT, fontSize: SIZE.xs, color: c }}>{l}</span>
        ))}
      </div>
    </div>
  )
}