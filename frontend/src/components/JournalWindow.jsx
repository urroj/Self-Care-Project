import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import { C, FONT, RAISED, SUNKEN, SIZE } from '../theme.js'

const TODAY = new Date().toISOString().slice(0, 10)

function Btn({ children, onClick, disabled, style, title }) {
  const [hov, setHov] = useState(false)
  const [act, setAct] = useState(false)
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => { setHov(false); setAct(false) }}
      onMouseDown={() => !disabled && setAct(true)}
      onMouseUp={() => setAct(false)}
      style={{
        ...style,
        transform: !disabled && act ? 'scale(0.95) translateY(1px)' : !disabled && hov ? 'scale(1.05)' : 'scale(1)',
        filter: hov && !act && !disabled ? 'brightness(1.08)' : 'none',
        transition: 'transform 0.10s ease, filter 0.10s ease, box-shadow 0.10s ease',
      }}
    >{children}</button>
  )
}

function JTabBtn({ label, active, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => !active && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: FONT, fontSize: SIZE.sm, letterSpacing: '.06em',
        color:      active ? C.txt : hov ? C.txt : C.mut,
        background: active ? C.win : hov ? `${C.desk}dd` : C.desk,
        border: `1px solid ${C.frame}`,
        borderTopLeftRadius: '5px', borderTopRightRadius: '5px',
        borderBottom: active ? `2px solid ${C.win}` : `1px solid ${C.frame}`,
        padding: '12px 14px',
        minHeight: 44, minWidth: 44,
        boxShadow: active ? `inset 1px 1px 0 ${C.hi}` : `inset -1px -1px 0 rgba(90,0,32,0.22)`,
        marginBottom: active ? -2 : 0,
        position: 'relative', zIndex: active ? 2 : 1,
        transition: 'color 0.12s, background 0.12s',
        cursor: 'pointer',
      }}
    >{label}</button>
  )
}

const WEATHER_OPTIONS = [
  { emoji: '☀️', label: 'sunny'  },
  { emoji: '⛅',  label: 'cloudy' },
  { emoji: '🌧️', label: 'rainy'  },
  { emoji: '⛈️', label: 'stormy' },
  { emoji: '❄️',  label: 'snowy'  },
  { emoji: '🌫️', label: 'foggy'  },
]

const PRAYERS = [
  { key: 'prayer_fajr',    label: 'FAJR'    },
  { key: 'prayer_zuhr',    label: 'ZUHR'    },
  { key: 'prayer_asr',     label: 'ASR'     },
  { key: 'prayer_maghrib', label: 'MAGHRIB' },
  { key: 'prayer_isha',    label: 'ISHA'    },
]

const INIT_HABITS = {
  water_glasses:  0,
  prayer_fajr:    false,
  prayer_zuhr:    false,
  prayer_asr:     false,
  prayer_maghrib: false,
  prayer_isha:    false,
  quran_recited:  false,
  todos:          [],
  project_ideas:  [],
}

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

// ── Shared habit sub-components ───────────────────────────────────────────────
function HGroup({ title, children }) {
  return (
    <div style={{ border: `1px solid ${C.grd}`, marginBottom: 8, borderRadius: "5px"}}>
      <div style={{
        background: C.bar, padding: '4px 8px',
        fontFamily: FONT, fontSize: 7, color: C.barT, letterSpacing: '.08em',
        borderTopLeftRadius: "5px", borderTopRightRadius: "5px",
      }}>
        {title}
      </div>
      <div style={{ padding: '8px 10px', background: C.win ,borderBottomLeftRadius: "5px", borderBottomRightRadius: "5px"}}>
        {children}
      </div>
    </div>
  )
}

