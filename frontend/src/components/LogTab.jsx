// components/LogTab.jsx — daily symptom + lifestyle log form

import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import { C, FONT, RAISED, SIZE } from '../theme.js'
import { Label, Inp, Sel, CheckRow, RadioRow, GroupBox, PixelBtn } from './Shared.jsx'

const TODAY = new Date().toLocaleDateString('sv')

const INIT = {
  log_date: TODAY,
  flow_intensity: '',
  mucus_type: '',
  sleep_hours: '',
  sleep_quality: '',
  stress_level: '',
  weight_kg: '',
  exercise_mins: '',
  moods: [],
  symptom_cramps:        false,
  symptom_bloating:      false,
  symptom_breast_tender: false,
  symptom_headache:      false,
  symptom_acne:          false,
  symptom_back_pain:     false,
  symptom_nausea:        false,
  symptom_fatigue:       false,
  symptom_ovulation_pain:false,
}

const MOODS = ['happy', 'calm', 'anxious', 'sad', 'irritable', 'energetic', 'depressed', 'neutral']
const SYMS  = [
  ['symptom_cramps',         'cramps'],
  ['symptom_bloating',       'bloating'],
  ['symptom_breast_tender',  'breast tender'],
  ['symptom_headache',       'headache'],
  ['symptom_acne',           'acne'],
  ['symptom_back_pain',      'back pain'],
  ['symptom_nausea',         'nausea'],
  ['symptom_fatigue',        'fatigue'],
  ['symptom_ovulation_pain', 'ovulation pain'],
]

function daysBetween(d1, d2) {
  return Math.max(1, Math.round((new Date(d2) - new Date(d1)) / 86_400_000) + 1)
}

