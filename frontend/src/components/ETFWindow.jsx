// components/ETFWindow.jsx — Islamic ETF tracker with investment tracking

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  ComposedChart, LineChart, Line, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { api } from '../api.js'
import { C, FONT, RAISED, SUNKEN, SIZE } from '../theme.js'

const TODAY = new Date().toISOString().slice(0, 10)

const PALETTE = [
  { color: '#C4506A', altColor: '#E87090' },
  { color: '#5A8E72', altColor: '#82ABA1' },
  { color: '#5A72A8', altColor: '#8296C8' },
  { color: '#A07840', altColor: '#C89858' },
]

const DEFAULT_ETFS = [
  { symbol: 'ISWD.SW', name: 'MSCI World Islamic',  subname: 'iShares — USD (Dist)', color: '#C4506A', altColor: '#E87090' },
  { symbol: 'IGDA.L',  name: 'Islamic Global Dev.', subname: 'Invesco — USD (Acc)',  color: '#5A8E72', altColor: '#82ABA1' },
]
const RANGES = [
  { key: '1wk', label: '1W' },
  { key: '1mo', label: '1M' },
  { key: '1y',  label: '1Y' },
]

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
        <Btn onClick={() => setShowForm(f => !f)} style={{
          fontFamily: FONT, fontSize: SIZE.xs, color: showForm ? C.err : C.ok,
          background: C.face, border: 'none', boxShadow: RAISED,
          padding: '3px 12px', borderRadius: '6px', cursor: 'pointer',
        }}>
          {showForm ? '✕ CANCEL' : '+ ADD'}
        </Btn>
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
            <Btn onClick={handleAdd} disabled={adding} style={{
              fontFamily: FONT, fontSize: SIZE.xs, color: adding ? C.mut : C.ok,
              background: C.face, border: 'none',
              boxShadow: adding ? SUNKEN : RAISED,
              padding: '4px 18px', borderRadius: '6px', cursor: adding ? 'default' : 'pointer',
            }}>
              {adding ? 'FETCHING PRICE…' : '▶ SAVE'}
            </Btn>
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
              padding: '5px 6px', boxShadow: SUNKEN,borderRadius: "5px"
            }}>
              <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>{label}</div>
              <div style={{ fontFamily: FONT, fontSize: 8, color, fontWeight: 'bold', marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

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
          <div style={{ margin: '0 10px 10px', padding: '8px 10px', background: C.r1, border: `1px solid ${C.grd}`, borderRadius: "5px" }}>
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
                      <Btn
                        onClick={() => handleDelete(inv.id)}
                        title="Remove"
                        style={{
                          fontFamily: FONT, fontSize: 9, color: C.err,
                          background: 'transparent', border: 'none',
                          padding: '2px 4px', lineHeight: 1, borderRadius: '6px', cursor: 'pointer',
                        }}
                      >
                        ✕
                      </Btn>
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
function ETFPanel({ etf, range, showInvestments, onRemove, isDefault = true }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const lastData              = useRef(null)

  useEffect(() => {
    setLoading(true); setError(null)
    api.getETF(etf.symbol, range)
      .then(d => { setData(d); lastData.current = d; setLoading(false) })
      .catch(e => {
        if (lastData.current) {
          setData(lastData.current)
          setError('OFFLINE — SHOWING LAST RETRIEVED DATA')
        } else {
          setError(e.message)
        }
        setLoading(false)
      })
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
    <div style={{ borderRadius: '8px', background: C.r1, border: `1px solid ${C.grd}`, marginBottom: 12, boxShadow: `0 4px 16px rgba(122,26,56,0.07)` }}>
      {/* Header */}
      <div style={{ padding: '8px 12px 6px', borderBottom: `1px solid ${C.grd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: FONT, fontSize: SIZE.sm, color: etf.color, letterSpacing: '.04em', marginBottom: 2 }}>{etf.name}</div>
          <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut }}>{etf.symbol} · {etf.subname}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: FONT, fontSize: SIZE.lg, color: C.txt, fontWeight: 'bold', lineHeight: 1.2 }}>
              {current ? `${data?.currency ?? ''} ${current.toFixed(2)}` : '—'}
            </div>
            <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: isUp ? C.ok : C.err, marginTop: 2 }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct.toFixed(2)}%)
            </div>
          </div>
          {!isDefault && onRemove && (
            <Btn onClick={() => onRemove(etf.symbol)} title="Remove ticker" style={{
              fontFamily: FONT, fontSize: 9, color: C.err,
              background: 'transparent', border: 'none',
              padding: '2px 4px', lineHeight: 1, borderRadius: '4px', cursor: 'pointer',
            }}>✕</Btn>
          )}
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: '8px 4px 4px' }}>
        {loading && <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>LOADING {etf.symbol}…</div>}
        {error && !lastData.current && <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, fontFamily: FONT, fontSize: 7, color: C.err, padding: '0 12px', textAlign: 'center' }}><div>✗ LOAD FAILED</div><div style={{ color: C.mut, fontSize: 6 }}>{error}</div></div>}
        {error && lastData.current && (
          <div style={{ margin: '0 4px 4px', padding: '4px 8px', background: '#FFF8C0', border: '1px solid #C8A000', fontFamily: FONT, fontSize: 6, color: '#7A6000' }}>
            ⚠ {error}
          </div>
        )}
        {!loading && data?.data?.length > 0 && (
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
        {!loading && !error && !lastData.current && data?.data?.length === 0 && <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>NO DATA FOR {range.toUpperCase()} RANGE</div>}
      </div>

      {/* Stats footer */}
      {!loading && prices.length > 0 && (
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

// ── Forecast panel ───────────────────────────────────────────────────────────
const FC_HORIZONS = [
  { key: '1y',  label: '1Y',  desc: 'next 12 months' },
  { key: '5y',  label: '5Y',  desc: 'next 5 years'   },
  { key: '10y', label: '10Y', desc: 'next 10 years'  },
]

function ForecastPanel({ etf, horizon }) {
  const [forecast, setForecast] = useState(undefined)   // undefined=loading, null=missing, obj=ok
  const [running, setRunning]   = useState(false)
  const [runErr, setRunErr]     = useState(null)
  const [subtab, setSubtab]     = useState('chart')     // 'chart' | 'model'

  const load = () => {
    setForecast(undefined)
    api.getETFForecast(etf.symbol, horizon)
      .then(d => setForecast(d))
      .catch(() => setForecast(null))
  }

  useEffect(() => { load() }, [etf.symbol, horizon])

  const handleRun = async () => {
    setRunning(true); setRunErr(null)
    try {
      const d = await api.runETFForecast(etf.symbol, horizon)
      setForecast(d)
    } catch (e) {
      setRunErr(e.message || 'MODEL RUN FAILED')
    } finally {
      setRunning(false)
    }
  }

  // Build merged chart data: history tail + forecast with CI band
  const chartData = useMemo(() => {
    if (!forecast) return []
    const hist = (forecast.history_dates || []).map((d, i) => ({
      date:        d,
      close:       forecast.history_values[i] ?? null,
      forecast:    null,
      band_lower:  null,
      band_height: null,
    }))
    const fc = (forecast.forecast_dates || []).map((d, i) => ({
      date:        d,
      close:       null,
      forecast:    forecast.forecast_values[i] ?? null,
      band_lower:  forecast.conf_lower[i]  ?? null,
      band_height: forecast.conf_upper[i] != null && forecast.conf_lower[i] != null
                     ? Math.max(0, forecast.conf_upper[i] - forecast.conf_lower[i])
                     : null,
    }))
    return [...hist, ...fc]
  }, [forecast])

  const formatXAxis = (val) => {
    if (!val) return ''
    try {
      const d = new Date(val)
      if (horizon === '1y') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      if (horizon === '5y') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    } catch { return val }
  }

  const tickCount = horizon === '10y' ? 6 : 8
  const ticks = chartData.length
    ? chartData.filter((_, i, a) => i % Math.ceil(a.length / tickCount) === 0).map(d => d.date)
    : []

  const allVals = chartData.flatMap(d => [d.close, d.forecast, d.band_lower,
    d.band_height != null && d.band_lower != null ? d.band_lower + d.band_height : null,
  ].filter(v => v != null))
  const yMin = allVals.length ? Math.min(...allVals) * 0.995 : 'auto'
  const yMax = allVals.length ? Math.max(...allVals) * 1.005 : 'auto'

  const currency = forecast?.currency ?? ''
  const runAt    = forecast?.run_at ?? null

  // ── Chart tab ───────────────────────────────────────────────────────────────
  const chartView = (
    <>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 6, paddingLeft: 2 }}>
        <span style={{ fontFamily: FONT, fontSize: 6, color: etf.color }}>▬ PRICE</span>
        <span style={{ fontFamily: FONT, fontSize: 6, color: etf.color, opacity: 0.7 }}>
          ╌╌ FORECAST
        </span>
        <span style={{ fontFamily: FONT, fontSize: 6, color: etf.color, opacity: 0.4 }}>
          ▓ 95% CONF.
        </span>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 2" stroke={C.grd} opacity={0.5} />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={formatXAxis}
            tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }}
            axisLine={{ stroke: C.grd }}
            tickLine={false}
          />
          <YAxis
            domain={[yMin, yMax]}
            allowDataOverflow={true}
            tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }}
            axisLine={false}
            tickLine={false}
            width={46}
            tickFormatter={v => v.toFixed(1)}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const vals = payload.filter(p => p.value != null && p.name !== 'band_lower')
              if (!vals.length) return null
              return (
                <div style={{
                  background: 'rgba(255,245,248,0.96)', border: `2px solid ${C.frame}`,
                  padding: '6px 10px', fontFamily: FONT,
                }}>
                  <div style={{ fontSize: 7, color: C.mut, marginBottom: 4 }}>{label}</div>
                  {vals.map(p => (
                    <div key={p.dataKey} style={{ fontSize: 8, color: p.color || etf.color }}>
                      {p.name}: {currency} {Number(p.value).toFixed(2)}
                    </div>
                  ))}
                </div>
              )
            }}
          />
          {/* CI band: stacked areas from lower to lower+height */}
          <Area
            type="monotone" dataKey="band_lower" stackId="ci"
            fill="transparent" stroke="none" fillOpacity={0}
            isAnimationActive={false} legendType="none" name=""
          />
          <Area
            type="monotone" dataKey="band_height" stackId="ci"
            fill={etf.color} fillOpacity={0.13} stroke="none"
            isAnimationActive={false} legendType="none" name="95% CI"
          />
          {/* Historical price line */}
          <Line
            type="monotone" dataKey="close" name="PRICE"
            stroke={etf.color} strokeWidth={1.5}
            dot={false} isAnimationActive={false}
            connectNulls={false}
          />
          {/* Forecast dashed line */}
          <Line
            type="monotone" dataKey="forecast" name="FORECAST"
            stroke={etf.color} strokeWidth={1.5} strokeDasharray="6 4"
            dot={false} isAnimationActive={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {runAt && (
        <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, textAlign: 'right', marginTop: 4 }}>
          model run: {runAt}
        </div>
      )}
    </>
  )

  // ── Model tab ───────────────────────────────────────────────────────────────
  const modelView = forecast ? (
    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
      {/* Model name */}
      <div style={{
        fontFamily: FONT, fontSize: SIZE.xs, color: etf.color,
        marginBottom: 6, letterSpacing: '.03em',
      }}>
        {forecast.model_name}
      </div>

      {/* Rationale */}
      <div style={{
        fontFamily: FONT, fontSize: 7, color: C.txt,
        lineHeight: 1.9, marginBottom: 10,
        background: C.r1, border: `1px solid ${C.grd}`,
        padding: '6px 8px', borderRadius: 4,
      }}>
        {forecast.model_rationale}
      </div>

      {/* Metrics */}
      {forecast.metrics && Object.keys(forecast.metrics).length > 0 && (
        <>
          <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut, marginBottom: 5 }}>
            MODEL METRICS
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4, marginBottom: 10,
          }}>
            {Object.entries(forecast.metrics).map(([k, v]) => (
              <div key={k} style={{
                background: C.r1, border: `1px solid ${C.grd}`,
                padding: '4px 6px', borderRadius: 4,
              }}>
                <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>{k.toUpperCase()}</div>
                <div style={{ fontFamily: FONT, fontSize: 8, color: C.txt, fontWeight: 'bold', marginTop: 1 }}>
                  {typeof v === 'number' ? v.toLocaleString() : String(v)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Feature importance */}
      {forecast.feature_importance && Object.keys(forecast.feature_importance).length > 0 && (
        <>
          <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut, marginBottom: 5 }}>
            FEATURES & DRIVERS
          </div>
          {Object.entries(forecast.feature_importance).map(([name, desc]) => (
            <div key={name} style={{ marginBottom: 6 }}>
              <div style={{ fontFamily: FONT, fontSize: 7, color: etf.color, fontWeight: 'bold' }}>
                {name}
              </div>
              <div style={{
                fontFamily: FONT, fontSize: 7, color: C.txt,
                lineHeight: 1.8, paddingLeft: 6,
              }}>
                {desc}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  ) : null

  // ── Panel render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      borderRadius: '8px', background: C.r1,
      border: `1px solid ${C.grd}`,
      marginBottom: 12,
      boxShadow: `0 4px 16px rgba(122,26,56,0.07)`,
    }}>
      {/* Panel header */}
      <div style={{
        padding: '8px 12px 6px',
        borderBottom: `1px solid ${C.grd}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontFamily: FONT, fontSize: SIZE.sm, color: etf.color, letterSpacing: '.04em', marginBottom: 2 }}>
            {etf.name}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut }}>{etf.symbol}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Sub-tabs */}
          {['chart', 'model'].map(t => (
            <Btn key={t} onClick={() => setSubtab(t)} style={{
              fontFamily: FONT, fontSize: SIZE.xs,
              color:      subtab === t ? C.barT : C.mut,
              background: subtab === t ? C.frame : C.face,
              border: 'none',
              boxShadow:  subtab === t ? SUNKEN : RAISED,
              padding: '2px 8px', borderRadius: '6px', cursor: 'pointer',
            }}>
              {t === 'chart' ? '~ CHART' : '◈ MODEL'}
            </Btn>
          ))}
          {/* Run / update model button */}
          <Btn onClick={handleRun} disabled={running} style={{
            fontFamily: FONT, fontSize: SIZE.xs,
            color:     running ? C.mut : C.ok,
            background: C.face, border: 'none',
            boxShadow:  running ? SUNKEN : RAISED,
            padding: '2px 10px', borderRadius: '6px',
            cursor: running ? 'default' : 'pointer',
          }}>
            {running ? '…' : forecast ? '↺ UPDATE' : '▶ RUN'}
          </Btn>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '8px 12px 10px' }}>
        {runErr && (
          <div style={{
            fontFamily: FONT, fontSize: 7, color: C.err,
            background: '#FFB8C8', border: `1px solid ${C.err}`,
            padding: '5px 8px', marginBottom: 8, borderRadius: 4,
            wordBreak: 'break-all', lineHeight: 1.8,
          }}>
            ✗ {runErr}
          </div>
        )}

        {forecast === undefined && (
          <div style={{ textAlign: 'center', padding: '24px 0', fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>
            LOADING…
          </div>
        )}

        {forecast === null && !running && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.mut, marginBottom: 8 }}>
              NO FORECAST YET
            </div>
            <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut }}>
              click ▶ RUN to build the model
            </div>
          </div>
        )}

        {forecast && subtab === 'chart' && chartView}
        {forecast && subtab === 'model' && modelView}
      </div>
    </div>
  )
}

