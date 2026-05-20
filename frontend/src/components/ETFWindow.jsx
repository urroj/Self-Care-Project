// components/ETFWindow.jsx — Islamic ETF tracker with investment tracking

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { api } from '../api.js'
import { C, FONT, RAISED, SUNKEN, SIZE } from '../theme.js'

const TODAY = new Date().toISOString().slice(0, 10)

const ETFS = [
  { symbol: 'ISWD.SW', name: 'MSCI World Islamic',  subname: 'iShares — USD (Dist)', color: '#C4506A', altColor: '#E87090' },
  { symbol: 'IGDA.L',  name: 'Islamic Global Dev.', subname: 'Invesco — USD (Acc)',  color: '#5A8E72', altColor: '#82ABA1' },
]
const RANGES = [
  { key: '1wk', label: '1W' },
  { key: '1mo', label: '1M' },
  { key: '1y',  label: '1Y' },
]

// ── Custom tooltip ──────────────────────────────────────────────────────────
function PixelTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(255,245,248,0.96)', border: `2px solid ${C.frame}`,
      boxShadow: `2px 2px 0 ${C.sh}`, padding: '6px 10px', fontFamily: FONT,
    }}>
      <div style={{ fontSize: 7, color: C.mut, marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ fontSize: 8, color: p.color, fontWeight: 'bold' }}>
          {p.name}: {currency} {Number(p.value).toFixed(2)}
        </div>
      ))}
    </div>
  )
}

