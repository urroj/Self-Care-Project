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
          padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
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
              padding: '6px 14px', minHeight: 32, borderRadius: '6px', cursor: adding ? 'default' : 'pointer',
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
function ETFPanel({ etf, range, showInvestments, chartView = 'price', onRemove, isDefault = true }) {
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

  // ── Volatility view: per-bar % returns, mean, deviation from mean, std ──────
  const volSeries = useMemo(() => {
    const points = data?.data ?? []
    if (points.length < 2) return { rows: [], mean: 0, std: 0, annVol: 0 }
    const rets = []
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]?.close
      const cur  = points[i]?.close
      if (prev != null && prev > 0 && cur != null) {
        rets.push({ date: points[i].date, ret: ((cur - prev) / prev) * 100 })
      }
    }
    if (!rets.length) return { rows: [], mean: 0, std: 0, annVol: 0 }
    const mean = rets.reduce((s, x) => s + x.ret, 0) / rets.length
    const variance = rets.reduce((s, x) => s + (x.ret - mean) ** 2, 0) / rets.length
    const std = Math.sqrt(variance)
    // Annualisation: hourly (1wk view) ~ √(252×6.5), daily (1mo/1y) ~ √252
    const periodsPerYear = range === '1wk' ? 252 * 6.5 : 252
    const annVol = std * Math.sqrt(periodsPerYear)
    const rows = rets.map(r => ({
      date:      r.date,
      ret:       r.ret,
      deviation: r.ret - mean,
    }))
    return { rows, mean, std, annVol }
  }, [data, range])

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
        {!loading && data?.data?.length > 0 && chartView === 'price' && (
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
        {!loading && chartView === 'volatility' && volSeries.rows.length > 0 && (() => {
          const vRows = volSeries.rows
          const maxAbs = Math.max(
            ...vRows.map(r => Math.abs(r.ret)),
            ...vRows.map(r => Math.abs(r.deviation)),
            volSeries.std,
          )
          const vPad = maxAbs * 1.15 || 1
          const vTicks = vRows.length
            ? vRows.filter((_, i, arr) => i % Math.ceil(arr.length / tickCount) === 0).map(d => d.date)
            : []
          return (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={vRows} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke={C.grd} opacity={0.6} />
                <XAxis dataKey="date" ticks={vTicks} tickFormatter={formatX}
                  tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }}
                  axisLine={{ stroke: C.grd }} tickLine={false} />
                <YAxis domain={[-vPad, vPad]}
                  tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }}
                  axisLine={false} tickLine={false} width={46}
                  tickFormatter={v => `${v.toFixed(2)}%`} />
                <Tooltip content={<PixelTooltip currency="%" />} />
                {/* Zero line */}
                <ReferenceLine y={0} stroke={C.mut} strokeOpacity={0.4} />
                {/* Average return line (dashed) */}
                <ReferenceLine y={volSeries.mean} stroke={C.frame} strokeDasharray="4 2"
                  strokeOpacity={0.7}
                  label={{ value: `AVG ${volSeries.mean.toFixed(3)}%`, position: 'insideTopLeft',
                    fill: C.frame, fontSize: 6, fontFamily: FONT }} />
                {/* ±1 std bands */}
                <ReferenceLine y={ volSeries.std} stroke={C.mut} strokeDasharray="2 3" strokeOpacity={0.5} />
                <ReferenceLine y={-volSeries.std} stroke={C.mut} strokeDasharray="2 3" strokeOpacity={0.5} />
                {/* Actual return per bar */}
                <Line type="monotone" dataKey="ret" name="RETURN"
                  stroke={etf.color} strokeWidth={1.4} dot={false}
                  activeDot={{ r: 3, fill: etf.color, stroke: C.frame, strokeWidth: 1 }}
                  isAnimationActive={false} />
                {/* Deviation of actual from average */}
                <Line type="monotone" dataKey="deviation" name="DEV FROM AVG"
                  stroke={etf.altColor || C.mut} strokeWidth={1}
                  strokeDasharray="3 2" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )
        })()}
        {!loading && chartView === 'volatility' && volSeries.rows.length === 0 && (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>
            NOT ENOUGH DATA TO COMPUTE RETURNS
          </div>
        )}
        {!loading && !error && !lastData.current && data?.data?.length === 0 && <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: SIZE.xs, color: C.mut }}>NO DATA FOR {range.toUpperCase()} RANGE</div>}
      </div>

      {/* Stats footer */}
      {!loading && prices.length > 0 && chartView === 'price' && (
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
      {!loading && chartView === 'volatility' && volSeries.rows.length > 0 && (
        <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 16, borderTop: `1px solid ${C.grd}` }}>
          {[
            ['AVG RETURN',   `${volSeries.mean.toFixed(3)}%`],
            ['VOLATILITY',   `${volSeries.std.toFixed(3)}%`,  'std dev of per-bar returns'],
            ['ANN. VOL',     `${volSeries.annVol.toFixed(2)}%`, 'annualised volatility'],
            ['BARS USED',    volSeries.rows.length],
          ].map(([l, v, t]) => (
            <div key={l} title={t || ''}>
              <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>{l}</div>
              <div style={{ fontFamily: FONT, fontSize: 8, color: C.txt, marginTop: 1 }}>{v}</div>
            </div>
          ))}
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

// ── Plain-language reference for every number the backend returns ─────────────
// Each entry: full name, an intuitive one-liner, the possible range, and what a
// lower / higher value tells you. (bool/string metrics omit lower/higher.)
const META = {
  // — Model parameters (ETS / Holt-Winters) —
  alpha: { name: 'Level Smoothing (α)',
    intuitive: 'How fast the model chases the latest price instead of trusting long history.',
    range: '0 to 1', lower: 'Leans on history — smoother, slower to react.', higher: 'Snaps to recent prices — responsive but noisier.' },
  beta: { name: 'Trend Smoothing (β)',
    intuitive: 'How fast the trend (slope) re-learns from new data.',
    range: '0 to 1', lower: 'Stable, conservative trend that barely shifts.', higher: 'Trend re-steers quickly, can overshoot.' },
  phi: { name: 'Trend Damping (φ)',
    intuitive: 'How much the long-run trend is flattened so it does not run away (5Y only).',
    range: '0 to 1', lower: 'Trend dies out fast — forecast levels off sooner.', higher: 'Trend persists — closer to straight-line growth.' },
  sigma: { name: 'Residual Std. Deviation (σ)',
    intuitive: 'Typical size of the model’s one-step miss, in price units.',
    range: '≥ 0 (price units)', lower: 'Tighter fit — narrower confidence band.', higher: 'Looser fit — wider confidence band.' },
  aic: { name: 'Akaike Information Criterion',
    intuitive: 'Fit-vs-complexity score; only meaningful compared between models.',
    range: 'any number (relative)', lower: 'Better trade-off of fit and simplicity.', higher: 'Worse fit for the complexity used.' },
  bic: { name: 'Bayesian Information Criterion',
    intuitive: 'Like AIC but punishes extra parameters harder.',
    range: 'any number (relative)', lower: 'Preferred, simpler-yet-accurate model.', higher: 'Over-complex or poor-fitting model.' },
  n_train: { name: 'Training Observations',
    intuitive: 'How many historical points the model learned from.',
    range: '≥ 0 (count)', lower: 'Less history — less reliable estimates.', higher: 'More history — generally more stable.' },
  // — Model parameters (Log-linear OLS, 10Y) —
  cagr_pct: { name: 'Compound Annual Growth Rate', pct: true,
    intuitive: 'The yearly compounding growth rate the fitted trend implies.',
    range: 'any % (can be negative)', lower: 'Slower or negative long-run growth.', higher: 'Faster projected compounding growth.' },
  r_squared: { name: 'R² — Goodness of Fit',
    intuitive: 'How much of the movement the model actually explains.',
    range: '0 to 1', lower: 'Noisy, weakly-explained history — wider bands.', higher: 'Clean, well-explained pattern.' },
  sigma_annual: { name: 'Annualised Volatility (σ)',
    intuitive: 'Year-scaled volatility of the trend’s leftover wiggle.',
    range: '≥ 0', lower: 'Calmer history — tighter long-run bands.', higher: 'Choppier history — wider bands.' },
  // — Volatility model (GARCH) —
  garch_persistence: { name: 'GARCH Persistence (α+β)',
    intuitive: 'How long a volatility shock keeps echoing through the market.',
    range: '0 to 1', lower: 'Turbulence fades quickly.', higher: 'Turbulence lingers (near 1 = very sticky).' },
  garch_annual_vol_pct: { name: 'GARCH Long-Run Volatility', pct: true,
    intuitive: 'The “normal” yearly volatility the market reverts toward.',
    range: '≥ 0%', lower: 'Calmer underlying asset.', higher: 'Riskier, more volatile asset.' },
  garch_available: { name: 'Volatility Model Available', bool: true,
    intuitive: 'Whether the GARCH volatility engine could be loaded.', range: 'Yes / No' },
  garch_fit: { name: 'Volatility Model Fitted', bool: true,
    intuitive: 'Whether GARCH successfully fitted this price series.', range: 'Yes / No' },
  // — Walk-forward validation —
  wf_horizon_window: { name: 'Tested Horizon',
    intuitive: 'How far ahead the model was actually back-tested — and whether short history capped it below the full forecast.',
    range: '1 step → full horizon' },
  wf_horizon_steps: { name: 'Tested Steps Ahead',
    intuitive: 'Number of periods ahead each validation forecast looked.',
    range: '1 to forecast length', lower: 'Only near-term skill was tested.', higher: 'Longer-range skill was tested (needs more history).' },
  wf_capped: { name: 'Horizon Capped by History', bool: true,
    intuitive: 'Was the test horizon shortened because there isn’t enough history to reach the full forecast length?', range: 'Yes / No' },
  wf_n: { name: 'Validation Folds',
    intuitive: 'How many out-of-sample tests were averaged together.',
    range: '≥ 3 (count)', lower: 'Few tests — noisier, less trustworthy scores.', higher: 'More tests — more reliable scores.' },
  wf_rmse: { name: 'Root Mean Squared Error (RMSE)',
    intuitive: 'Typical forecast miss in price units, punishing big misses more.',
    range: '≥ 0 (price units)', lower: 'More accurate forecasts.', higher: 'Larger forecast errors.' },
  wf_mae: { name: 'Mean Absolute Error (MAE)',
    intuitive: 'Average forecast miss in price units.',
    range: '≥ 0 (price units)', lower: 'More accurate on average.', higher: 'Bigger average error.' },
  wf_mape: { name: 'Mean Absolute % Error (MAPE)', pct: true,
    intuitive: 'Average miss as a percentage of price — comparable across ETFs.',
    range: '≥ 0%', lower: 'More accurate relative to price.', higher: 'Less accurate relative to price.' },
  wf_da: { name: 'Directional Accuracy', pct: true,
    intuitive: 'How often the forecast called the up/down direction correctly.',
    range: '0% to 100% (50% = coin flip)', lower: 'Worse than guessing direction.', higher: 'Better at calling direction.' },
  wf_coverage: { name: '95% Confidence Coverage', pct: true,
    intuitive: 'Share of real prices that landed inside the predicted 95% band.',
    range: '0% to 100% (ideal ≈ 95%)', lower: 'Bands too narrow — overconfident.', higher: 'Above ~95% = bands too wide (underconfident).' },
  wf_crps: { name: 'Continuous Ranked Prob. Score (CRPS)',
    intuitive: 'One score rewarding forecasts that are both accurate and honestly uncertain.',
    range: '≥ 0 (price units)', lower: 'Sharper, better-calibrated forecasts.', higher: 'Less accurate or poorly-calibrated.' },
  wf_sharpe: { name: 'Signal Sharpe Ratio',
    intuitive: 'Risk-adjusted payoff of trading on the forecast’s direction.',
    range: 'any (≈ −3 to 3 typical)', lower: 'Direction signal loses money / adds risk.', higher: 'Direction signal pays off per unit of risk.' },
  // — Factor regression —
  alpha_annualised_pct: { name: "Jensen's Alpha (annualised)", pct: true,
    intuitive: 'Yearly return the ETF earns beyond its market + tech exposure.',
    range: 'any % (can be negative)', lower: 'Lagging once risk taken is accounted for.', higher: 'Genuine outperformance (skill or edge).' },
  beta_market: { name: 'Market Beta (vs S&P 500)',
    intuitive: 'How strongly the ETF moves with the broad market.',
    range: 'any (≈ 0 to 2 typical)', lower: 'More independent of the market (<1 = calmer).', higher: 'Amplifies market moves (>1 = more volatile).' },
  beta_tech: { name: 'Technology Beta (vs XLK)',
    intuitive: 'How strongly the ETF tracks the technology sector.',
    range: 'any (≈ 0 to 2 typical)', lower: 'Little tech-sector sensitivity.', higher: 'Heavily tech-driven.' },
  tracking_error_pct: { name: 'Tracking Error', pct: true,
    intuitive: 'Yearly volatility of returns the market + tech factors can’t explain.',
    range: '≥ 0%', lower: 'Behaves like its factor exposure (predictable).', higher: 'Lots of idiosyncratic, unexplained movement.' },
  n_obs: { name: 'Return Observations',
    intuitive: 'Return periods used to estimate the alpha / betas.',
    range: '≥ 0 (count)', lower: 'Fewer points — less reliable betas.', higher: 'More points — steadier estimates.' },
  // — Shariah features —
  rebalance_pressure_pct: { name: 'Index Rebalance Pressure', pct: true,
    intuitive: 'Share of the past year sitting in MSCI / DJIM Islamic index review windows, when funds reweight.',
    range: '0% to 100%', lower: 'Little recent rebalance-driven flow.', higher: 'More periods exposed to reweighting pressure.' },
  xlk_xlf_ratio: { name: 'Tech ÷ Financials (XLK/XLF)',
    intuitive: 'Strength of tech vs financials — the structural tilt Halal ETFs carry.',
    range: '> 0', lower: 'Financials leading — less favourable backdrop.', higher: 'Tech leading — favourable for tech-heavy Halal ETFs.' },
  corr_vs_spy: { name: 'Correlation vs S&P 500',
    intuitive: 'How tightly the ETF moved with the broad market over the last 26 weeks.',
    range: '−1 to 1', lower: 'More independent / diversifying.', higher: 'Moves almost in lockstep with the market.' },
  corr_vs_vix: { name: 'Correlation vs VIX (Fear)',
    intuitive: 'How the ETF moves relative to the market’s fear gauge.',
    range: '−1 to 1', lower: 'Falls when fear spikes (typical for equities).', higher: 'Rises with fear — unusual, defensive behaviour.' },
}

const PARAM_ORDER  = ['cagr_pct', 'r_squared', 'sigma_annual', 'alpha', 'beta', 'phi', 'sigma', 'aic', 'bic',
                      'garch_persistence', 'garch_annual_vol_pct', 'garch_available', 'garch_fit', 'n_train']
const WF_ORDER      = ['wf_horizon_window', 'wf_horizon_steps', 'wf_capped', 'wf_n',
                       'wf_rmse', 'wf_mae', 'wf_mape', 'wf_da', 'wf_coverage', 'wf_crps', 'wf_sharpe']
const FACTOR_ORDER  = ['alpha_annualised_pct', 'beta_market', 'beta_tech', 'r_squared', 'tracking_error_pct', 'n_obs']
const SHARIAH_ORDER = ['rebalance_pressure_pct', 'xlk_xlf_ratio', 'corr_vs_spy', 'corr_vs_vix']

// Step-by-step summary of the pipeline (shared by every ETF & horizon).
const PIPELINE_STEPS = [
  ['1 · Fetch price history',      'Download the maximum available weekly (1Y/5Y) or monthly (10Y) closing prices from Yahoo Finance.'],
  ['2 · Gather market context',    'Pull the S&P 500 (SPY), technology sector (XLK), financials sector (XLF) and the VIX volatility index for context.'],
  ['3 · Engineer Shariah signals', 'Flag MSCI / DJIM Islamic index rebalance windows and measure tech-vs-financials strength and market correlations.'],
  ['4 · Model volatility (GARCH)', 'Fit a GARCH(1,1) model so the confidence band widens after turbulent periods and narrows after calm ones.'],
  ['5 · Detect market regime (HMM)','A 2-state Hidden Markov Model decides whether markets are calm or turbulent and scales the band by up to 1.35×.'],
  ['6 · Fit the forecast model',   'Project prices forward, blending the volatility estimates into a 95% confidence band (model details below).'],
  ['7 · Validate out-of-sample',   'Replay the model on past data it never saw, forecasting as far ahead as the real horizon allows (capped by history), and score its accuracy — see each ETF’s validation numbers.'],
  ['8 · Attribute performance',    'Run a factor regression to separate market and sector exposure from genuine alpha.'],
]

function fmtVal(key, v) {
  if (v == null) return '—'
  const m = META[key]
  if (m?.bool || typeof v === 'boolean') return v ? 'YES' : 'NO'
  if (typeof v === 'number') {
    const n = v.toLocaleString('en-US', { maximumFractionDigits: 4 })
    return m?.pct ? `${n}%` : n
  }
  return String(v)
}

// One labelled number: full name + value + intuitive meaning + range / lower / higher.
function MetricItem({ name, value, meta, accent }) {
  const kv = (label, text, color) => (
    <div style={{ display: 'flex', gap: 5, lineHeight: 1.7 }}>
      <span style={{ fontFamily: FONT, fontSize: 6, color, fontWeight: 'bold', flexShrink: 0, minWidth: 38 }}>{label}</span>
      <span style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>{text}</span>
    </div>
  )
  const hasGuide = meta && (meta.range || meta.lower || meta.higher)
  return (
    <div style={{ background: C.r1, border: `1px solid ${C.grd}`, borderRadius: 4, padding: '5px 8px', marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: FONT, fontSize: 7, color: accent || C.txt, fontWeight: 'bold', lineHeight: 1.4 }}>{name}</span>
        <span style={{ fontFamily: FONT, fontSize: 8, color: C.txt, fontWeight: 'bold', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
      {meta?.intuitive && (
        <div style={{ fontFamily: FONT, fontSize: 6, color: C.txt, lineHeight: 1.7, marginTop: 2 }}>{meta.intuitive}</div>
      )}
      {hasGuide && (
        <div style={{ marginTop: 3, paddingTop: 3, borderTop: `1px dashed ${C.grd}` }}>
          {meta.range  && kv('RANGE', meta.range, accent || C.mut)}
          {meta.lower  && kv('↓ LOW', meta.lower, C.mut)}
          {meta.higher && kv('↑ HIGH', meta.higher, C.mut)}
        </div>
      )}
    </div>
  )
}

function NumSection({ title, hint, accent, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: FONT, fontSize: 7, color: accent, letterSpacing: '.05em', fontWeight: 'bold', marginBottom: hint ? 2 : 5 }}>
        {title}
      </div>
      {hint && <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, lineHeight: 1.7, marginBottom: 5 }}>{hint}</div>}
      {children}
    </div>
  )
}

