import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api.js'
import { C, FONT, RAISED, SUNKEN, SIZE } from '../theme.js'

const TODAY = new Date().toISOString().slice(0, 10)

const WEATHER_OPTIONS = [
  { emoji: '☀️', label: 'sunny' },
  { emoji: '⛅', label: 'cloudy' },
  { emoji: '🌧️', label: 'rainy' },
  { emoji: '⛈️', label: 'stormy' },
  { emoji: '❄️', label: 'snowy' },
  { emoji: '🌫️', label: 'foggy' },
]

function formatDateDisplay(dateStr) {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return {
      dayName:  d.toLocaleDateString('en-US', { weekday: 'long' }),
      monthDay: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
      year:     d.getFullYear(),
    }
  } catch {
    return { dayName: '', monthDay: dateStr, year: '' }
  }
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function JournalWindow({ pos, zIndex, onFocus, onTitleDown, embedded = false }) {
  const [date, setDate]       = useState(TODAY)
  const [weather, setWeather] = useState('')
  const [content, setContent] = useState('')
  const [lastSaved, setLastSaved] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [notif, setNotif]     = useState(null)
  const notifTimer            = useRef(null)

  const notify = (type, msg) => {
    clearTimeout(notifTimer.current)
    setNotif({ type, msg })
    notifTimer.current = setTimeout(() => setNotif(null), 2500)
  }

  // Load entry when date changes
  useEffect(() => {
    setLoading(true)
    api.getJournalEntry(date)
      .then(data => {
        setContent(data?.content || '')
        setWeather(data?.weather || '')
        setLastSaved(data?.last_saved || null)
      })
      .catch(() => { setContent(''); setWeather(''); setLastSaved(null) })
      .finally(() => setLoading(false))
  }, [date])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.saveJournalEntry({ date, weather, content })
      const now = new Date()
      setLastSaved(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
      notify('ok', 'ENTRY SAVED')
    } catch (e) {
      notify('err', 'SAVE FAILED')
    } finally {
      setSaving(false)
    }
  }

  const goToPrev = () => setDate(d => offsetDate(d, -1))
  const goToNext = () => {
    const next = offsetDate(date, 1)
    if (next <= TODAY) setDate(next)
  }

  const { dayName, monthDay, year } = formatDateDisplay(date)
  const isToday = date === TODAY

  // Ruled paper line height — must match textarea line-height
  const LINE_H = 28

  return (
    <div
      style={embedded ? {} : {
        position: 'absolute',
        left: pos.x, top: pos.y,
        width: 420,
        zIndex,
        border: `2px solid ${C.frame}`,
        boxShadow: `3px 3px 0 ${C.sh}, 0 12px 40px rgba(180,60,120,0.30)`,
        background: 'rgba(255, 240, 248, 0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
      onMouseDown={embedded ? undefined : onFocus}
    >
      {/* Title bar */}
      <div
        onMouseDown={onTitleDown}
        style={{
          background: C.bar, padding: '3px 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          userSelect: 'none', cursor: 'grab',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-notebook" style={{ fontSize: 13, color: C.barT }} />
          <span style={{ fontFamily: FONT, fontSize: SIZE.sm, color: C.barT, letterSpacing: '.08em' }}>
            MY JOURNAL
          </span>
        </div>
      </div>

      {/* Notification */}
      {notif && (
        <div style={{
          position: 'absolute', top: 36, right: 10, zIndex: 50,
          background: notif.type === 'ok' ? '#C8E8D4' : '#FFB8C8',
          border: `2px solid ${notif.type === 'ok' ? C.ok : C.err}`,
          boxShadow: `2px 2px 0 ${C.sh}`,
          padding: '4px 12px',
          fontFamily: FONT, fontSize: SIZE.xs,
          color: notif.type === 'ok' ? C.ok : C.err,
        }}>
          {notif.type === 'ok' ? '✓ ' : '✗ '}{notif.msg}
        </div>
      )}

      {/* Page header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${C.grd}`,
        background: 'rgba(255,245,248,0.6)',
      }}>
        {/* Day navigation row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button onClick={goToPrev} style={{
            fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
            background: C.face, border: 'none',
            boxShadow: RAISED, padding: '4px 14px', cursor: 'pointer', fontSize: 14,
          }}>
            {'◄'}
          </button>

          {/* Date display */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: FONT, fontSize: SIZE.lg, color: C.frame,
              letterSpacing: '.06em', lineHeight: 1.3,
            }}>
              {dayName.toUpperCase()}
            </div>
            <div style={{
              fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
              marginTop: 2, letterSpacing: '.04em',
            }}>
              {monthDay}, {year}
              {isToday && (
                <span style={{
                  marginLeft: 6, background: C.bar, color: C.barT,
                  padding: '0 5px', fontSize: 7,
                }}>
                  TODAY
                </span>
              )}
            </div>
          </div>

          <button onClick={goToNext} disabled={isToday} style={{
            fontFamily: FONT, fontSize: SIZE.xs,
            color: isToday ? C.grd : C.mut,
            background: C.face, border: 'none',
            boxShadow: isToday ? SUNKEN : RAISED,
            padding: '3px 10px',
            cursor: isToday ? 'default' : 'pointer',
            opacity: isToday ? 0.5 : 1,
            fontSize: 14,
          }}>
            {'►'}
          </button>
        </div>

        {/* Date input (hidden, jump to date) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>JUMP TO:</span>
          <input
            type="date"
            value={date}
            max={TODAY}
            onChange={e => e.target.value && setDate(e.target.value)}
            style={{
              fontFamily: FONT, fontSize: SIZE.xs, color: C.txt,
              background: C.inp, border: `1px solid ${C.grd}`,
              boxShadow: SUNKEN, padding: '1px 4px', outline: 'none',
              flex: 1,
            }}
          />
        </div>

        {/* Weather selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>WEATHER:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {WEATHER_OPTIONS.map(w => (
              <button
                key={w.label}
                onClick={() => setWeather(weather === w.label ? '' : w.label)}
                title={w.label}
                style={{
                  fontSize: 18, padding: '2px 4px', border: 'none',
                  background: weather === w.label ? C.face : 'transparent',
                  boxShadow: weather === w.label ? SUNKEN : 'none',
                  cursor: 'pointer', borderRadius: 0,
                  outline: weather === w.label ? `2px solid ${C.frame}` : 'none',
                  lineHeight: 1,
                }}
              >
                {w.emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notebook writing area — ruled paper effect */}
      <div style={{
        position: 'relative',
        background: `repeating-linear-gradient(
          transparent,
          transparent ${LINE_H - 1}px,
          rgba(232, 160, 184, 0.35) ${LINE_H - 1}px,
          rgba(232, 160, 184, 0.35) ${LINE_H}px
        )`,
        backgroundColor: '#FFF8FB',
        paddingTop: 4,
      }}>
        {loading ? (
          <div style={{
            height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
          }}>
            LOADING…
          </div>
        ) : (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={`Write about your ${dayName.toLowerCase()}…`}
            style={{
              width: '100%', minHeight: 280, height: 280,
              resize: 'vertical',
              fontFamily: '"Press Start 2P", "Courier New", monospace',
              fontSize: 9,
              color: C.txt,
              lineHeight: `${LINE_H}px`,
              background: 'transparent',
              border: 'none', outline: 'none',
              padding: `4px 16px 0 40px`,
              boxSizing: 'border-box',
              letterSpacing: '.02em',
            }}
          />
        )}
        {/* Left margin red line */}
        <div style={{
          position: 'absolute', top: 0, left: 32, bottom: 0,
          width: 1, background: 'rgba(200, 80, 130, 0.3)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 12px',
        background: 'rgba(255,245,248,0.6)',
        borderTop: `1px solid ${C.grd}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: FONT, fontSize: 7, color: C.grd }}>
          {lastSaved ? `LAST SAVED ${lastSaved}` : 'NOT SAVED YET'}
        </span>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            fontFamily: FONT, fontSize: SIZE.xs,
            color: saving ? C.mut : C.ok,
            background: C.face, border: 'none',
            boxShadow: saving ? SUNKEN : RAISED,
            padding: '4px 18px', cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'SAVING…' : '► SAVE'}
        </button>
      </div>
    </div>
  )
}