// ── Investment panel ─────────────────────────────────────────────────────────
function InvestmentPanel({ etf, currentPrice, currency , priceData = [] }) {
  const [investments, setInvestments]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [adding, setAdding]             = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [amount, setAmount]             = useState('')
  const [invDate, setInvDate]           = useState(TODAY)
  const [notes, setNotes]               = useState('')
  const [notif, setNotif]               = useState(null)
  const notifTimer                      = useRef(null)

  const notify = (type, msg) => {
    clearTimeout(notifTimer.current)
    setNotif({ type, msg })
    notifTimer.current = setTimeout(() => setNotif(null), type === 'err' ? 7000 : 2500)
  }

  const loadInvestments = () => {
    setLoading(true)
    api.getETFInvestments(etf.symbol)
      .then(data => { setInvestments(data); setLoading(false) })
      .catch(e => { notify('err', e.message || 'LOAD FAILED'); setLoading(false) })
  }

  useEffect(() => { loadInvestments() }, [etf.symbol])

  const handleAdd = async () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      notify('err', 'ENTER A VALID AMOUNT')
      return
    }
    if (!invDate) { notify('err', 'SELECT AN INVESTMENT DATE'); return }
    setAdding(true)
    try {
      const result = await api.addETFInvestment({
        symbol:          etf.symbol,
        amount:          parseFloat(amount),
        investment_date: invDate,
        notes,
      })
      notify('ok', `ADDED · ${result.units?.toFixed(4) ?? '?'} UNITS @ ${currency} ${result.price_on_date}`)
      setAmount(''); setNotes(''); setInvDate(TODAY); setShowForm(false)
      loadInvestments()
    } catch (e) {
      notify('err', e.message || 'FAILED TO ADD INVESTMENT')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteETFInvestment(id)
      setInvestments(prev => prev.filter(i => i.id !== id))
      notify('ok', 'ENTRY REMOVED')
    } catch (e) {
      notify('err', e.message || 'DELETE FAILED')
    }
  }

  // ── Portfolio calculations ────────────────────────────────────────────────
  const totalInvested  = investments.reduce((s, i) => s + (i.amount || 0), 0)
  const totalUnits     = investments.reduce((s, i) => s + (i.units || 0), 0)
  const currentValue   = currentPrice ? totalUnits * currentPrice : null
  const gainLoss       = currentValue != null ? currentValue - totalInvested : null
  const gainLossPct    = totalInvested > 0 && gainLoss != null
                           ? (gainLoss / totalInvested) * 100 : null
  const isUp           = gainLoss != null && gainLoss >= 0

  const fmt = (n, decimals = 2) =>
    n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—'

  return (
    <div style={{
      borderTop: `1px solid ${C.grd}`,
      background: 'rgba(255,248,251,0.6)',
    }}>
      {/* Section header */}
      <div style={{
        padding: '6px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: etf.color, letterSpacing: '.04em' }}>
          MY INVESTMENTS · {etf.symbol}
        </div>
        <button onClick={() => setShowForm(f => !f)} style={{
          fontFamily: FONT, fontSize: 7, color: showForm ? C.err : C.ok,
          background: C.face, border: 'none', boxShadow: RAISED,
          padding: '2px 10px', cursor: 'pointer',
        }}>
          {showForm ? '✕ CANCEL' : '+ ADD'}
        </button>
      </div>

      {/* Notification */}
      {notif && (
        <div style={{
          margin: '0 10px 6px', padding: '5px 8px',
          background: notif.type === 'ok' ? '#C8E8D4' : '#FFB8C8',
          border: `1px solid ${notif.type === 'ok' ? C.ok : C.err}`,
          fontFamily: FONT, fontSize: 7,
          color: notif.type === 'ok' ? C.ok : C.err,
          wordBreak: 'break-all', lineHeight: 1.8,
        }}>
          {notif.type === 'ok' ? '✓ ' : '✗ '}{notif.msg}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div style={{
          margin: '0 10px 8px',
          padding: '8px 10px',
          background: C.r1, border: `1px solid ${C.grd}`,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px', marginBottom: 6 }}>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut, marginBottom: 3 }}>
                AMOUNT ({currency})
              </div>
              <input
                type="number" step="0.01" min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 1000.00"
                style={{
                  fontFamily: FONT, fontSize: 8, color: C.txt,
                  background: C.inp, border: `1px solid ${C.grd}`,
                  boxShadow: SUNKEN, padding: '3px 6px',
                  width: '100%', outline: 'none',
                }}
              />
            </div>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut, marginBottom: 3 }}>
                PURCHASE DATE
              </div>
              <input
                type="date"
                value={invDate}
                max={TODAY}
                onChange={e => setInvDate(e.target.value)}
                style={{
                  fontFamily: FONT, fontSize: 8, color: C.txt,
                  background: C.inp, border: `1px solid ${C.grd}`,
                  boxShadow: SUNKEN, padding: '3px 6px',
                  width: '100%', outline: 'none',
                }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut, marginBottom: 3 }}>
              NOTES (optional)
            </div>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. monthly DCA"
              style={{
                fontFamily: FONT, fontSize: 8, color: C.txt,
                background: C.inp, border: `1px solid ${C.grd}`,
                boxShadow: SUNKEN, padding: '3px 6px',
                width: '100%', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, alignSelf: 'center' }}>
              Price fetched automatically from Yahoo Finance
            </div>
            <button onClick={handleAdd} disabled={adding} style={{
              fontFamily: FONT, fontSize: 8, color: adding ? C.mut : C.ok,
              background: C.face, border: 'none',
              boxShadow: adding ? SUNKEN : RAISED,
              padding: '4px 16px', cursor: adding ? 'default' : 'pointer',
            }}>
              {adding ? 'FETCHING PRICE…' : '▶ SAVE'}
            </button>
          </div>
        </div>
      )}

      {/* Portfolio summary */}
      {investments.length > 0 && (
        <div style={{
          margin: '0 10px 8px',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
        }}>
          {[
            { label: 'TOTAL INVESTED',  val: `${currency} ${fmt(totalInvested)}`,                         color: C.txt  },
            { label: 'CURRENT VALUE',   val: currentValue != null ? `${currency} ${fmt(currentValue)}` : '—', color: C.txt  },
            { label: 'GAIN / LOSS',     val: gainLoss != null ? `${currency} ${fmt(Math.abs(gainLoss))} ${isUp ? '▲' : '▼'}` : '—', color: isUp ? C.ok : C.err },
            { label: 'RETURN %',        val: gainLossPct != null ? `${isUp ? '+' : ''}${fmt(gainLossPct)}%` : '—', color: isUp ? C.ok : C.err },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              background: C.r1, border: `1px solid ${C.grd}`,
              padding: '5px 6px', boxShadow: SUNKEN,
            }}>
              <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>{label}</div>
              <div style={{ fontFamily: FONT, fontSize: 8, color, fontWeight: 'bold', marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Invested vs Current value over time */}
            {/* Invested vs Current value over time */}
      {investments.length > 0 && priceData.length > 0 && (() => {
        const sorted = [...investments].sort((a, b) =>
          new Date(a.investment_date) - new Date(b.investment_date)
        )
        const firstDate = sorted[0].investment_date

        const chartData = priceData
          .filter(p => p.date.slice(0, 10) >= firstDate)
          .map(p => {
            const dateStr = p.date.slice(0, 10)
            let cumInvested = 0, cumUnits = 0
            sorted.forEach(inv => {
              if (inv.investment_date <= dateStr) {
                cumInvested += inv.amount || 0
                cumUnits    += inv.units  || 0
              }
            })
            return {
              date:     p.date,
              invested: parseFloat(cumInvested.toFixed(2)),
              current:  parseFloat((cumUnits * p.close).toFixed(2)),
            }
          })

        if (!chartData.length) return null

        const last        = chartData[chartData.length - 1]
        const isProfit    = last.current >= last.invested
        const profitColor = isProfit ? C.ok : C.err

        const tickCount = 6
        const ticks = chartData
          .filter((_, i, arr) => i % Math.ceil(arr.length / tickCount) === 0)
          .map(d => d.date)

        const formatX = val => {
          try {
            const d = new Date(val)
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          } catch { return val }
        }

        return (
          <div style={{ margin: '0 10px 10px', padding: '8px 10px', background: C.r1, border: `1px solid ${C.grd}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut, letterSpacing: '.04em' }}>
                INVESTED VS CURRENT VALUE
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>▬ INVESTED</span>
                <span style={{ fontFamily: FONT, fontSize: 6, color: profitColor }}>▬ CURRENT</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke={C.grd} opacity={0.5} />
                <XAxis
                  dataKey="date"
                  ticks={ticks}
                  tickFormatter={formatX}
                  tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }}
                  tickLine={false}
                  axisLine={{ stroke: C.grd }}
                />
                <YAxis
                  tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={v => Number(v).toFixed(0)}
                />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div style={{
                      background: 'rgba(255,245,248,0.96)', border: `2px solid ${C.frame}`,
                      boxShadow: `2px 2px 0 ${C.sh}`, padding: '6px 10px', fontFamily: FONT,
                    }}>
                      <div style={{ fontSize: 7, color: C.mut, marginBottom: 4 }}>{label}</div>
                      {payload.map(p => (
                        <div key={p.dataKey} style={{ fontSize: 8, color: p.color }}>
                          {p.name}: {currency} {Number(p.value).toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )
                }} />
                <Line type="stepAfter" dataKey="invested" name="INVESTED"
                  stroke={C.mut} strokeWidth={1.5} dot={false} isAnimationActive={false}
                />
                <Line type="monotone" dataKey="current" name="CURRENT"
                  stroke={profitColor} strokeWidth={1.5} dot={false} isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* Investment table */}
      {loading && (
        <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut, padding: '8px 12px' }}>
          LOADING…
        </div>
      )}

      {!loading && investments.length === 0 && (
        <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut, padding: '6px 12px 10px', fontStyle: 'italic' }}>
          NO INVESTMENTS RECORDED YET · CLICK + ADD TO GET STARTED
        </div>
      )}

      {!loading && investments.length > 0 && (
        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
            <thead>
              <tr style={{ background: C.bar }}>
                {['DATE', 'INVESTED', 'PRICE PAID', 'UNITS', 'CURRENT VAL', 'GAIN/LOSS', ''].map(h => (
                  <th key={h} style={{
                    fontFamily: FONT, fontSize: 6, color: C.barT,
                    padding: '4px 6px', textAlign: 'left', fontWeight: 'normal',
                    borderRight: '1px solid rgba(255,255,255,0.15)',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {investments.map((inv, i) => {
                const currVal = currentPrice && inv.units ? inv.units * currentPrice : null
                const gl      = currVal != null ? currVal - inv.amount : null
                const up      = gl != null && gl >= 0
                return (
                  <tr key={inv.id} style={{ background: i % 2 === 0 ? C.r1 : C.r2 }}>
                    <td style={{ fontFamily: FONT, fontSize: 7, padding: '4px 6px', color: C.mut, whiteSpace: 'nowrap' }}>
                      {inv.investment_date}
                    </td>
                    <td style={{ fontFamily: FONT, fontSize: 7, padding: '4px 6px', color: C.txt, whiteSpace: 'nowrap' }}>
                      {currency} {fmt(inv.amount)}
                    </td>
                    <td style={{ fontFamily: FONT, fontSize: 7, padding: '4px 6px', color: C.txt, whiteSpace: 'nowrap' }}>
                      {inv.price_on_date ? `${currency} ${fmt(inv.price_on_date)}` : '—'}
                    </td>
                    <td style={{ fontFamily: FONT, fontSize: 7, padding: '4px 6px', color: C.mut, whiteSpace: 'nowrap' }}>
                      {inv.units ? fmt(inv.units, 4) : '—'}
                    </td>
                    <td style={{ fontFamily: FONT, fontSize: 7, padding: '4px 6px', color: C.txt, whiteSpace: 'nowrap' }}>
                      {currVal != null ? `${currency} ${fmt(currVal)}` : '—'}
                    </td>
                    <td style={{
                      fontFamily: FONT, fontSize: 7, padding: '4px 6px',
                      color: gl != null ? (up ? C.ok : C.err) : C.mut,
                      fontWeight: 'bold', whiteSpace: 'nowrap',
                    }}>
                      {gl != null ? `${up ? '+' : '-'}${currency} ${fmt(Math.abs(gl))}` : '—'}
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <button
                        onClick={() => handleDelete(inv.id)}
                        title="Remove"
                        style={{
                          fontFamily: FONT, fontSize: 8, color: C.err,
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', padding: '0 2px', lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── ETF chart panel ──────────────────────────────────────────────────────────
function ETFPanel({ etf, range, showInvestments }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    api.getETF(etf.symbol, range)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [etf.symbol, range])

  const prices    = data?.data?.map(d => d.close).filter(Boolean) ?? []
  const current   = data?.current   ?? prices[prices.length - 1] ?? 0
  const prevClose = data?.prev_close ?? prices[0] ?? 0
  const change    = current - prevClose
  const changePct = prevClose ? (change / prevClose) * 100 : 0
  const isUp      = change >= 0
  const rangeHigh = prices.length ? Math.max(...prices) : 0
  const rangeLow  = prices.length ? Math.min(...prices) : 0

  const formatX = (val) => {
    if (!val) return ''
    try {
      const d = new Date(val)
      if (range === '1wk') return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      if (range === '1mo') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    } catch { return val }
  }

  const tickCount = range === '1y' ? 6 : 8
  const ticks = data?.data?.length
    ? data.data.filter((_, i, arr) => i % Math.ceil(arr.length / tickCount) === 0).map(d => d.date)
    : []
  const yMin = rangeLow  ? rangeLow  * 0.998 : 'auto'
  const yMax = rangeHigh ? rangeHigh * 1.002 : 'auto'

  return (
    <div style={{ background: C.r1, border: `1px solid ${C.grd}`, marginBottom: 10, boxShadow: `inset -1px -1px 0 ${C.hi}` }}>
      {/* Header */}
      <div style={{ padding: '8px 12px 6px', borderBottom: `1px solid ${C.grd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: FONT, fontSize: SIZE.sm, color: etf.color, letterSpacing: '.04em', marginBottom: 2 }}>{etf.name}</div>
          <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut }}>{etf.symbol} · {etf.subname}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: FONT, fontSize: SIZE.lg, color: C.txt, fontWeight: 'bold', lineHeight: 1.2 }}>
            {current ? `${data?.currency ?? ''} ${current.toFixed(2)}` : '—'}
          </div>
          <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: isUp ? C.ok : C.err, marginTop: 2 }}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct.toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: '8px 4px 4px' }}>
        {loading && <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>LOADING {etf.symbol}…</div>}
        {error   && <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, fontFamily: FONT, fontSize: 7, color: C.err, padding: '0 12px', textAlign: 'center' }}><div>✗ LOAD FAILED</div><div style={{ color: C.mut, fontSize: 6 }}>{error}</div></div>}
        {!loading && !error && data?.data?.length > 0 && (
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={data.data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={C.grd} opacity={0.6} />
              <XAxis dataKey="date" ticks={ticks} tickFormatter={formatX} tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }} axisLine={{ stroke: C.grd }} tickLine={false} />
              <YAxis domain={[yMin, yMax]} tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }} axisLine={false} tickLine={false} width={46} tickFormatter={v => v.toFixed(1)} />
              <Tooltip content={<PixelTooltip currency={data.currency} />} />
              {prevClose > 0 && <ReferenceLine y={prevClose} stroke={C.mut} strokeDasharray="3 2" strokeOpacity={0.5} />}
              <Line type="monotone" dataKey="close" name={etf.symbol} stroke={etf.color} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: etf.color, stroke: C.frame, strokeWidth: 1 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {!loading && !error && data?.data?.length === 0 && <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>NO DATA FOR {range.toUpperCase()} RANGE</div>}
      </div>

      {/* Stats footer */}
      {!loading && !error && prices.length > 0 && (
        <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 16, borderTop: `1px solid ${C.grd}` }}>
          {[['RANGE HIGH', rangeHigh.toFixed(2)], ['RANGE LOW', rangeLow.toFixed(2)], ['EXCHANGE', data?.exchange ?? '—']].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>{l}</div>
              <div style={{ fontFamily: FONT, fontSize: 8, color: C.txt, marginTop: 1 }}>{v}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>UNITS</div>
            <div style={{ fontFamily: FONT, fontSize: 8, color: C.txt, marginTop: 1 }}>{data.data.length}</div>
          </div>
        </div>
      )}

      {/* Investment sub-panel */}
      {showInvestments && (
        <InvestmentPanel etf={etf} currentPrice={current} currency={data?.currency ?? ''} priceData={data?.data ?? []} />
      )}
    </div>
  )
}

