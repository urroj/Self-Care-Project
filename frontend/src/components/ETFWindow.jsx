// components/ETFWindow.jsx — Islamic ETF tracker with pixel aesthetic

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { api } from '../api.js'
import { C, FONT, RAISED, SUNKEN, SIZE } from '../theme.js'

// ── ETF config ─────────────────────────────────────────────────────────────
const ETFS = [
  {
    symbol:   'ISWD.SW',
    name:     'MSCI World Islamic',
    subname:  'iShares — USD (Dist)',
    color:    '#C4506A',
    altColor: '#E87090',
  },
  {
    symbol:   'IGDA.L',
    name:     'Islamic Global Dev.',
    subname:  'Invesco — USD (Acc)',
    color:    '#5A8E72',
    altColor: '#82ABA1',
  },
]

const RANGES = [
  { key: '1wk', label: '1W' },
  { key: '1mo', label: '1M' },
  { key: '1y',  label: '1Y' },
]

// ── Custom tooltip ─────────────────────────────────────────────────────────
function PixelTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(255,245,248,0.96)',
      border: `2px solid ${C.frame}`,
      boxShadow: `2px 2px 0 ${C.sh}`,
      padding: '6px 10px',
      fontFamily: FONT,
    }}>
      <div style={{ fontSize: 7, color: C.mut, marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{
          fontSize: 8, color: p.color, fontWeight: 'bold',
        }}>
          {p.name}: {currency} {Number(p.value).toFixed(2)}
        </div>
      ))}
    </div>
  )
}

