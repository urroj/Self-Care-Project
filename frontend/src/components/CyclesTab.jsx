// components/CyclesTab.jsx — cycle management

import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { C, FONT, RAISED, SUNKEN, TD, TH, SIZE} from '../theme.js'
import { Label, Inp, Sel, GroupBox, PixelBtn, StatCard, PhaseProgress, LoadingRow, EmptyRow } from './Shared.jsx'

const TODAY = new Date().toISOString().slice(0, 10)

export default function CyclesTab({ refreshKey, activeCycle, notify, onCycleAction }) {
  const [cycles, setCycles]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [endDate,        setEndDate]        = useState(TODAY)
  const [periodEndDate,  setPeriodEndDate]  = useState('')
  const [ovulationDate,  setOvulationDate]  = useState('')
  const [savingDates,    setSavingDates]    = useState(false)
  const [completing,     setCompleting]     = useState(false)

  // Start new cycle form state
  const [showStart, setShowStart] = useState(false)
  const [startForm, setStartForm] = useState({ start_date: TODAY, period_start: TODAY, period_end: '' })
  const [starting, setStarting]   = useState(false)

  useEffect(() => {
    setLoading(true)
    api.getCycles()
      .then(d => setCycles(d.all || []))
      .catch(e => notify('err', 'DB ERROR: ' + e.message))
      .finally(() => setLoading(false))
  }, [refreshKey])

  const completed = cycles.filter(c => c.is_complete)
  const meanLength = completed.length
    ? (completed.reduce((s, c) => s + (c.cycle_length || 0), 0) / completed.length).toFixed(1)
    : '—'

  const handleStartCycle = async () => {
    if (!startForm.start_date) { notify('err', 'START DATE IS REQUIRED'); return }
    setStarting(true)
    try {
      await api.startCycle(startForm)
      notify('ok', 'NEW CYCLE STARTED')
      setShowStart(false)
      setStartForm({ start_date: TODAY, period_start: TODAY, period_end: '' })
      onCycleAction()
    } catch (e) {
      notify('err', e.message || 'FAILED TO START CYCLE')
    } finally {
      setStarting(false)
    }
  }

  const handleSaveDates = async () => {
    if (!activeCycle) return
    if (!periodEndDate && !ovulationDate) {
      notify('err', 'ENTER AT LEAST ONE DATE TO SAVE')
      return
    }
    setSavingDates(true)
    try {
      // Update cycle with period_end and/or ovulation_date via PATCH-style complete-lite
      await api.updateCycleDates({
        cycle_id:       activeCycle.id,
        period_end:     periodEndDate || null,
        ovulation_date: ovulationDate || null,
      })
      notify('ok', 'DATES SAVED')
      onCycleAction()
    } catch (e) {
      notify('err', e.message || 'SAVE FAILED')
    } finally {
      setSavingDates(false)
    }
  }

  const handleComplete = async () => {
    if (!endDate)     { notify('err', 'SELECT AN END DATE'); return }
    if (!activeCycle) { notify('err', 'NO ACTIVE CYCLE FOUND'); return }

    const start = new Date(activeCycle.start_date)
    const end   = new Date(endDate)
    const diff  = Math.round((end - start) / 86_400_000)
    if (diff < 15) { notify('err', 'END DATE TOO EARLY — CHECK DATE'); return }
    if (diff > 60) { notify('err', 'CYCLE > 60 DAYS — CHECK DATE'); return }

    setCompleting(true)
    try {
      const result = await api.completeCycle({ cycle_id: activeCycle.id, end_date: endDate })
      const pred   = result.prediction
      const nextPeriod = pred?.next_period_start_est || '—'
      notify('ok', `CYCLE #${activeCycle.cycle_number} COMPLETE · NEXT PERIOD ~${nextPeriod}`)
      onCycleAction()
    } catch (e) {
      notify('err', e.message || 'COMPLETE FAILED')
    } finally {
      setCompleting(false)
    }
  }

  const elapsedDays = activeCycle
    ? Math.round((new Date() - new Date(activeCycle.start_date)) / 86_400_000)
    : 0

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' }}>

      {/* ── Active cycle panel ─────────────────────────────────────── */}
      {activeCycle ? (
        <div style={{
          border: `2px solid ${C.frame}`, background: '#FFE8F2',
          padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            fontFamily: FONT, fontSize: SIZE.md, fontWeight: 'bold', color: '#7A1A38',
            letterSpacing: '.08em',
          }}>
            <i className="ti ti-circle-dot" style={{ fontSize: SIZE.md, color: C.frame }} aria-hidden="true" />
            ACTIVE CYCLE
            <span style={{
              fontFamily: FONT, fontSize: SIZE.xs,
              background: C.frame, color: '#FFFFFF',
              padding: '1px 8px', letterSpacing: '.06em',
            }}>
              CYCLE #{activeCycle.cycle_number}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
            {[
              ['STARTED',       activeCycle.start_date],
              ['DAYS ELAPSED',  elapsedDays + 'd'],
              ['STATUS',        'IN PROGRESS'],
            ].map(([l, v]) => (
              <div key={l} style={{ background: '#FFD6E5', padding: '5px 8px', border: `1px solid ${C.grd}` }}>
                <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: '#9A4060', letterSpacing: '.04em' }}>{l}</div>
                <div style={{ fontFamily: FONT, fontSize: SIZE.lg, color: C.txt, fontWeight: 'bold', marginTop: 1 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* ── Optional date fields ──────────────────────────── */}
          <div style={{
            borderTop: `1px solid ${C.grd}`, paddingTop: 10, marginBottom: 10,
          }}>
            <div style={{
              fontFamily: FONT, fontSize: SIZE.xs, color: '#9A4060',
              letterSpacing: '.04em', marginBottom: 8,
            }}>
              LOG DATES FOR THIS CYCLE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px', marginBottom: 8 }}>
              <div>
                <Label style={{ color: '#9A4060' }}>period end date</Label>
                <Inp type="date" value={periodEndDate}
                  max={TODAY}
                  min={activeCycle.start_date}
                  onChange={e => setPeriodEndDate(e.target.value)}
                  style={{ borderColor: C.grd }} />
              </div>
              <div>
                <Label style={{ color: '#9A4060' }}>ovulation date</Label>
                <Inp type="date" value={ovulationDate}
                  max={TODAY}
                  min={activeCycle.start_date}
                  onChange={e => setOvulationDate(e.target.value)}
                  style={{ borderColor: C.grd }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <PixelBtn onClick={handleSaveDates} disabled={savingDates} color={C.ok}
                style={{ padding: '3px 14px' }}>
                {savingDates ? 'SAVING…' : '▶ SAVE DATES'}
              </PixelBtn>
            </div>
          </div>

          {/* ── Mark cycle complete ───────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${C.grd}`, paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Label style={{ color: '#9A4060' }}>cycle end date (first day of next period)</Label>
                <Inp type="date" value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{ borderColor: C.frame }} />
              </div>
              <PixelBtn onClick={handleComplete} disabled={completing}
                color={C.frame} style={{ minWidth: 160, padding: '4px 16px', fontWeight: 'bold' }}>
                {completing ? 'SAVING…' : '■ MARK COMPLETE'}
              </PixelBtn>
            </div>
          </div>
        </div>
      ) : (
        /* No active cycle — show Start button */
        <div style={{
          border: `1px dashed ${C.frame}`, padding: '12px',
          marginBottom: 12, textAlign: 'center',
        }}>
          <div style={{ fontFamily: FONT, fontSize: SIZE.md, color: C.mut, marginBottom: 8 }}>
            NO ACTIVE CYCLE
          </div>
          {!showStart ? (
            <PixelBtn onClick={() => setShowStart(true)} color={C.ok} style={{ minWidth: 140 }}>
              + START NEW CYCLE
            </PixelBtn>
          ) : (
            <div style={{ textAlign: 'left', maxWidth: 380, margin: '0 auto' }}>
              <GroupBox title="NEW CYCLE">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px' }}>
                  <div>
                    <Label>cycle start date</Label>
                    <Inp type="date" value={startForm.start_date}
                      onChange={e => setStartForm(p => ({ ...p, start_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>period start</Label>
                    <Inp type="date" value={startForm.period_start}
                      onChange={e => setStartForm(p => ({ ...p, period_start: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                  <PixelBtn onClick={() => setShowStart(false)} color={C.mut}>CANCEL</PixelBtn>
                  <PixelBtn onClick={handleStartCycle} color={C.ok} disabled={starting}>
                    {starting ? 'STARTING…' : '▶ START'}
                  </PixelBtn>
                </div>
              </GroupBox>
            </div>
          )}
        </div>
      )}

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
        <StatCard label="COMPLETED" value={completed.length} unit="cycles" />
        <StatCard label="MEAN LENGTH" value={meanLength} unit="days" />
        <StatCard label="TOTAL LOGGED" value={cycles.length} unit="cycles" />
        <StatCard label="MODEL PHASE"
          value={completed.length < 3 ? 'COLD' : completed.length < 8 ? 'BAYES' : 'LSTM'}
          unit={completed.length < 3 ? 'START' : completed.length < 8 ? 'IAN' : ''} />
      </div>

      <PhaseProgress completed={completed.length} />

      {/* ── Cycles table ──────────────────────────────────────────── */}
      <div style={{ boxShadow: SUNKEN, border: `1px solid ${C.grd}`, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#','START','END','LENGTH','PERIOD','OVULATION','LUTEAL','STATUS'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? <LoadingRow cols={8} />
              : cycles.length === 0
                ? <EmptyRow cols={8} msg="NO CYCLES YET" />
                : cycles.map((c, i) => (
                    <tr key={c.id} style={{ background: i % 2 === 0 ? C.r1 : C.r2 }}>
                      <td style={TD}>{c.cycle_number}</td>
                      <td style={TD}>{c.start_date}</td>
                      <td style={TD}>{c.end_date || '—'}</td>
                      <td style={{ ...TD, color: C.sage, fontWeight: 'bold' }}>
                        {c.cycle_length ? `${c.cycle_length}d` : 'ongoing'}
                      </td>
                      <td style={TD}>{c.period_duration ? `${c.period_duration}d` : '—'}</td>
                      <td style={TD}>{c.ovulation_date || '—'}</td>
                      <td style={TD}>{c.luteal_length ? `${c.luteal_length}d` : '—'}</td>
                      <td style={TD}>
                        <span style={{
                          fontFamily: FONT, fontSize: SIZE.xs, padding: '1px 5px',
                          background: c.is_complete ? '#C4E8D0' : '#F090A8',
                          color:      c.is_complete ? '#10562A' : '#3A0018',
                          border: `1px solid ${c.is_complete ? '#10562A44' : '#B5664A44'}`,
                        }}>
                          {c.is_complete ? 'COMPLETE' : 'ACTIVE ●'}
                        </span>
                      </td>
                    </tr>
                  ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}