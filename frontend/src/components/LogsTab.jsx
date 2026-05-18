// components/LogsTab.jsx — scrollable daily logs table

import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { C, FONT, SUNKEN, TD, TH, SIZE } from '../theme.js'
import { LoadingRow, EmptyRow } from './Shared.jsx'

function FlowDot({ v }) {
  const colors = ['', '#FFB8C8','#F090A8','#E87090','#C4506A','#7A1A38']
  return v != null
    ? <span style={{ color: v > 3 ? C.err : C.txt }}>{v}</span>
    : <span style={{ color: C.mut }}>—</span>
}

function Check({ v }) {
  return <span style={{ color: v ? C.err : C.mut, textAlign: 'center', display: 'block' }}>{v ? '✓' : '—'}</span>
}

export default function LogsTab({ refreshKey }) {
  const [logs, setLogs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    api.getLogs(300)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [refreshKey])

  const filtered = filter
    ? logs.filter(l =>
        String(l.cycle_number).includes(filter) ||
        String(l.log_date).includes(filter) ||
        (l.mucus_type || '').includes(filter) ||
        (l.moods || []).join(',').includes(filter)
      )
    : logs

  return (
    <div style={{ padding: '10px 12px' }}>
      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 8,
      }}>
        <input
          type="text"
          placeholder="filter by date, cycle, mood…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            fontFamily: FONT, fontSize: SIZE.md, color: C.txt,
            background: C.inp, border: `1px solid ${C.grd}`,
            boxShadow: `inset 1px 1px 0 ${C.sh}`,
            padding: '2px 6px', width: 220, outline: 'none',
          }}
        />
        {filter && (
          <button onClick={() => setFilter('')} style={{
            fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
            background: C.face, border: 'none',
            boxShadow: `inset -1px -1px 0 ${C.sh}, inset 1px 1px 0 ${C.hi}`,
            padding: '2px 8px', cursor: 'pointer',
          }}>
            CLEAR
          </button>
        )}
        <span style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut, marginLeft: 'auto' }}>
          {filtered.length} / {logs.length} records
        </span>
      </div>

      {/* Table */}
      <div style={{
        boxShadow: SUNKEN, border: `1px solid ${C.grd}`,
        maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', overflowX: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr>
              {['CYC','DATE','DAY','FLOW','MUCUS','MOODS','CR','FAT','BL','HA','SLEEP','STRESS','KG'].map(h => (
                <th key={h} style={{ ...TH }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? <LoadingRow cols={13} />
              : filtered.length === 0
                ? <EmptyRow cols={13} msg="NO LOGS YET — START LOGGING IN THE LOG TODAY TAB" />
                : filtered.map((l, i) => (
                    <tr key={l.id || i} style={{ background: i % 2 === 0 ? C.r1 : C.r2 }}>
                      <td style={{ ...TD, color: C.sage }}>#{l.cycle_number}</td>
                      <td style={TD}>{l.log_date}</td>
                      <td style={{ ...TD, color: C.mut }}>d{l.day_of_cycle}</td>
                      <td style={TD}><FlowDot v={l.flow_intensity} /></td>
                      <td style={TD}>{l.mucus_type || '—'}</td>
                      <td style={{ ...TD, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(l.moods || []).join(', ') || '—'}
                      </td>
                      <td style={TD}><Check v={l.symptom_cramps} /></td>
                      <td style={TD}><Check v={l.symptom_fatigue} /></td>
                      <td style={TD}><Check v={l.symptom_bloating} /></td>
                      <td style={TD}><Check v={l.symptom_headache} /></td>
                      <td style={TD}>{l.sleep_hours || '—'}</td>
                      <td style={TD}>{l.stress_level || '—'}</td>
                      <td style={TD}>{l.weight_kg || '—'}</td>
                    </tr>
                  ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}