// Render an ordered list of metric keys as MetricItems, skipping absent keys.
function metricList(obj, order, accent) {
  if (!obj) return null
  const keys = [
    ...order.filter(k => k in obj),
    ...Object.keys(obj).filter(k => !order.includes(k)),
  ]
  return keys.map(k => (
    <MetricItem
      key={k}
      name={META[k]?.name || k.replace(/_/g, ' ').toUpperCase()}
      value={fmtVal(k, obj[k])}
      meta={META[k]}
      accent={accent}
    />
  ))
}

function ForecastPanel({ etf, horizon, onModelInfo }) {
  const [forecast, setForecast] = useState(undefined)   // undefined=loading, null=missing, obj=ok
  const [running, setRunning]   = useState(false)
  const [runErr, setRunErr]     = useState(null)
  const [subtab, setSubtab]     = useState('chart')     // 'chart' | 'numbers'

  const load = () => {
    setForecast(undefined)
    api.getETFForecast(etf.symbol, horizon)
      .then(d => setForecast(d))
      .catch(() => setForecast(null))
  }

  useEffect(() => { load() }, [etf.symbol, horizon])

  // Lift the (ETF-independent) model description up so the page can show it once.
  useEffect(() => {
    if (forecast && onModelInfo) {
      onModelInfo({
        model_name:         forecast.model_name,
        model_rationale:    forecast.model_rationale,
        feature_importance: forecast.feature_importance,
      })
    }
  }, [forecast])  // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Numbers tab (per-ETF) ─────────────────────────────────────────────────────
  const metrics  = forecast?.metrics || {}
  const paramObj = Object.fromEntries(Object.entries(metrics).filter(([k]) => !k.startsWith('wf_')))
  const wfObj    = Object.fromEntries(Object.entries(metrics).filter(([k]) =>  k.startsWith('wf_')))
  const regime   = forecast?.regime || {}
  const factors  = forecast?.factors || {}
  const shariah  = forecast?.shariah_features || {}

  const regimeColor = regime.regime_label === 'high-volatility' ? C.err
                    : regime.regime_label === 'low-volatility'  ? C.ok
                    : C.mut
  const regimeText  = regime.regime_label === 'high-volatility' ? 'HIGH VOLATILITY'
                    : regime.regime_label === 'low-volatility'  ? 'LOW VOLATILITY'
                    : 'UNKNOWN'
  const regimeMeaning = !regime.hmm_available
    ? 'Regime detection unavailable — confidence bands use the standard width.'
    : regime.regime_label === 'high-volatility'
      ? `Turbulent conditions detected — confidence bands widened ×${regime.ci_multiplier} to reflect the higher risk.`
      : 'Markets are calm — standard confidence bands apply.'

  const numbersView = forecast ? (
    <div style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 2 }}>
      {/* Current market regime */}
      <div style={{
        background: C.r1, border: `1px solid ${regimeColor}`, borderLeft: `3px solid ${regimeColor}`,
        borderRadius: 4, padding: '6px 8px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: FONT, fontSize: 6, color: C.mut, letterSpacing: '.05em' }}>CURRENT MARKET REGIME</span>
          {regime.hmm_available && regime.regime_prob != null && (
            <span style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>
              {(regime.regime_prob * 100).toFixed(0)}% confidence
            </span>
          )}
        </div>
        <div style={{ fontFamily: FONT, fontSize: SIZE.sm, color: regimeColor, fontWeight: 'bold', margin: '2px 0 3px' }}>
          {regimeText}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, lineHeight: 1.7 }}>{regimeMeaning}</div>
      </div>

      {/* 1 · Parameters */}
      <NumSection
        title="1 · MODEL PARAMETERS"
        accent={etf.color}
        hint="The settings the model learned from this ETF’s price history, and the volatility engine behind the confidence band."
      >
        {metricList(paramObj, PARAM_ORDER, etf.color)}
      </NumSection>

      {/* 2 · Walk-forward validation */}
      <NumSection
        title="2 · WALK-FORWARD VALIDATION"
        accent={etf.color}
        hint="Out-of-sample accuracy, measured by re-running the model on past data it never saw — forecasting the full horizon ahead, capped by available history. Check ‘Tested Horizon’ to see how far the scores actually reach."
      >
        {Object.keys(wfObj).length > 0
          ? metricList(wfObj, WF_ORDER, etf.color)
          : <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, fontStyle: 'italic' }}>Not enough history to validate this horizon.</div>}
      </NumSection>

      {/* Factor regression */}
      <NumSection
        title="FACTOR REGRESSION (α / β)"
        accent={etf.color}
        hint="Splits the ETF’s returns into market exposure, technology-sector exposure, and genuine skill (alpha)."
      >
        {Object.keys(factors).length > 0
          ? metricList(factors, FACTOR_ORDER, etf.color)
          : <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, fontStyle: 'italic' }}>Market context could not be fetched, so factor exposure is unavailable.</div>}
      </NumSection>

      {/* 3 · Shariah features */}
      <NumSection
        title="3 · SHARIAH FEATURES"
        accent={etf.color}
        hint="Signals specific to Islamic / Halal ETFs that describe the current market environment."
      >
        {Object.keys(shariah).length > 0
          ? metricList(shariah, SHARIAH_ORDER, etf.color)
          : <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, fontStyle: 'italic' }}>No Shariah features available.</div>}
      </NumSection>
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
          {['chart', 'numbers'].map(t => (
            <Btn key={t} onClick={() => setSubtab(t)} style={{
              fontFamily: FONT, fontSize: SIZE.xs,
              color:      subtab === t ? C.barT : C.mut,
              background: subtab === t ? C.frame : C.face,
              border: 'none',
              boxShadow:  subtab === t ? SUNKEN : RAISED,
              padding: '6px 14px', borderRadius: '6px',
            }}>
              {t === 'chart' ? '~ CHART' : '# NUMBERS'}
            </Btn>
          ))}
          {/* Run / update model button */}
          <Btn onClick={handleRun} disabled={running} style={{
            fontFamily: FONT, fontSize: SIZE.xs,
            color:     running ? C.mut : C.ok,
            background: C.face, border: 'none',
            boxShadow:  running ? SUNKEN : RAISED,
            padding: '6px 14px', borderRadius: '6px',
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
        {forecast && subtab === 'numbers' && numbersView}
      </div>
    </div>
  )
}