function PixelCheck({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, cursor: 'pointer' }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 14, height: 14, flexShrink: 0,
        border: `2px solid ${C.frame}`,
        background: checked ? C.frame : C.inp,
        boxShadow: checked ? SUNKEN : RAISED,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.14s, box-shadow 0.12s',
      }}>
        {checked && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: checked ? C.frame : C.mut, transition: 'color 0.14s' }}>
        {label}
      </span>
    </label>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JournalWindow({ pos, zIndex, onFocus, onTitleDown, embedded = false }) {

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('journal')

  // ── Journal state ─────────────────────────────────────────────────────────
  const [date, setDate]             = useState(TODAY)
  const [weather, setWeather]       = useState('')
  const [content, setContent]       = useState('')
  const [savedEntry, setSavedEntry] = useState(null)
  const [lastSaved, setLastSaved]   = useState(null)
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  // ── Habits state ──────────────────────────────────────────────────────────
  const [habits,         setHabits]         = useState(INIT_HABITS)
  const [savedHabits,    setSavedHabits]    = useState(null)
  const [habitLastSaved, setHabitLastSaved] = useState(null)
  const [savingHabits,   setSavingHabits]   = useState(false)
  const [todoInput,      setTodoInput]      = useState('')
  const [ideaInput,      setIdeaInput]      = useState('')

  const [notif, setNotif] = useState(null)
  const notifTimer = useRef(null)

  const notify = (type, msg) => {
    clearTimeout(notifTimer.current)
    setNotif({ type, msg })
    notifTimer.current = setTimeout(() => setNotif(null), type === 'err' ? 8000 : 2500)
  }

  const hf = (k, v) => setHabits(p => ({ ...p, [k]: v }))

  // ── Load journal + habits when date changes ───────────────────────────────
  useEffect(() => {
    // Journal
    setLoading(true)
    setConfirmOverwrite(false)
    api.getJournalEntry(date)
      .then(data => {
        const hasEntry = data && data.last_saved !== null
        if (hasEntry) {
          setContent(data.content || '')
          setWeather(data.weather || '')
          setLastSaved(data.last_saved)
          setSavedEntry({ content: data.content || '', weather: data.weather || '' })
        } else {
          setContent(''); setWeather(''); setLastSaved(null); setSavedEntry(null)
        }
      })
      .catch(e => {
        setContent(''); setWeather(''); setLastSaved(null); setSavedEntry(null)
        notify('err', e.message || 'LOAD FAILED')
      })
      .finally(() => setLoading(false))

    // Habits
    api.getHabits(date)
      .then(data => {
        if (data && data.last_saved !== null) {
          setHabits({
            water_glasses:  data.water_glasses  ?? 0,
            prayer_fajr:    !!data.prayer_fajr,
            prayer_zuhr:    !!data.prayer_zuhr,
            prayer_asr:     !!data.prayer_asr,
            prayer_maghrib: !!data.prayer_maghrib,
            prayer_isha:    !!data.prayer_isha,
            quran_recited:  !!data.quran_recited,
            todos:          Array.isArray(data.todos)         ? data.todos         : [],
            project_ideas:  Array.isArray(data.project_ideas) ? data.project_ideas : [],
          })
          setSavedHabits(data)
          setHabitLastSaved(data.last_saved)
        } else {
          setHabits(INIT_HABITS); setSavedHabits(null); setHabitLastSaved(null)
        }
        setTodoInput(''); setIdeaInput('')
      })
      .catch(() => { setHabits(INIT_HABITS); setSavedHabits(null); setHabitLastSaved(null) })
  }, [date])

  // ── Journal save ──────────────────────────────────────────────────────────
  const isDirty = savedEntry !== null
    ? (content !== savedEntry.content || weather !== savedEntry.weather)
    : (content.trim() !== '' || weather !== '')

  const handleSaveClick = () => {
    if (!content.trim() && !weather) { notify('err', 'NOTHING TO SAVE — WRITE SOMETHING FIRST'); return }
    if (savedEntry !== null && isDirty) { setConfirmOverwrite(true); return }
    doSave()
  }

  const doSave = async () => {
    setConfirmOverwrite(false); setSaving(true)
    try {
      await api.saveJournalEntry({ date, weather, content })
      const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      setLastSaved(t); setSavedEntry({ content, weather })
      notify('ok', savedEntry !== null ? 'ENTRY UPDATED' : 'ENTRY SAVED')
    } catch (e) { notify('err', e.message || 'SAVE FAILED') }
    finally { setSaving(false) }
  }

  // ── Habits save ───────────────────────────────────────────────────────────
  const doSaveHabits = async () => {
    setSavingHabits(true)
    try {
      await api.saveHabits({ date, ...habits })
      const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      setHabitLastSaved(t); setSavedHabits({ ...habits })
      notify('ok', savedHabits !== null ? 'HABITS UPDATED' : 'HABITS SAVED')
    } catch (e) { notify('err', e.message || 'SAVE FAILED') }
    finally { setSavingHabits(false) }
  }

  // ── Todo / idea helpers ───────────────────────────────────────────────────
  const addTodo    = () => { if (!todoInput.trim()) return; hf('todos', [...habits.todos, { text: todoInput.trim(), done: false }]); setTodoInput('') }
  const toggleTodo = i  => hf('todos', habits.todos.map((t, j) => j === i ? { ...t, done: !t.done } : t))
  const removeTodo = i  => hf('todos', habits.todos.filter((_, j) => j !== i))
  const addIdea    = () => { if (!ideaInput.trim()) return; hf('project_ideas', [...habits.project_ideas, ideaInput.trim()]); setIdeaInput('') }
  const removeIdea = i  => hf('project_ideas', habits.project_ideas.filter((_, j) => j !== i))

  // ── Navigation ────────────────────────────────────────────────────────────
  const goToPrev = () => setDate(d => offsetDate(d, -1))
  const goToNext = () => { const n = offsetDate(date, 1); if (n <= TODAY) setDate(n) }

  const { dayName, monthDay, year } = formatDateDisplay(date)
  const isToday     = date === TODAY
  const LINE_H      = 28
  const prayersDone = PRAYERS.filter(p => habits[p.key]).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={embedded ? {} : {
        position: 'absolute', left: pos.x, top: pos.y, width: 520, zIndex,
        border: `2px solid ${C.frame}`,
        boxShadow: `0 8px 40px rgba(122,26,56,0.16), 0 2px 10px rgba(122,26,56,0.09)`,
        background: 'rgba(255, 240, 248, 0.92)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
      onMouseDown={embedded ? undefined : onFocus}
    >
      {/* Title bar */}
      <div onMouseDown={onTitleDown} style={{
        background: C.bar, padding: '6px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        userSelect: 'none', cursor: 'grab',
        borderTopLeftRadius: '10px', borderTopRightRadius: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-notebook" style={{ fontSize: 13, color: C.barT }} />
          <span style={{ fontFamily: FONT, fontSize: SIZE.sm, color: C.barT, letterSpacing: '.08em' ,}}>
            MY JOURNAL
          </span>
        </div>
        {activeTab === 'journal' && isDirty && !loading && (
          <span style={{ fontFamily: FONT, fontSize: 7, color: C.barT, opacity: 0.75 }}>● UNSAVED</span>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: C.face, borderBottom: `2px solid ${C.frame}`, padding: '5px 8px 0', gap: 3, alignItems: 'flex-end' }}>
        {[{ id: 'journal', label: 'JOURNAL' }, { id: 'habits', label: 'HABITS' }].map(t => (
          <JTabBtn key={t.id} label={t.label} active={activeTab === t.id} onClick={() => setActiveTab(t.id)} />
        ))}
      </div>

      {/* Notification */}
      {notif && (
        <div style={{
          position: 'absolute', top: 58, left: 10, right: 10, zIndex: 50,
          background: notif.type === 'ok' ? '#C8E8D4' : '#FFB8C8',
          border: `2px solid ${notif.type === 'ok' ? C.ok : C.err}`,
          boxShadow: `2px 2px 0 ${C.sh}`, padding: '6px 10px',
          fontFamily: FONT, fontSize: 7, color: notif.type === 'ok' ? C.ok : C.err,
          wordBreak: 'break-all', lineHeight: 1.8,
        }}>
          {notif.type === 'ok' ? '✓ ' : '✗ '}{notif.msg}
        </div>
      )}

      {/* Overwrite confirm */}
      {confirmOverwrite && (
        <div style={{
          position: 'absolute', top: 58, left: 10, right: 10, zIndex: 51,
          background: '#FFF0C8', border: `2px solid #B8860B`,
          boxShadow: `2px 2px 0 ${C.sh}`, padding: '8px 10px',
          fontFamily: FONT, fontSize: 7, color: '#6A4A00', lineHeight: 2,
        }}>
          <div style={{ marginBottom: 6 }}>⚠ AN ENTRY ALREADY EXISTS FOR THIS DATE. OVERWRITE IT?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={doSave} style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.ok, background: C.face, border: 'none', boxShadow: RAISED, padding: '4px 14px', borderRadius: '6px', cursor: 'pointer' }}>YES, OVERWRITE</Btn>
            <Btn onClick={() => setConfirmOverwrite(false)} style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut, background: C.face, border: 'none', boxShadow: RAISED, padding: '4px 14px', borderRadius: '6px', cursor: 'pointer' }}>CANCEL</Btn>
          </div>
        </div>
      )}

      {/* ════════════ JOURNAL TAB ════════════ */}
      {activeTab === 'journal' && (<>
        <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${C.grd}`, background: 'rgba(255,245,248,0.6)' }}>
          {/* Nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Btn onClick={goToPrev} style={{ fontFamily: FONT, color: C.mut, background: C.face, border: 'none', boxShadow: RAISED, padding: '5px 18px', fontSize: 14, borderRadius: '6px', cursor: 'pointer' }}>◄</Btn>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FONT, fontSize: SIZE.lg, color: C.frame, letterSpacing: '.06em', lineHeight: 1.3 }}>{dayName.toUpperCase()}</div>
              <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut, marginTop: 2, letterSpacing: '.04em' }}>
                {monthDay}, {year}
                {isToday && <span style={{ marginLeft: 6, background: C.bar, color: C.barT, padding: '4px 5px', fontSize: 7 , borderRadius: '5px'}}>TODAY</span>}
                {savedEntry !== null && !isDirty && <span style={{ marginLeft: 6, background: C.ok, color: '#fff', padding: '4px 5px', fontSize: 7 , borderRadius: '5px'}}>SAVED</span>}
              </div>
            </div>
            <Btn onClick={goToNext} disabled={isToday} style={{ fontFamily: FONT, color: isToday ? C.grd : C.mut, background: C.face, border: 'none', boxShadow: isToday ? SUNKEN : RAISED, padding: '5px 18px', cursor: isToday ? 'default' : 'pointer', opacity: isToday ? 0.5 : 1, fontSize: 14, borderRadius: '6px' }}>►</Btn>
          </div>
          {/* Jump to date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>JUMP TO:</span>
            <input type="date" value={date} max={TODAY} onChange={e => e.target.value && setDate(e.target.value)} style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.txt, background: C.inp, border: `1px solid ${C.grd}`, boxShadow: SUNKEN, padding: '1px 4px', outline: 'none', flex: 1 }} />
          </div>
          {/* Weather */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>WEATHER:</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {WEATHER_OPTIONS.map(w => (
                <Btn key={w.label} onClick={() => setWeather(weather === w.label ? '' : w.label)}
                title={w.label} style={{ fontSize: 20, padding: '3px 5px', border: 'none', background: weather === w.label ? C.face : 'transparent', boxShadow: weather === w.label ? SUNKEN : 'none', borderRadius: '4px', outline: weather === w.label ? `2px solid ${C.frame}` : 'none', lineHeight: 1, cursor: 'pointer' }}>{w.emoji}</Btn>
              ))}
            </div>
          </div>
        </div>

        {/* Notebook */}
        <div style={{ position: 'relative', background: `repeating-linear-gradient(transparent, transparent ${LINE_H - 1}px, rgba(232,160,184,0.35) ${LINE_H - 1}px, rgba(232,160,184,0.35) ${LINE_H}px)`, backgroundColor: '#FFF8FB', paddingTop: 4 }}>
          {loading
            ? <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>LOADING…</div>
            : <textarea value={content} onChange={e => setContent(e.target.value)} placeholder={savedEntry === null ? `Write about your ${dayName.toLowerCase()}…` : ''} style={{ width: '100%', minHeight: 280, height: 280, resize: 'vertical', fontFamily: '"Press Start 2P", "Courier New", monospace', fontSize: 9, color: C.txt, lineHeight: `${LINE_H}px`, background: 'transparent', border: 'none', outline: 'none', padding: `4px 16px 0 40px`, boxSizing: 'border-box', letterSpacing: '.02em' }} />
          }
          <div style={{ position: 'absolute', top: 0, left: 32, bottom: 0, width: 1, background: 'rgba(200,80,130,0.3)', pointerEvents: 'none' }} />
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 12px', background: 'rgba(255,245,248,0.6)', borderTop: `1px solid ${C.grd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' ,borderBottomLeftRadius: "10px", borderBottomRightRadius: "10px"}}>
          <div>
            <div style={{ fontFamily: FONT, fontSize: 7, color: lastSaved ? C.ok : C.grd }}>{lastSaved ? `LAST SAVED ${lastSaved}` : 'NOT SAVED YET'}</div>
            {isDirty && !loading && <div style={{ fontFamily: FONT, fontSize: 6, color: '#B8860B', marginTop: 2 }}>UNSAVED CHANGES</div>}
          </div>
          <Btn onClick={handleSaveClick} disabled={saving || loading} style={{ fontFamily: FONT, fontSize: SIZE.md, color: saving ? C.mut : C.ok, background: C.face, border: 'none', boxShadow: (saving || loading) ? SUNKEN : RAISED, padding: '12px 18px', minWidth: 120, minHeight: 30, opacity: (saving || loading) ? 0.7 : 1, borderRadius: '6px', cursor: saving || loading ? 'default' : 'pointer' }}>
            {saving ? 'SAVING…' : savedEntry !== null ? '► UPDATE' : '► SAVE'}
          </Btn>
        </div>
      </>)}

      {/* ════════════ HABITS TAB ════════════ */}
      {activeTab === 'habits' && (<>
        <div style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>

          {/* Date context */}
          <div style={{ textAlign: 'center', marginBottom: 10, fontFamily: FONT, fontSize: SIZE.xs, color: C.frame }}>
            {dayName.toUpperCase()}, {monthDay} {year}
            {savedHabits !== null && <span style={{ marginLeft: 8, background: C.ok, color: '#fff', padding: '4px 5px', fontSize: 7, borderRadius: '5px' }}>SAVED</span>}
          </div>

          {/* Water intake */}
          <HGroup title="WATER INTAKE">
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 5 }}>
              {Array.from({ length: 8 }, (_, i) => (
                <button key={i}
                  onClick={() => hf('water_glasses', i < habits.water_glasses ? i : i + 1)}
                  style={{ background: 'none', border: 'none', padding: '1px 2px', fontSize: 19, lineHeight: 1, opacity: i < habits.water_glasses ? 1 : 0.18, filter: i < habits.water_glasses ? 'none' : 'grayscale(1)', transition: 'opacity 0.12s' }}>
                  💧
                </button>
              ))}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut }}>{habits.water_glasses} / 8 glasses</div>
          </HGroup>

          {/* Prayers */}
          <HGroup title={`PRAYERS & QURAN  ${prayersDone}/5 ✓`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              {PRAYERS.map(p => (
                <PixelCheck key={p.key} label={p.label} checked={habits[p.key]} onChange={v => hf(p.key, v)} />
              ))}
              <PixelCheck label="QURAN TODAY" checked={habits.quran_recited} onChange={v => hf('quran_recited', v)} />
            </div>
          </HGroup>

          {/* To-do list */}
          <HGroup title="TO-DO TODAY">
            <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
              <input value={todoInput} onChange={e => setTodoInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()} placeholder="add task…"
                style={{ fontFamily: FONT, fontSize: 7, flex: 1, background: C.inp, border: `1px solid ${C.grd}`, boxShadow: SUNKEN, padding: '4px 6px', color: C.txt, outline: 'none' }} />
              <Btn onClick={addTodo} style={{ borderRadius: '6px', fontFamily: FONT, fontSize: SIZE.xs, color: C.ok, background: C.face, border: 'none', boxShadow: RAISED, padding: '6px 14px', minHeight: 32, cursor: 'pointer' }}>+</Btn>
            </div>
            {habits.todos.length === 0
              ? <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut }}>no tasks yet</div>
              : habits.todos.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                  <div onClick={() => toggleTodo(i)} style={{ width: 12, height: 12, flexShrink: 0, border: `2px solid ${C.frame}`, background: t.done ? C.frame : C.inp, boxShadow: t.done ? SUNKEN : RAISED, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {t.done && <span style={{ color: '#fff', fontSize: 7, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontFamily: FONT, fontSize: 7, flex: 1, color: C.txt, lineHeight: 1.7, textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.42 : 1 }}>{t.text}</span>
                  <Btn onClick={() => removeTodo(i)} style={{ background: 'none', border: 'none', fontSize: 9, color: C.mut, padding: '1px 4px', lineHeight: 1, flexShrink: 0, cursor: 'pointer' }}>✕</Btn>
                </div>
              ))
            }
          </HGroup>

          {/* Project ideas */}
          <HGroup title="PROJECT IDEAS">
            <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
              <input value={ideaInput} onChange={e => setIdeaInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addIdea()} placeholder="add idea…"
                style={{ fontFamily: FONT, fontSize: 7, flex: 1, background: C.inp, border: `1px solid ${C.grd}`, boxShadow: SUNKEN, padding: '4px 6px', color: C.txt, outline: 'none' }} />
              <Btn onClick={addIdea} style={{ borderRadius: '6px', fontFamily: FONT, fontSize: SIZE.xs, color: C.ok, background: C.face, border: 'none', boxShadow: RAISED, padding: '6px 14px', minHeight: 32, cursor: 'pointer' }}>+</Btn>
            </div>
            {habits.project_ideas.length === 0
              ? <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut }}>no ideas yet</div>
              : habits.project_ideas.map((idea, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                  <span style={{ fontSize: 8, color: C.face, flexShrink: 0 }}>♥</span>
                  <span style={{ fontFamily: FONT, fontSize: 7, flex: 1, color: C.txt, lineHeight: 1.7 }}>{idea}</span>
                  <Btn onClick={() => removeIdea(i)} style={{ background: 'none', border: 'none', fontSize: 9, color: C.mut, padding: '1px 4px', lineHeight: 1, flexShrink: 0, cursor: 'pointer' }}>✕</Btn>
                </div>
              ))
            }
          </HGroup>

        </div>

        {/* Habits footer */}
        <div style={{ borderBottomLeftRadius: "10px", borderBottomRightRadius: "10px", padding: '8px 12px', background: 'rgba(255,245,248,0.6)', borderTop: `1px solid ${C.grd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: FONT, fontSize: 7, color: habitLastSaved ? C.ok : C.grd }}>
            {habitLastSaved ? `LAST SAVED ${habitLastSaved}` : 'NOT SAVED YET'}
          </div>
          <Btn onClick={doSaveHabits} disabled={savingHabits} style={{ borderRadius: '6px', fontFamily: FONT, fontSize: SIZE.md, color: savingHabits ? C.mut : C.ok, background: C.face, border: 'none', boxShadow: savingHabits ? SUNKEN : RAISED, padding: '12px 18px', minWidth: 140, minHeight: 44, opacity: savingHabits ? 0.7 : 1, cursor: savingHabits ? 'default' : 'pointer' }}>
            {savingHabits ? 'SAVING…' : savedHabits !== null ? '► UPDATE' : '► SAVE'}
          </Btn>
        </div>
      </>)}

    </div>
  )
}