// components/LogTab.jsx — daily symptom + lifestyle log form

import { useState } from 'react'
import { api } from '../api.js'
import { C, FONT, RAISED, SIZE } from '../theme.js'
import { Label, Inp, Sel, CheckRow, RadioRow, GroupBox, PixelBtn } from './Shared.jsx'

const TODAY = new Date().toISOString().slice(0, 10)

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
  const [saving, setSaving] = useState(false)

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const toggleMood = m => setForm(p => ({
    ...p,
    moods: p.moods.includes(m) ? p.moods.filter(x => x !== m) : [...p.moods, m],
  }))

  const handleSave = async () => {
    if (!form.log_date) { notify('err', 'DATE IS REQUIRED'); return }
    if (!activeCycle)   { notify('err', 'NO ACTIVE CYCLE — START ONE IN MY CYCLES'); return }

    setSaving(true)
    try {
      const dayNum = daysBetween(activeCycle.start_date, form.log_date)
      await api.saveLog({
        cycle_id:    activeCycle.id,
        log_date:    form.log_date,
        day_of_cycle: dayNum,
        flow_intensity:  form.flow_intensity  !== '' ? parseInt(form.flow_intensity)   : null,
        mucus_type:      form.mucus_type      || null,
        moods:           form.moods,
        symptom_cramps:         form.symptom_cramps,
        symptom_bloating:       form.symptom_bloating,
        symptom_breast_tender:  form.symptom_breast_tender,
        symptom_headache:       form.symptom_headache,
        symptom_acne:           form.symptom_acne,
        symptom_back_pain:      form.symptom_back_pain,
        symptom_nausea:         form.symptom_nausea,
        symptom_fatigue:        form.symptom_fatigue,
        symptom_ovulation_pain: form.symptom_ovulation_pain,
        sleep_hours:   form.sleep_hours   ? parseFloat(form.sleep_hours)  : null,
        sleep_quality: form.sleep_quality ? parseInt(form.sleep_quality)  : null,
        stress_level:  form.stress_level  ? parseInt(form.stress_level)   : null,
        weight_kg:     form.weight_kg     ? parseFloat(form.weight_kg)    : null,
        exercise_mins: form.exercise_mins ? parseInt(form.exercise_mins)  : null,
      })
      notify('ok', `DAY ${dayNum} LOG SAVED`)
      onSaved()
      setForm({ ...INIT, log_date: form.log_date })
    } catch (e) {
      notify('err', e.message || 'SAVE FAILED')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => setForm({ ...INIT, log_date: form.log_date })

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' }}>

      {/* No active cycle banner */}
      {!activeCycle && (
        <div style={{
          background: '#FFE8F2', border: `2px solid ${C.frame}`,
          padding: '8px 12px', marginBottom: 10,
          fontFamily: FONT, fontSize: SIZE.md, color: '#7A1A38',
        }}>
          ⚠ No active cycle. Go to MY CYCLES → START NEW CYCLE before logging.
        </div>
      )}

      {/* Active cycle context pill */}
      {activeCycle && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: C.face, boxShadow: RAISED,
          padding: '2px 10px', marginBottom: 8,
          fontFamily: FONT, fontSize: SIZE.sm, color: C.mut,
        }}>
          <span style={{ color: C.sage }}>●</span>
          Cycle #{activeCycle.cycle_number} · started {activeCycle.start_date}
          {form.log_date && (
            <span style={{ color: C.txt }}>
              · day {daysBetween(activeCycle.start_date, form.log_date)}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

        {/* ── Left column ─────────────────────────────────────────── */}
        <div>
          <GroupBox title="DATE &amp; FLOW">
            <Label>log date</Label>
            <Inp type="date" value={form.log_date}
              onChange={e => f('log_date', e.target.value)}
              style={{ marginBottom: 6 }} />
            <Label>flow intensity</Label>
            <Sel value={form.flow_intensity}
              onChange={e => f('flow_intensity', e.target.value)}>
              <option value="">— select —</option>
              {['0 — none','1 — spotting','2 — light','3 — medium','4 — heavy','5 — very heavy']
                .map((o, i) => <option key={i} value={i}>{o}</option>)}
            </Sel>
          </GroupBox>

          <GroupBox title="CERVICAL MUCUS">
            <Sel value={form.mucus_type}
              onChange={e => f('mucus_type', e.target.value)}>
              <option value="">— select —</option>
              {['dry','sticky','creamy','watery','egg_white','spotting']
                .map(o => <option key={o} value={o}>{o}</option>)}
            </Sel>
          </GroupBox>

          <GroupBox title="BIOMETRICS" cols="1fr 1fr">
            <div>
              <Label>weight (kg)</Label>
              <Inp type="number" step="0.1" placeholder="65.0"
                value={form.weight_kg} onChange={e => f('weight_kg', e.target.value)} />
            </div>
            <div>
              <Label>exercise (min)</Label>
              <Inp type="number" min="0" placeholder="0"
                value={form.exercise_mins} onChange={e => f('exercise_mins', e.target.value)} />
            </div>
          </GroupBox>

          <GroupBox title="SLEEP &amp; STRESS">
            <Label>sleep hours</Label>
            <Inp type="number" step="0.5" min="0" max="14" placeholder="7.5"
              value={form.sleep_hours} onChange={e => f('sleep_hours', e.target.value)}
              style={{ marginBottom: 6 }} />
            <Label>sleep quality</Label>
            <div style={{ display: 'flex', marginBottom: 6 }}>
              {[['1','poor'],['2','fair'],['3','good']].map(([v,l]) => (
                <RadioRow key={v} name="sq" value={v} current={form.sleep_quality}
                  onChange={v => f('sleep_quality', v)} label={l} />
              ))}
            </div>
            <Label>stress level</Label>
            <div style={{ display: 'flex' }}>
              {[['1','low'],['2','moderate'],['3','high']].map(([v,l]) => (
                <RadioRow key={v} name="sl" value={v} current={form.stress_level}
                  onChange={v => f('stress_level', v)} label={l} />
              ))}
            </div>
          </GroupBox>
        </div>

        {/* ── Right column ─────────────────────────────────────────── */}
        <div>
          <GroupBox title="MOOD" cols="1fr 1fr">
            {MOODS.map(m => (
              <CheckRow key={m} label={m}
                checked={form.moods.includes(m)}
                onChange={() => toggleMood(m)} />
            ))}
          </GroupBox>

          <GroupBox title="SYMPTOMS" cols="1fr 1fr">
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
        display: 'flex', justifyContent: 'flex-end', gap: 6,
      }}>
        <PixelBtn onClick={handleClear} color={C.mut}>CLEAR</PixelBtn>
        <PixelBtn onClick={handleSave} color={C.ok} disabled={saving}
          style={{ minWidth: 110 }}>
          {saving ? 'SAVING…' : '▶ SAVE LOG'}
        </PixelBtn>
      </div>
    </div>
  )
}