// ── Single ETF chart panel ─────────────────────────────────────────────────
function ETFPanel({ etf, range }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getETF(etf.symbol, range)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [etf.symbol, range])

  // Derive stats
  const prices    = data?.data?.map(d => d.close).filter(Boolean) ?? []
  const current   = data?.current   ?? prices[prices.length - 1] ?? 0
  const prevClose = data?.prev_close ?? prices[0] ?? 0
  const change    = current - prevClose
  const changePct = prevClose ? (change / prevClose) * 100 : 0
  const isUp      = change >= 0
  const rangeHigh = prices.length ? Math.max(...prices) : 0
  const rangeLow  = prices.length ? Math.min(...prices) : 0

  // Format x-axis labels depending on range
  const formatX = (val) => {
    if (!val) return ''
    try {
      const d = new Date(val)
      if (range === '1wk') return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      if (range === '1mo') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    } catch { return val }
  }

  // Thin out X ticks so they don't overlap
  const tickCount = range === '1y' ? 6 : range === '1mo' ? 8 : 6
  const ticks = data?.data?.length
    ? data.data
        .filter((_, i, arr) => i % Math.ceil(arr.length / tickCount) === 0)
        .map(d => d.date)
    : []

  const yMin = rangeLow  ? rangeLow  * 0.998 : 'auto'
  const yMax = rangeHigh ? rangeHigh * 1.002 : 'auto'

  return (
    <div style={{
      background: C.r1,
      border: `1px solid ${C.grd}`,
      marginBottom: 12,
      boxShadow: `inset -1px -1px 0 ${C.hi}`,
    }}>
      {/* Header row */}
      <div style={{
        padding: '8px 12px 6px',
        borderBottom: `1px solid ${C.grd}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      }}>
        <div>
          <div style={{
            fontFamily: FONT, fontSize: SIZE.sm, color: etf.color,
            letterSpacing: '.04em', marginBottom: 2,
          }}>
            {etf.name}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 7, color: C.mut }}>
            {etf.symbol} · {etf.subname}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: FONT, fontSize: SIZE.lg, color: C.txt,
            fontWeight: 'bold', lineHeight: 1.2,
          }}>
            {current ? `${data?.currency ?? ''} ${current.toFixed(2)}` : '—'}
          </div>
          <div style={{
            fontFamily: FONT, fontSize: SIZE.xs,
            color: isUp ? C.ok : C.err,
            marginTop: 2,
          }}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct.toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: '8px 4px 4px' }}>
        {loading && (
          <div style={{
            height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
          }}>
            LOADING {etf.symbol}…
          </div>
        )}

        {error && (
          <div style={{
            height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 6,
            fontFamily: FONT, fontSize: 7, color: C.err, padding: '0 12px', textAlign: 'center',
          }}>
            <div>✗ FAILED TO LOAD</div>
            <div style={{ color: C.mut, fontSize: 6, wordBreak: 'break-all' }}>{error}</div>
          </div>
        )}

        {!loading && !error && data?.data?.length > 0 && (
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={data.data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={C.grd} opacity={0.6} />
              <XAxis
                dataKey="date"
                ticks={ticks}
                tickFormatter={formatX}
                tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }}
                axisLine={{ stroke: C.grd }}
                tickLine={false}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontFamily: FONT, fontSize: 6, fill: C.mut }}
                axisLine={false}
                tickLine={false}
                width={46}
                tickFormatter={v => v.toFixed(1)}
              />
              <Tooltip
                content={<PixelTooltip currency={data.currency} />}
              />
              {prevClose > 0 && (
                <ReferenceLine
                  y={prevClose}
                  stroke={C.mut}
                  strokeDasharray="3 2"
                  strokeOpacity={0.5}
                />
              )}
              <Line
                type="monotone"
                dataKey="close"
                name={etf.symbol}
                stroke={etf.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: etf.color, stroke: C.frame, strokeWidth: 1 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {!loading && !error && data?.data?.length === 0 && (
          <div style={{
            height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT, fontSize: SIZE.xs, color: C.mut,
          }}>
            NO DATA FOR {range.toUpperCase()} RANGE
          </div>
        )}
      </div>

      {/* Range stats footer */}
      {!loading && !error && prices.length > 0 && (
        <div style={{
          padding: '4px 12px 8px',
          display: 'flex', gap: 16,
          borderTop: `1px solid ${C.grd}`,
        }}>
          {[
            ['RANGE HIGH', rangeHigh.toFixed(2)],
            ['RANGE LOW',  rangeLow.toFixed(2)],
            ['EXCHANGE',   data?.exchange ?? '—'],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>{l}</div>
              <div style={{ fontFamily: FONT, fontSize: 8, color: C.txt, marginTop: 1 }}>{v}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <div style={{ fontFamily: FONT, fontSize: 6, color: C.mut }}>DATA POINTS</div>
            <div style={{ fontFamily: FONT, fontSize: 8, color: C.txt, marginTop: 1 }}>
              {data.data.length}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ETFWindow ──────────────────────────────────────────────────────────────
export default function ETFWindow({ onTitleDown, onFocus, embedded = false }) {
  const [range, setRange] = useState('1mo')
  const [tick, setTick]   = useState(0) // force refresh

  // Auto-refresh every 5 min
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const refresh = () => setTick(t => t + 1)

  return (
    <div
      onMouseDown={embedded ? undefined : onFocus}
      style={embedded ? {} : undefined}
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
          {/* Pixel chart icon inline */}
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
          {/* Range buttons */}
          <div style={{ display: 'flex', gap: 3 }}>
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                style={{
                  fontFamily: FONT, fontSize: 7,
                  color: range === r.key ? C.barT : C.mut,
                  background: range === r.key ? C.frame : C.face,
                  border: 'none',
                  boxShadow: range === r.key ? SUNKEN : RAISED,
                  padding: '2px 7px', cursor: 'pointer',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={refresh}
            title="Refresh"
            style={{
              fontFamily: FONT, fontSize: 10,
              color: C.barT, background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* ETF panels */}
      <div style={{ padding: '10px 10px 4px', background: 'transparent' }}>

        {/* Disclaimer */}
        <div style={{
          fontFamily: FONT, fontSize: 6, color: C.mut,
          marginBottom: 8, letterSpacing: '.03em',
          borderLeft: `2px solid ${C.grd}`, paddingLeft: 6,
        }}>
          DELAYED DATA · NOT FINANCIAL ADVICE · EDUCATIONAL ONLY
        </div>

        {ETFS.map(etf => (
          <ETFPanel key={etf.symbol + range + tick} etf={etf} range={range} />
        ))}

        {/* Last updated */}
        <div style={{
          fontFamily: FONT, fontSize: 6, color: C.mut,
          textAlign: 'right', paddingBottom: 4,
        }}>
          LAST REFRESHED: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          {range === '1wk' ? ' · 1H BARS' : ' · 1D BARS'}
        </div>
      </div>
    </div>
  )
}