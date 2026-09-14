import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { HANDLE_RE, fmtDate, fmtMonth, rankColor, signed, tierBands, tzOffset } from './lib'
import { ChartTip, Empty, ErrorCard, HandleName, Panel, Skeleton, TipBox, axisProps, chartTipWrapper, useFetch, useHoverTip, useTheme } from './ui'

const SIDE = [['You', 'acc'], ['Rival', 'warn']]

export default function Compare({ a, b }) {
  if (!a || !b) return <CompareForm a={a} b={b} />
  return <CompareView a={a} b={b} />
}

function CompareForm({ a = '', b = '' }) {
  const [x, setX] = useState(a)
  const [y, setY] = useState(b)
  const ok = HANDLE_RE.test(x) && HANDLE_RE.test(y)
  return (
    <form className="panel mx-auto mt-10 flex max-w-lg flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (ok) location.hash = `#/compare/${x}/${y}` }}>
      <span className="label">Compare two handles</span>
      {[[x, setX, 'you'], [y, setY, 'rival']].map(([v, set, ph], i) => (
        <label key={ph} className="flex items-center gap-2.5 input" style={{ borderLeft: `3px solid var(--${SIDE[i][1]})` }}>
          <span style={{ color: `var(--${SIDE[i][1]})` }}>&gt;</span>
          <input className="flex-1 bg-transparent outline-none" placeholder={`${ph} handle`} value={v} onChange={(e) => set(e.target.value.trim())} />
        </label>
      ))}
      <button disabled={!ok} className="btn on" style={{ padding: 11 }}>Compare ↵</button>
    </form>
  )
}