// ── ETFWindow ────────────────────────────────────────────────────────────────
export default function ETFWindow({ onTitleDown, onFocus, embedded = false }) {
  const [range, setRange]               = useState('1mo')
  const [tick, setTick]                 = useState(0)
  const [showInvestments, setShowInv]   = useState(true)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const refresh = () => setTick(t => t + 1)

  return (
    <div onMouseDown={embedded ? undefined : onFocus} style={embedded ? {} : undefined}>
      {/* Title bar */}
      <div onMouseDown={onTitleDown} style={{
        background: C.bar, padding: '3px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        userSelect: 'none', cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
            <rect x="1" y="11" width="3" height="4" fill="white" opacity="0.9"/>
            <rect x="5" y="7"  width="3" height="8" fill="white" opacity="0.9"/>
            <rect x="9" y="9"  width="3" height="6" fill="white" opacity="0.9"/>
            <rect x="13" y="4" width="3" height="11" fill="white" opacity="0.9"/>
            <polyline points="2,10 6,6 10,8 14,3" fill="none" stroke="white" strokeWidth="1.5" opacity="0.7"/>
          </svg>
          <span style={{ fontFamily: FONT, fontSize: SIZE.sm, color: C.barT, letterSpacing: '.08em' }}>
            ETF TRACKER
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Portfolio toggle */}
          <button onClick={() => setShowInv(s => !s)} style={{
            fontFamily: FONT, fontSize: 7,
            color: showInvestments ? C.barT : C.mut,
            background: showInvestments ? C.frame : C.face,
            border: 'none', boxShadow: showInvestments ? SUNKEN : RAISED,
            padding: '2px 7px', cursor: 'pointer',
          }}>
            {showInvestments ? '★ PORTFOLIO' : '☆ PORTFOLIO'}
          </button>

          {/* Range buttons */}
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{
              fontFamily: FONT, fontSize: 7,
              color: range === r.key ? C.barT : C.mut,
              background: range === r.key ? C.frame : C.face,
              border: 'none', boxShadow: range === r.key ? SUNKEN : RAISED,
              padding: '2px 7px', cursor: 'pointer',
            }}>
              {r.label}
            </button>
          ))}

          <button onClick={refresh} title="Refresh" style={{
            fontFamily: FONT, fontSize: 10, color: C.barT,
            background: 'transparent', border: 'none',
            cursor: 'pointer', padding: '0 4px', lineHeight: 1,
          }}>↻</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '10px 10px 4px', background: 'transparent', overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, marginBottom: 8, borderLeft: `2px solid ${C.grd}`, paddingLeft: 6 }}>
          DELAYED DATA · NOT FINANCIAL ADVICE · EDUCATIONAL ONLY
        </div>

        {ETFS.map(etf => (
          <ETFPanel key={etf.symbol + range + tick} etf={etf} range={range} showInvestments={showInvestments} />
        ))}

        <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, textAlign: 'right', paddingBottom: 4 }}>
          REFRESHED: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          {range === '1wk' ? ' · 1H BARS' : ' · 1D BARS'}
        </div>
      </div>
    </div>
  )
}