export default function LogTab({ activeCycle, notify, onSaved }) {
  const [form, setForm] = useState(INIT)
  const [saving, setSaving]             = useState(false)
  const [existingLog, setExistingLog]   = useState(null)   // log fetched from DB for current date
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [checking, setChecking]         = useState(false)

  // Check DB whenever date OR activeCycle changes.
  // activeCycle starts as undefined (loading) then becomes object or null.
  // We must re-run when it transitions from undefined → object so that
  // previously saved logs from past sessions are detected on initial mount.
  useEffect(() => {
    // Wait until activeCycle has resolved (undefined = still loading)
    if (activeCycle === undefined || !form.log_date) return
    // No active cycle — nothing to check
    if (!activeCycle) { setExistingLog(null); setChecking(false); return }

    setChecking(true)
    setConfirmOverwrite(false)
    setExistingLog(null)

    api.getLogs(300)
      .then(logs => {
        // Normalise DB date — may be "2025-05-20" or "2025-05-20T00:00:00" or "2025-05-20 00:00:00"
        const match = logs.find(l =>
          String(l.log_date).slice(0, 10) === form.log_date && l.cycle_id === activeCycle.id
        )
        

        if (match) {
          setExistingLog(match)
          // Populate form from DB so user sees what was previously saved
          setForm(prev => ({
            ...prev,
            flow_intensity:        match.flow_intensity != null ? String(match.flow_intensity) : '',
            mucus_type:            match.mucus_type            || '',
            moods:                 Array.isArray(match.moods)  ? match.moods : [],
            symptom_cramps:        !!match.symptom_cramps,
            symptom_bloating:      !!match.symptom_bloating,
            symptom_breast_tender: !!match.symptom_breast_tender,
            symptom_headache:      !!match.symptom_headache,
            symptom_acne:          !!match.symptom_acne,
            symptom_back_pain:     !!match.symptom_back_pain,
            symptom_nausea:        !!match.symptom_nausea,
            symptom_fatigue:       !!match.symptom_fatigue,
            symptom_ovulation_pain:!!match.symptom_ovulation_pain,
            sleep_hours:    match.sleep_hours    != null ? String(match.sleep_hours)  : '',
            sleep_quality:  match.sleep_quality  != null ? String(match.sleep_quality): '',
            stress_level:   match.stress_level   != null ? String(match.stress_level) : '',
            weight_kg:      match.weight_kg      != null ? String(match.weight_kg)    : '',
            exercise_mins:  match.exercise_mins  != null ? String(match.exercise_mins): '',
          }))
        } else {
          setExistingLog(null)
          // Reset form to blank for this date (keep the date itself)
          setForm(prev => ({ ...INIT, log_date: prev.log_date }))
        }
      })
      .catch(() => { setExistingLog(null) })
      .finally(() => setChecking(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.log_date, activeCycle?.id])
  // NOTE: activeCycle?.id — using the id (not the object reference) means
  // the effect only re-runs when the active cycle actually changes, not on
  // every parent render.

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const toggleMood = m => setForm(p => ({
    ...p,
    moods: p.moods.includes(m) ? p.moods.filter(x => x !== m) : [...p.moods, m],
  }))

  const buildPayload = () => {
    const dayNum = daysBetween(activeCycle.start_date, form.log_date)
    return {
      cycle_id:              activeCycle.id,
      log_date:              form.log_date,
      day_of_cycle:          dayNum,
      flow_intensity:        form.flow_intensity !== '' ? parseInt(form.flow_intensity) : null,
      mucus_type:            form.mucus_type || null,
      moods:                 form.moods,
      symptom_cramps:        form.symptom_cramps,
      symptom_bloating:      form.symptom_bloating,
      symptom_breast_tender: form.symptom_breast_tender,
      symptom_headache:      form.symptom_headache,
      symptom_acne:          form.symptom_acne,
      symptom_back_pain:     form.symptom_back_pain,
      symptom_nausea:        form.symptom_nausea,
      symptom_fatigue:       form.symptom_fatigue,
      symptom_ovulation_pain:form.symptom_ovulation_pain,
      sleep_hours:           form.sleep_hours   ? parseFloat(form.sleep_hours)  : null,
      sleep_quality:         form.sleep_quality ? parseInt(form.sleep_quality)  : null,
      stress_level:          form.stress_level  ? parseInt(form.stress_level)   : null,
      weight_kg:             form.weight_kg     ? parseFloat(form.weight_kg)    : null,
      exercise_mins:         form.exercise_mins ? parseInt(form.exercise_mins)  : null,
    }
  }

  const handleSave = () => {
    if (!form.log_date) { notify('err', 'DATE IS REQUIRED'); return }
    if (!activeCycle)   { notify('err', 'NO ACTIVE CYCLE — START ONE IN MY CYCLES'); return }
    // If a log already exists for this date, ask for confirmation
    if (existingLog) {
      setConfirmOverwrite(true)
      return
    }
    doSave()
  }

  const doSave = async () => {
    setConfirmOverwrite(false)
    setSaving(true)
    try {
      const payload = buildPayload()
      await api.saveLog(payload)
      notify('ok', existingLog ? `DAY ${payload.day_of_cycle} LOG UPDATED` : `DAY ${payload.day_of_cycle} LOG SAVED`)
      onSaved()
      setExistingLog({ ...payload })   // treat it as the new "existing" log
      // Keep form populated — don't clear after save
    } catch (e) {
      notify('err', e.message || 'SAVE FAILED')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    // Clear form but keep the date — effect will NOT re-run (date unchanged)
    // so manually reset existingLog state too if user wants a fresh start
    setForm({ ...INIT, log_date: form.log_date })
    setConfirmOverwrite(false)
  }

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)'}}>

      {/* No active cycle banner */}
      {!activeCycle && (
        <div style={{
          background: '#FFE8F2', border: `2px solid ${C.frame}`,
          padding: '8px 12px', marginBottom: 10,
          fontFamily: FONT, fontSize: SIZE.md, color: '#7A1A38'
        }}>
          ⚠ No active cycle. Go to MY CYCLES → START NEW CYCLE before logging.
        </div>
      )}

      {/* Overwrite confirmation */}
      {confirmOverwrite && (
        <div style={{
          background: '#FFF0C8',
          border: `2px solid #B8860B`,
          boxShadow: `2px 2px 0 ${C.sh}`,
          padding: '10px 12px', marginBottom: 10,
          fontFamily: FONT, fontSize: SIZE.xs, color: '#6A4A00', lineHeight: 2,
        }}>
          <div style={{ marginBottom: 8 }}>
            ⚠ A LOG ALREADY EXISTS FOR {form.log_date}. UPDATE IT WITH CURRENT VALUES?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doSave} style={{
              fontFamily: FONT, fontSize: SIZE.xs, color: C.ok,
              background: C.face, border: 'none', boxShadow: RAISED,
              padding: '3px 14px', cursor: 'pointer',
            }}>
              YES, UPDATE
            </button>
            <button onClick={() => setConfirmOverwrite(false)} style={{
              fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
              background: C.face, border: 'none', boxShadow: RAISED,
              padding: '3px 14px', cursor: 'pointer',
            }}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Active cycle context pill */}
      {activeCycle && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: C.face, boxShadow: RAISED,
          padding: '2px 10px', marginBottom: 8,
          fontFamily: FONT, fontSize: SIZE.sm, color: C.mut,
          borderRadius: "5px"
        }}>
          <span style={{ color: C.accent }}>●</span>
          Cycle #{activeCycle.cycle_number} · started {activeCycle.start_date}
          {existingLog && (
            <span style={{
              marginLeft: 8, background: C.ok, color: '#fff',
              padding: '1px 5px', fontSize: 7, fontFamily: FONT,borderRadius: "5px"
            }}>
              LOG EXISTS
            </span>
          )}
          {form.log_date && (
            <span style={{ color: C.txt }}>
              · day {daysBetween(activeCycle.start_date, form.log_date)}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>

        {/* ── Left column ─────────────────────────────────────────── */}
        <div>
          <GroupBox title="DATE &amp; FLOW" style={{ borderRadius: "5px" }}>
            <Label htmlFor="log_date">log date</Label>
            <Inp id="log_date" type="date" lang="en-CA" value={form.log_date}
            onChange={e => f('log_date', e.target.value.replace(/\//g, '-'))}
              style={{ marginBottom: 6 }} />
            <Label htmlFor="flow_intensity">flow intensity</Label>
            <Sel id="flow_intensity" value={form.flow_intensity}
              onChange={e => f('flow_intensity', e.target.value)}>
              <option value="">— select —</option>
              {['0 — none','1 — spotting','2 — light','3 — medium','4 — heavy','5 — very heavy']
                .map((o, i) => <option key={i} value={i}>{o}</option>)}
            </Sel>
          </GroupBox>

          <GroupBox title="CERVICAL MUCUS" style={{ borderRadius: "5px" }}>
            <Label htmlFor="mucus_type" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              cervical mucus type
            </Label>
            <Sel id="mucus_type" value={form.mucus_type}
              onChange={e => f('mucus_type', e.target.value)}>
              <option value="">— select —</option>
              {['dry','sticky','creamy','watery','egg_white','spotting']
                .map(o => <option key={o} value={o}>{o}</option>)}
            </Sel>
          </GroupBox>

          <GroupBox title="BIOMETRICS" cols="1fr 1fr" style={{ borderRadius: "5px" }}>
            <div>
              <Label htmlFor="weight_kg">weight (kg)</Label>
              <Inp id="weight_kg" type="number" step="0.1" placeholder="65.0"
                value={form.weight_kg} onChange={e => f('weight_kg', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="exercise_mins">exercise (min)</Label>
              <Inp id="exercise_mins" type="number" min="0" placeholder="0"
                value={form.exercise_mins} onChange={e => f('exercise_mins', e.target.value)} />
            </div>
          </GroupBox>

          <GroupBox title="SLEEP &amp; STRESS" style={{ borderRadius: "5px" }}>
            <Label htmlFor="sleep_hours">sleep hours</Label>
            <Inp id="sleep_hours" type="number" step="0.5" min="0" max="14" placeholder="7.5"
              value={form.sleep_hours} onChange={e => f('sleep_hours', e.target.value)}
              style={{ marginBottom: 6 }} />
            <div role="radiogroup" aria-labelledby="sq_label">
              <div id="sq_label" style={{ fontFamily: FONT, fontSize: SIZE.sm,
                color: C.mut, marginBottom: 2, letterSpacing: '.04em' }}>
                sleep quality
              </div>
              <div style={{ display: 'flex', marginBottom: 6 }}>
                {[['1','poor'],['2','fair'],['3','good']].map(([v,l]) => (
                  <RadioRow key={v} name="sq" value={v} current={form.sleep_quality}
                    onChange={v => f('sleep_quality', v)} label={l} />
                ))}
              </div>
            </div>
            <div role="radiogroup" aria-labelledby="sl_label">
              <div id="sl_label" style={{ fontFamily: FONT, fontSize: SIZE.sm,
                color: C.mut, marginBottom: 2, letterSpacing: '.04em' }}>
                stress level
              </div>
              <div style={{ display: 'flex' }}>
                {[['1','low'],['2','moderate'],['3','high']].map(([v,l]) => (
                  <RadioRow key={v} name="sl" value={v} current={form.stress_level}
                    onChange={v => f('stress_level', v)} label={l} />
                ))}
              </div>
            </div>
          </GroupBox>
        </div>

        {/* ── Right column ─────────────────────────────────────────── */}
        <div>
          <GroupBox title="MOOD" cols="1fr 1fr" style={{ borderRadius: "5px" }}>
            {MOODS.map(m => (
              <CheckRow key={m} label={m}
                checked={form.moods.includes(m)}
                onChange={() => toggleMood(m)} />
            ))}
          </GroupBox>

          <GroupBox title="SYMPTOMS" cols="1fr 1fr" style={{ borderRadius: "5px" }}>
            {SYMS.map(([k, l]) => (
              <CheckRow key={k} label={l}
                checked={form[k]}
                onChange={v => f(k, v)} />
            ))}
          </GroupBox>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        borderTop: `1px solid ${C.grd}`, paddingTop: 8, marginTop: 4,
        display: 'flex', justifyContent: 'flex-end', gap: 6
      }}>
        <PixelBtn onClick={handleClear} color={C.mut} >CLEAR</PixelBtn>
        <PixelBtn onClick={handleSave} color={C.ok} disabled={saving || checking}
          style={{ minWidth: 140, minHeight: 44, fontSize: SIZE.md, padding: '12px 18px' }}>
          {checking ? 'CHECKING…' : saving ? 'SAVING…' : existingLog ? '▶ UPDATE LOG' : '▶ SAVE LOG'}
        </PixelBtn>
      </div>
    </div>
  )
}