function CompareView({ a, b }) {
  const C = useTheme()
  const A = useFetch(`/profile/${encodeURIComponent(a)}?tz=${tzOffset}&full=0`)
  const B = useFetch(`/profile/${encodeURIComponent(b)}?tz=${tzOffset}&full=0`)
  if (A.error || B.error)
    return (
      <div className="grid max-w-2xl gap-3">
        {A.error && <ErrorCard title={`${a}: ${A.error}`} onRetry={A.reload} />}
        {B.error && <ErrorCard title={`${b}: ${B.error}`} onRetry={B.reload} />}
        <a className="sub" href={`#/compare/${a}/`}>edit handles</a>
      </div>
    )
  if (!A.data || !B.data)
    return (
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2"><Skeleton style={{ height: 90 }} /><Skeleton style={{ height: 90 }} /></div>
        <Skeleton style={{ height: 320 }} />
        <span className="sub flex items-center gap-2"><span className="caret" style={{ height: 11, width: 6 }} /> loading both profiles — requests are queued to respect Codeforces’ rate limit</span>
      </div>
    )
  const ps = [A.data, B.data]
  const all = ps.flatMap((p) => p.history.map((h) => h.newRating))
  const lo = all.length ? Math.floor((Math.min(...all) - 80) / 100) * 100 : 0
  const hi = all.length ? Math.ceil((Math.max(...all) + 80) / 100) * 100 : 0
  return (
    <div className="grid gap-4">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
        {ps.map((p, i) => (
          <a key={i} href={`#/u/${p.info.handle}/dash`} className={`panel flex flex-col gap-2 ${i ? 'md:order-3 md:items-end md:text-right' : ''}`}
            style={{ [i ? 'borderRight' : 'borderLeft']: `3px solid var(--${SIDE[i][1]})`, color: 'var(--fg)' }}>
            <span className="label" style={{ color: `var(--${SIDE[i][1]})` }}>{SIDE[i][0]}</span>
            <span className="big" style={{ fontSize: 24 }}><HandleName handle={p.info.handle} rating={p.info.rating} /></span>
            <span className="sub" style={{ color: 'var(--dim)' }}>{p.info.rank ?? 'unrated'} · {p.info.rating ?? '—'} (max {p.info.maxRating ?? '—'})</span>
          </a>
        ))}
        <span className="label text-center md:order-2" style={{ color: 'var(--faint)' }}>vs</span>
      </div>
      <Panel label="Rating overlay" right={<a className="sub" href={`#/compare/${a}/`}>change handles</a>}>
        {all.length ? (
          <div style={{ height: 320 }}>
            <ResponsiveContainer>
              <LineChart margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                {tierBands(lo, hi, C.dark).map((band) => (
                  <ReferenceArea key={band.y1} y1={band.y1} y2={band.y2} fill={band.color} fillOpacity={C.dark ? 0.06 : 0.08} stroke="none" ifOverflow="hidden" />
                ))}
                <CartesianGrid stroke={C.grid} horizontal={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} allowDuplicatedCategory={false} {...axisProps(C)} tickFormatter={(t) => fmtMonth(t / 1000)} minTickGap={40} />
                <YAxis {...axisProps(C)} width={46} domain={[lo, hi]} />
                <Tooltip cursor={{ stroke: C.line2 }} wrapperStyle={chartTipWrapper}
                  content={<ChartTip title={(d, label) => fmtDate(label / 1000)}
                    rows={(d, payload) => payload.map((x) => (
                      <div key={x.name}><span style={{ color: x.color }}>●</span> {x.name} <b style={{ color: rankColor(x.value, C.dark) }}>{x.value}</b></div>
                    ))} />} />
                {ps.map((p, i) => (
                  <Line key={i} name={p.info.handle} data={p.history.map((h) => ({ t: h.ratingUpdateTimeSeconds * 1000, rating: h.newRating }))}
                    dataKey="rating" stroke={C[SIDE[i][1]]} dot={false} strokeWidth={1.6} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty>Neither handle has rated contests.</Empty>}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <HeadToHead ps={ps} />
        <TagDiff ps={ps} />
      </div>
    </div>
  )
}

function stats(p) {
  const h = p.history
  const ok = p.solved.verdicts.find((v) => v.verdict === 'OK')?.count ?? 0
  return [
    ['Current rating', p.info.rating ?? null, 1],
    ['Peak', p.info.maxRating ?? null, 1],
    ['Contests', h.length, 1],
    ['Problems solved', p.solved.total, 1],
    ['Best rank', h.length ? Math.min(...h.map((x) => x.rank)) : null, -1],
    ['Avg Δ / contest', h.length ? Math.round(h.reduce((s, x) => s + x.delta, 0) / h.length) : null, 1],
    ['AC rate %', p.solved.submissions ? Math.round((100 * ok) / p.solved.submissions) : null, 1],
    ['Longest streak', p.activity.longest, 1],
  ]
}

function HeadToHead({ ps }) {
  const [sa, sb] = ps.map(stats)
  const common = ps[0].history.map((x) => [x, ps[1].history.find((y) => y.contestId === x.contestId)]).filter(([, y]) => y)
  const rows = sa.map(([k, x, dir], i) => [k, x, sb[i][1], dir])
  rows.push([`Better rank · ${common.length} shared`, common.filter(([x, y]) => x.rank < y.rank).length, common.filter(([x, y]) => y.rank < x.rank).length, 1])
  const fmt = (v, k) => (v == null ? '—' : k.startsWith('Avg') ? signed(v) : k === 'Longest streak' ? `${v}d` : v.toLocaleString())
  return (
    <Panel label="Head to head">
      {rows.map(([k, x, y, dir], i) => {
        const win = x == null || y == null || x === y ? null : (x - y) * dir > 0 ? 0 : 1
        return (
          <div key={k} className={`grid items-center py-2.5 ${i ? 'row-line' : ''}`} style={{ gridTemplateColumns: '1fr 1.4fr 1fr', fontSize: 12 }}>
            <span className="font-bold tabular-nums" style={{ color: win === 0 ? 'var(--acc)' : 'var(--dim)' }}>{fmt(x, k)}</span>
            <span className="label text-center" style={{ fontSize: 9, color: 'var(--faint)' }}>{k}</span>
            <span className="text-right font-bold tabular-nums" style={{ color: win === 1 ? 'var(--warn)' : 'var(--dim)' }}>{fmt(y, k)}</span>
          </div>
        )
      })}
    </Panel>
  )
}

function TagDiff({ ps }) {
  const maps = ps.map((p) => Object.fromEntries(p.tags.map((t) => [t.tag, t.solved])))
  const tags = [...new Set(ps.flatMap((p) => p.tags.map((t) => t.tag)))]
    .map((tag) => ({ tag, a: maps[0][tag] ?? 0, b: maps[1][tag] ?? 0 }))
    .sort((x, y) => y.a + y.b - (x.a + x.b))
    .slice(0, 14)
  const max = Math.max(1, ...tags.flatMap((t) => [t.a, t.b]))
  const [bind, tipNode] = useHoverTip()
  return (
    <Panel label="Tag differential · problems solved">
      {tipNode}
      {!tags.length ? <Empty>No tag data.</Empty> : tags.map((t) => (
        <div key={t.tag} className="hovrow grid items-center gap-3 px-1 py-1" style={{ gridTemplateColumns: '120px 1fr 48px', fontSize: 10.5 }}
          {...bind(() => (
            <TipBox title={t.tag}>
              <div><span style={{ color: 'var(--acc)' }}>●</span> {ps[0].info.handle} <b>{t.a}</b></div>
              <div><span style={{ color: 'var(--warn)' }}>●</span> {ps[1].info.handle} <b>{t.b}</b></div>
              <div style={{ color: 'var(--faint)' }}>difference {signed(t.a - t.b)}</div>
            </TipBox>
          ))}>
          <span className="truncate text-right" title={t.tag}>{t.tag}</span>
          <div className="flex h-3">
            <div className="flex flex-1 justify-end"><div className="h-full rounded-l-sm" style={{ width: `${(100 * t.a) / max}%`, background: 'var(--acc)' }} /></div>
            <div className="flex-1"><div className="h-full rounded-r-sm" style={{ width: `${(100 * t.b) / max}%`, background: 'var(--warn)' }} /></div>
          </div>
          <span className="text-right font-bold tabular-nums" style={{ color: t.a >= t.b ? 'var(--acc)' : 'var(--warn)' }}>{signed(t.a - t.b)}</span>
        </div>
      ))}
    </Panel>
  )
}