// ── Forecast view (wraps both ETF panels with horizon selector) ───────────────
function ForecastView({ etfs }) {
  const [horizon, setHorizon]     = useState('1y')
  const [modelInfo, setModelInfo] = useState(null)   // shared: both ETFs use the same model
  const [showModel, setShowModel] = useState(false)

  // The model is identical across ETFs but changes with the horizon.
  useEffect(() => { setModelInfo(null); setShowModel(false) }, [horizon])

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
            color:      horizon === h.key ? C.frame : C.mut,
            background: 'none',
            border: 'none',
            boxShadow:  horizon === h.key ? SUNKEN : RAISED,
            padding: '6px 14px', borderRadius: '6px'
            }}>
            {h.label}
          </Btn>
        ))}
        <span style={{ fontFamily: FONT, fontSize: 7, color: C.mut, marginLeft: 4 }}>
          · {FC_HORIZONS.find(h => h.key === horizon)?.desc}
        </span>
      </div>

      {etfs.map(etf => (
        <ForecastPanel
          key={`${etf.symbol}-${horizon}`}
          etf={etf}
          horizon={horizon}
          onModelInfo={setModelInfo}
        />
      ))}

      {/* Shared model explanation — shown once, since both ETFs use the same model */}
      {modelInfo && (
        <div style={{
          borderRadius: 8, background: C.r1, border: `1px solid ${C.grd}`,
          marginBottom: 12, boxShadow: `0 4px 16px rgba(122,26,56,0.07)`,
        }}>
          <div style={{
            padding: '8px 12px', borderBottom: showModel ? `1px solid ${C.grd}` : 'none',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.frame, letterSpacing: '.04em' }}>
                HOW THIS FORECAST IS BUILT
              </div>
              <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, marginTop: 2 }}>
                Same model & steps for every ETF on the {horizon.toUpperCase()} horizon
              </div>
            </div>
            <Btn onClick={() => setShowModel(s => !s)} style={{
              fontFamily: FONT, fontSize: SIZE.xs,
              color:      showModel ? C.barT : C.mut,
              background: showModel ? C.frame : C.face,
              border: 'none', boxShadow: showModel ? SUNKEN : RAISED,
              padding: '6px 14px', borderRadius: '6px',
            }}>
              {showModel ? '▲ HIDE MODEL' : '▼ MODEL'}
            </Btn>
          </div>

          {showModel && (
            <div style={{ padding: '10px 12px' }}>
              {/* Model name + rationale */}
              <div style={{ fontFamily: FONT, fontSize: SIZE.xs, color: C.frame, marginBottom: 6, letterSpacing: '.03em' }}>
                {modelInfo.model_name}
              </div>
              <div style={{
                fontFamily: FONT, fontSize: 7, color: C.txt, lineHeight: 1.9,
                background: C.r2 || C.r1, border: `1px solid ${C.grd}`,
                padding: '6px 8px', borderRadius: 4, marginBottom: 12,
              }}>
                {modelInfo.model_rationale}
              </div>

              {/* Step-by-step pipeline */}
              <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut, letterSpacing: '.05em', fontWeight: 'bold', marginBottom: 5 }}>
                STEP BY STEP
              </div>
              {PIPELINE_STEPS.map(([title, desc]) => (
                <div key={title} style={{
                  background: C.r1, border: `1px solid ${C.grd}`, borderLeft: `3px solid ${C.frame}`,
                  borderRadius: 4, padding: '5px 8px', marginBottom: 4,
                }}>
                  <div style={{ fontFamily: FONT, fontSize: 7, color: C.frame, fontWeight: 'bold' }}>{title}</div>
                  <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, lineHeight: 1.7, marginTop: 2 }}>{desc}</div>
                </div>
              ))}

              {/* What each driver means */}
              {modelInfo.feature_importance && Object.keys(modelInfo.feature_importance).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut, letterSpacing: '.05em', fontWeight: 'bold', marginBottom: 5 }}>
                    WHAT EACH DRIVER MEANS
                  </div>
                  {Object.entries(modelInfo.feature_importance).map(([name, desc]) => (
                    <div key={name} style={{ marginBottom: 6 }}>
                      <div style={{ fontFamily: FONT, fontSize: 7, color: C.frame, fontWeight: 'bold' }}>{name}</div>
                      <div style={{ fontFamily: FONT, fontSize: 6, color: C.txt, lineHeight: 1.8, paddingLeft: 6 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
  const [chartView, setChartView]       = useState('price')  // 'price' | 'volatility'
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
      </div>

    <div style={{
        display: 'flex', gap: 6, margin: 10,
        padding: '6px 10px',
        background: C.r1, border: `1px solid ${C.grd}`,
        borderRadius: 6, alignItems: 'center', justifyContent: 'center',
        FONT: FONT, fontSize: 8, color: C.mut,
        }}>
          {/* Portfolio toggle (chart mode only) */}
          {mode === 'chart' && (
            <Btn onClick={() => setShowInv(s => !s)} style={{
              fontFamily: FONT, fontSize: SIZE.xs,
              color: showInvestments ? C.barT : C.mut,
              background: showInvestments ? C.frame : C.face,
              border: 'none', boxShadow: showInvestments ? SUNKEN : RAISED,
              padding: '6px 14px', minHeight: 32, borderRadius: '6px',
            }}>
            {showInvestments ? 'HIDE PORTFOLIO' : 'VIEW PORTFOLIO'}
            </Btn>
          )}
          {/* Ticker toggle (chart mode only) */}
          {mode === 'chart' && (
            <Btn onClick={() => setShowAddTicker(s => !s)} style={{
              fontFamily: FONT, fontSize: SIZE.xs, color: showAddTicker ? C.barT : C.mut,
              background: showAddTicker ? C.frame : C.face, border: 'none', boxShadow: showAddTicker ? SUNKEN : RAISED,
              padding: '6px 14px', minHeight: 32, borderRadius: '6px',
            }}>
              {showAddTicker ? 'CLOSE TICKER' : 'ADD TICKER'}
            </Btn>
          )}
          {/* Mode toggle */}
          {mode === 'forecast' && (
              <Btn onClick={() => setMode('chart')} style={{
                fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
                background: C.face, border: 'none', boxShadow: RAISED,
                padding: '6px 14px', minHeight: 32, borderRadius: '6px',
              }}>
                ◄ BACK
              </Btn>
        )}
          <Btn onClick={() => setMode(m => m === 'chart' ? 'forecast' : 'chart')} style={{
            fontFamily: FONT, fontSize: SIZE.xs,
            color:      mode === 'forecast' ? C.barT : C.mut,
            background: mode === 'forecast' ? C.frame : C.face,
            border: 'none', boxShadow: mode === 'forecast' ? SUNKEN : RAISED,
            padding: '6px 14px', minHeight: 32, borderRadius: '6px',
          }}>
            VIEW FORECAST
          </Btn>
        </div>

      {/* Content */}
      <div style={{ padding: '10px 10px 4px', background: 'transparent', overflowY: 'auto', maxHeight: 'calc(100vh - 60px)' }}>
        {mode === 'chart' && (
          <>
            <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, marginBottom: 8, borderLeft: `2px solid ${C.grd}`, paddingLeft: 6 }}>
              DELAYED DATA · NOT FINANCIAL ADVICE · EDUCATIONAL ONLY
              {/* Range sub-bar (chart mode only) */}
              {RANGES.map(r => (
                <Btn key={r.key} onClick={() => setRange(r.key)} style={{
                  fontFamily: FONT, fontSize: SIZE.xs,
                  color: range === r.key ? C.frame : C.mut,
                  border: 'none', boxShadow: range === r.key ? SUNKEN : RAISED,
                  padding: '6px 14px', borderRadius: '6px', background: 'none',
                  marginLeft: '6px',
                }}>
                  {r.label}
                </Btn>
              ))}
              <Btn onClick={refresh} title="Refresh" style={{
                fontFamily: FONT, fontSize: SIZE.xs,
                color: C.frame, background: 'none',
                border: 'none', boxShadow: RAISED,
                padding: '6px 14px', borderRadius: '6px',
                marginLeft: '6px',
              }}>↻</Btn>
              {/* Price / Volatility view toggle */}
              <span style={{ display: 'inline-flex', gap: 0, marginLeft: 12 }}>
                {['price', 'volatility'].map(v => (
                  <Btn key={v}
                    onClick={() => setChartView(v)}
                    title={v === 'price'
                      ? 'Show price line chart'
                      : 'Show per-bar returns, the average return, and deviation from average'}
                    style={{
                      fontFamily: FONT, fontSize: SIZE.xs,
                      color: chartView === v ? C.frame : C.mut,
                      border: 'none', boxShadow: chartView === v ? SUNKEN : RAISED,
                      padding: '6px 12px', borderRadius: '6px', background: 'none',
                      marginLeft: '4px',
                    }}>
                    {v === 'price' ? 'PRICE' : 'VOLATILITY'}
                  </Btn>
                ))}
              </span>
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
                    padding: '3px 14px', borderRadius: '6px',
                  }}>▶ ADD</Btn>
                </div>
              </div>
            )}
            {etfs.map(etf => (
              <ETFPanel
                key={etf.symbol + range + tick}
                etf={etf}
                range={range}
                chartView={chartView}
                showInvestments={showInvestments}
                isDefault={DEFAULT_ETFS.some(d => d.symbol === etf.symbol)}
                onRemove={handleRemoveTicker}
              />
            ))}
            <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut, textAlign: 'right', paddingBottom: 4 }}>
              REFRESHED: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              {range === '1wk' ? ' · 1H BARS' : ' · 1D BARS'}
              {chartView === 'volatility' && ' · PER-BAR % RETURNS'}
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