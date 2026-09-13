import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtDate, fmtMonth, rankColor, signed, tierBands } from './lib'
import { TipBox, axisProps, chartTipWrapper, useTheme } from './ui'

function RatingTip({ active, payload }) {
  const C = useTheme()
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (d.rating == null)
    return (
      <TipBox title={`${fmtDate(d.t / 1000)} · forecast, contest +${d.step}`}>
        <div>≈ <b style={{ color: 'var(--acc2)' }}>{d.fc}</b> <span style={{ color: 'var(--faint)' }}>· band {d.band[0]}–{d.band[1]}</span></div>
      </TipBox>
    )
  return (
    <TipBox title={`${fmtDate(d.t / 1000)} · rank ${d.rank}`}>
      <div className="max-w-80 truncate font-bold">{d.name}</div>
      <div>
        <b style={{ color: rankColor(d.rating, C.dark) }}>{d.rating}</b>{' '}
        <b style={{ color: d.delta >= 0 ? 'var(--acc)' : 'var(--bad)' }}>{signed(d.delta)}</b>
      </div>
    </TipBox>
  )
}

/** Rating line over tier bands, peak marker, optional dashed forecast with band. */
export function RatingChart({ history, forecast, height = 300, last }) {
  const C = useTheme()
  const hist = last ? history.slice(-last) : history
  const data = hist.map((h) => ({ t: h.ratingUpdateTimeSeconds * 1000, rating: h.newRating, name: h.contestName, rank: h.rank, delta: h.delta }))
  if (forecast) {
    const tail = data.at(-1)
    Object.assign(tail, { fc: tail.rating, band: [tail.rating, tail.rating] })
    forecast.points.forEach((f) => data.push({ t: f.t * 1000, fc: f.rating, band: [f.lo, f.hi], step: f.step }))
  }
  const vals = data.flatMap((d) => [d.rating, ...(d.band ?? [])]).filter((v) => v != null)
  const lo = Math.floor((Math.min(...vals) - 80) / 100) * 100
  const hi = Math.ceil((Math.max(...vals) + 80) / 100) * 100
  const peak = hist.reduce((m, h) => (h.newRating > m.newRating ? h : m))
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
          {tierBands(lo, hi, C.dark).map((b) => (
            <ReferenceArea key={b.y1} y1={b.y1} y2={b.y2} fill={b.color} fillOpacity={C.dark ? 0.07 : 0.09} stroke="none" ifOverflow="hidden" />
          ))}
          <CartesianGrid stroke={C.grid} horizontal={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} {...axisProps(C)} tickFormatter={(t) => fmtMonth(t / 1000)} minTickGap={40} />
          <YAxis domain={[lo, hi]} width={46} {...axisProps(C)} />
          <Tooltip content={<RatingTip />} cursor={{ stroke: C.line2 }} wrapperStyle={chartTipWrapper} />
          <ReferenceLine x={peak.ratingUpdateTimeSeconds * 1000} stroke={C.warn} strokeDasharray="2 3" strokeOpacity={0.6} />
          <Area dataKey="band" stroke="none" fill={C.acc2} fillOpacity={0.14} isAnimationActive={false} />
          <Line dataKey="fc" stroke={C.acc2} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="rating" stroke={C.fg} strokeOpacity={0.85} strokeWidth={1.4} isAnimationActive={false} activeDot={{ r: 4, fill: C.acc }}
            dot={({ cx, cy, payload, index }) =>
              payload.rating == null || hist.length > 160 ? <g key={index} /> : <circle key={index} cx={cx} cy={cy} r={2} fill={rankColor(payload.rating, C.dark)} />
            } />
          <ReferenceDot x={peak.ratingUpdateTimeSeconds * 1000} y={peak.newRating} r={5} fill="none" stroke={C.warn} strokeWidth={1.5} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