// ── Forecast view (wraps both ETF panels with horizon selector) ───────────────
function ForecastView({ etfs }) {
  const [horizon, setHorizon] = useState('1y')

  return (
    <div>
      {/* Horizon selector */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 10,
        padding: '6px 10px',
        background: C.r1, border: `1px solid ${C.grd}`,
        borderRadius: 6, alignItems: 'center',
      }}>
        <span style={{ fontFamily: FONT, fontSize: 7, color: C.mut, marginRight: 4 }}>HORIZON</span>
        {FC_HORIZONS.map(h => (
          <Btn key={h.key} onClick={() => setHorizon(h.key)} style={{
            fontFamily: FONT, fontSize: SIZE.xs,
            color:      horizon === h.key ? C.barT : C.mut,
            background: horizon === h.key ? C.frame : C.face,
            border: 'none',
            boxShadow:  horizon === h.key ? SUNKEN : RAISED,
            padding: '3px 12px', borderRadius: '6px', cursor: 'pointer',
          }}>
            {h.label}
          </Btn>
        ))}
        <span style={{ fontFamily: FONT, fontSize: 7, color: C.mut, marginLeft: 4 }}>
          · {FC_HORIZONS.find(h => h.key === horizon)?.desc}
        </span>
      </div>

      {etfs.map(etf => (
        <ForecastPanel key={`${etf.symbol}-${horizon}`} etf={etf} horizon={horizon} />
      ))}

      <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, borderLeft: `2px solid ${C.grd}`, paddingLeft: 6, marginTop: 2 }}>
        FORECASTS ARE STATISTICAL ESTIMATES ONLY · NOT FINANCIAL ADVICE · EDUCATIONAL USE
      </div>
    </div>
  )
}

// ── ETFWindow ────────────────────────────────────────────────────────────────
export default function ETFWindow({ onTitleDown, onFocus, embedded = false }) {
  const [range, setRange]               = useState('1mo')
  const [tick, setTick]                 = useState(0)
  const [showInvestments, setShowInv]   = useState(true)
  const [mode, setMode]                 = useState('chart')  // 'chart' | 'forecast'
  const [etfs, setEtfs]                 = useState(() => {
    try { return JSON.parse(localStorage.getItem('etf_tickers') || 'null') || DEFAULT_ETFS }
    catch { return DEFAULT_ETFS }
  })
  const [showAddTicker, setShowAddTicker] = useState(false)
  const [newSymbol, setNewSymbol]         = useState('')
  const [newName, setNewName]             = useState('')
  const [newSubname, setNewSubname]       = useState('')
  const [tickerErr, setTickerErr]         = useState('')

  const handleAddTicker = () => {
    const sym = newSymbol.trim().toUpperCase()
    if (!sym) { setTickerErr('ENTER A SYMBOL'); return }
    if (etfs.find(e => e.symbol === sym)) { setTickerErr('TICKER ALREADY ADDED'); return }
    const palette = PALETTE[etfs.length % PALETTE.length]
    const next = [...etfs, { symbol: sym, name: newName.trim() || sym, subname: newSubname.trim() || '', ...palette }]
    setEtfs(next)
    localStorage.setItem('etf_tickers', JSON.stringify(next))
    setNewSymbol(''); setNewName(''); setNewSubname(''); setTickerErr(''); setShowAddTicker(false)
  }

  const handleRemoveTicker = (symbol) => {
    const next = etfs.filter(e => e.symbol !== symbol)
    setEtfs(next)
    localStorage.setItem('etf_tickers', JSON.stringify(next))
  }

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const refresh = () => setTick(t => t + 1)

  return (
    <div onMouseDown={embedded ? undefined : onFocus} style={embedded ? {} : undefined}>
      {/* Title bar */}
      <div onMouseDown={onTitleDown} style={{
        background: C.bar, padding: '6px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        userSelect: 'none', cursor: 'grab', borderTopLeftRadius: '10px', borderTopRightRadius: '10px',
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
          {/* Portfolio toggle (chart mode only) */}
          {mode === 'chart' && (
            <Btn onClick={() => setShowInv(s => !s)} style={{
              fontFamily: FONT, fontSize: SIZE.xs,
              color: showInvestments ? C.barT : C.mut,
              background: showInvestments ? C.frame : C.face,
              border: 'none', boxShadow: showInvestments ? SUNKEN : RAISED,
              padding: '3px 10px', borderRadius: '6px', cursor: 'pointer',
            }}>
            * PORTFOLIO
            </Btn>
          )}

          {/* Ticker toggle (chart mode only) */}
          {mode === 'chart' && (
            <Btn onClick={() => setShowAddTicker(s => !s)} style={{
              fontFamily: FONT, fontSize: SIZE.xs, color: showAddTicker ? C.err : C.mut,
              background: C.face, border: 'none', boxShadow: RAISED,
              padding: '3px 8px', borderRadius: '6px', 
            }}>
              {showAddTicker ? '✕' : '+ TICKER'}
            </Btn>
          )}

          {/* Mode toggle */}
          {mode === 'forecast' && (
              <Btn onClick={() => setMode('chart')} style={{
                fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
                background: C.face, border: 'none', boxShadow: RAISED,
                padding: '3px 10px', borderRadius: '6px'
              }}>
                ◄ BACK
              </Btn>
        )}
          <Btn onClick={() => setMode(m => m === 'chart' ? 'forecast' : 'chart')} style={{
            fontFamily: FONT, fontSize: SIZE.xs,
            color:      mode === 'forecast' ? C.barT : C.mut,
            background: mode === 'forecast' ? C.frame : C.face,
            border: 'none', boxShadow: mode === 'forecast' ? SUNKEN : RAISED,
            padding: '3px 10px', borderRadius: '6px', 
          }}>
            ~ FORECAST
          </Btn>
        </div>
      </div>

      {/* Range sub-bar (chart mode only) */}
      {mode === 'chart' && (
        <div style={{
        display: 'flex', gap: 6, margin: 10,
        padding: '6px 10px',
        background: C.r1, border: `1px solid ${C.grd}`,
        borderRadius: 6, alignItems: 'center',
        FONT: FONT, fontSize: 8, color: C.mut,
        }}>SELECT RANGE
          {RANGES.map(r => (
            <Btn key={r.key} onClick={() => setRange(r.key)} style={{
              fontFamily: FONT, fontSize: SIZE.xs,
              color: range === r.key ? C.barT : C.mut,
              background: range === r.key ? C.frame : C.face,
              border: 'none', boxShadow: range === r.key ? SUNKEN : RAISED,
              padding: '3px 10px', borderRadius: '6px',
            }}>
              {r.label}
            </Btn>
          ))}
          <Btn onClick={refresh} title="Refresh" style={{
            fontFamily: FONT, fontSize: 13, color: C.barT,
            background: C.frame, border: 'none',
            padding: '2px 6px', lineHeight: 1, borderRadius: '6px',
          }}>↻</Btn>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '10px 10px 4px', background: 'transparent', overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        {mode === 'chart' && (
          <>
            <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, marginBottom: 8, borderLeft: `2px solid ${C.grd}`, paddingLeft: 6 }}>
              DELAYED DATA · NOT FINANCIAL ADVICE · EDUCATIONAL ONLY
            </div>
            {showAddTicker && (
              <div style={{ marginBottom: 10, padding: '8px 10px', background: C.r1, border: `1px solid ${C.grd}`, borderRadius: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 8px', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, marginBottom: 3 }}>SYMBOL *</div>
                    <input value={newSymbol} onChange={e => setNewSymbol(e.target.value)}
                      placeholder="e.g. SPUS.L"
                      style={{ fontFamily: FONT, fontSize: 8, color: C.txt, background: C.inp,
                        border: `1px solid ${C.grd}`, padding: '3px 6px', width: '100%',
                        outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, marginBottom: 3 }}>NAME</div>
                    <input value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="e.g. SP 500 Shariah"
                      style={{ fontFamily: FONT, fontSize: 8, color: C.txt, background: C.inp,
                        border: `1px solid ${C.grd}`, padding: '3px 6px', width: '100%',
                        outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, marginBottom: 3 }}>SUBNAME</div>
                    <input value={newSubname} onChange={e => setNewSubname(e.target.value)}
                      placeholder="e.g. Wahed — USD"
                      style={{ fontFamily: FONT, fontSize: 8, color: C.txt, background: C.inp,
                        border: `1px solid ${C.grd}`, padding: '3px 6px', width: '100%',
                        outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                {tickerErr && <div style={{ fontFamily: FONT, fontSize: 6, color: C.err, marginBottom: 4 }}>✗ {tickerErr}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Btn onClick={handleAddTicker} style={{
                    fontFamily: FONT, fontSize: SIZE.xs, color: C.ok,
                    background: C.face, border: 'none', boxShadow: RAISED,
                    padding: '3px 14px', borderRadius: '6px', cursor: 'pointer',
                  }}>▶ ADD</Btn>
                </div>
              </div>
            )}
            {etfs.map(etf => (
              <ETFPanel
                key={etf.symbol + range + tick}
                etf={etf}
                range={range}
                showInvestments={showInvestments}
                isDefault={DEFAULT_ETFS.some(d => d.symbol === etf.symbol)}
                onRemove={handleRemoveTicker}
              />
            ))}
            <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, textAlign: 'right', paddingBottom: 4 }}>
              REFRESHED: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              {range === '1wk' ? ' · 1H BARS' : ' · 1D BARS'}
            </div>
          </>
        )}

        {mode === 'forecast' && (
            <ForecastView etfs={etfs} />
          )}
      </div>
    </div>
  )
}