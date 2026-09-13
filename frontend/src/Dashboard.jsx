import { useState } from 'react'
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { RatingChart } from './charts'
import {
  fmtDate, fmtMonth, isoDay, nextTier, pct, rankColor, shortLang, signed, timeAgo, tzOffset, verdictCode, verdictColor, verdictLabel,
} from './lib'
import Predict from './Predict'
import {
  ChartTip, Empty, ErrorCard, HandleName, Panel, Seg, Skeleton, Stat, TipBox, axisProps, chartTipWrapper, tip, useFetch, useHoverTip, useTheme,
} from './ui'
import Weak from './Weak'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Loads a profile once and renders whichever tab is active. */
export default function Profile({ handle, tab }) {
  const q = useFetch(`/profile/${encodeURIComponent(handle)}?tz=${tzOffset}`)
  if (q.loading) return <Loading />
  if (q.error)
    return (
      <div className="max-w-2xl">
        <ErrorCard title={q.status === 404 ? `handles: ${q.error}` : q.error} onRetry={q.reload}>
          {q.status === 404
            ? <>Codeforces returned <b style={{ color: 'var(--fg)' }}>status: FAILED</b>. Handles are case-insensitive but must match exactly — no spaces, no profile URL.</>
            : q.status === 400 ? 'That doesn’t look like a Codeforces handle.' : 'The backend or Codeforces is unavailable. Cached data is served when there is any.'}
        </ErrorCard>
      </div>
    )
  const p = q.data
  if (tab === 'weak') return <Weak p={p} handle={handle} />
  if (tab === 'predict') return <Predict p={p} />
  return <Dash p={p} />
}

function Loading() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.75fr_1fr]">
        <section className="panel flex gap-5">
          <Skeleton style={{ width: 104, height: 104 }} />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton style={{ width: '40%', height: 12 }} />
            <Skeleton style={{ width: '60%', height: 26 }} />
            <Skeleton style={{ width: '80%', height: 36 }} />
          </div>
        </section>
        <Skeleton className="min-h-40" />
      </div>
      <Skeleton style={{ height: 340 }} />
      <span className="sub flex items-center gap-2">
        <span className="caret" style={{ height: 11, width: 6 }} /> fetching user.info · user.rating · user.status — throttled to 1 req / 2s
      </span>
    </div>
  )
}

function Dash({ p }) {
  const unrated = !p.history.length
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <ProfileCard p={p} />
        <NextRank p={p} />
      </div>
      {unrated ? (
        <Panel label="Rating history">
          <Empty title={p.info.handle} actions={<>
            <a className="btn on" href={`#/u/${p.info.handle}/weak`}>See practice analytics</a>
            <a className="btn" href="https://codeforces.com/contests" target="_blank" rel="noreferrer">Upcoming contests</a>
          </>}>
            Unrated — no contest history yet, so the rating graph and forecast are hidden rather than shown empty.
            Problem analytics below still work from <b style={{ color: 'var(--fg)' }}>{p.solved.submissions} submissions</b>.
          </Empty>
        </Panel>
      ) : (
        <Panel label={`Rating history · ${p.history.length} contests`}
          right={
            <span className="flex gap-3.5 sub">
              <span><span style={{ color: 'var(--warn)' }}>◆</span> peak {p.info.maxRating}</span>
              {p.forecast && <span><span style={{ color: 'var(--acc2)' }}>┅</span> forecast +{p.forecast.points.length} contests</span>}
            </span>
          }>
          <RatingChart history={p.history} forecast={p.forecast} />
          <p className="sub mt-2">hover to inspect · forecast is a rough estimate — see predict</p>
        </Panel>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ContestTable history={p.history} />
        <div className="grid content-start gap-4">
          <ByDifficulty s={p.solved} />
          <Verdicts s={p.solved} />
        </div>
      </div>
      <Heatmap a={p.activity} handle={p.info.handle} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Milestones p={p} />
        <Recent recent={p.recent} />
      </div>
    </div>
  )
}

function ProfileCard({ p }) {
  const C = useTheme()
  const { info, history, solved } = p
  const color = rankColor(info.rating, C.dark)
  const last = history.at(-1)
  const [broken, setBroken] = useState(false)
  const noAvatar = broken || !info.titlePhoto || info.titlePhoto.includes('no-title')
  return (
    <section className="panel gridbg flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="grid flex-none place-items-center overflow-hidden rounded-lg" style={{ width: 104, height: 104, border: '1px solid var(--line2)', background: 'var(--panel2)' }}>
        {noAvatar
          ? <span className="big" style={{ fontSize: 30, color }}>{info.handle.slice(0, 2).toUpperCase()}</span>
          : <img src={info.titlePhoto} alt={`${info.handle} avatar`} className="h-full w-full object-cover" onError={() => setBroken(true)} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <span className="label" style={{ color }}>{info.rank ?? 'unrated'}</span>
        <a href={`https://codeforces.com/profile/${info.handle}`} target="_blank" rel="noreferrer" className="big truncate" style={{ fontSize: 34, letterSpacing: '-.01em' }}>
          <HandleName handle={info.handle} rating={info.rating} />
        </a>
        <div className="flex flex-wrap gap-x-7 gap-y-3">
          <Stat label="Rating" value={info.rating ?? '—'} color={color} />
          <Stat label="Max" value={info.maxRating ?? '—'} color={rankColor(info.maxRating, C.dark)} />
          <Stat label="Contest" value={last ? signed(last.delta) : '—'} color={last ? (last.delta >= 0 ? 'var(--acc)' : 'var(--bad)') : undefined} />
          <Stat label="Solved" value={solved.total} />
        </div>
        <div className="flex flex-wrap gap-2">
          {[info.country, info.organization, info.friendOfCount != null && `${info.friendOfCount} friends`, `contrib ${signed(info.contribution)}`]
            .filter(Boolean).map((c) => <span key={c} className="chip">{c}</span>)}
          <a className="chip" href={`#/compare/${info.handle}/`}>compare ↗</a>
        </div>
      </div>
    </section>
  )
}

function NextRank({ p }) {
  const C = useTheme()
  const r = p.info.rating
  const next = nextTier(r)
  const slope = p.forecast?.slopePerContest ?? 0
  const blocker = p.weakTopics.ranked.find((t) => t.weak) ?? p.weakTopics.ranked[0]
  const att = p.milestones.attendance
  const [bind, tipNode] = useHoverTip()
  return (
    <section className="panel flex flex-col gap-3.5">
      {tipNode}
      <div className="flex items-baseline justify-between">
        <span className="label">Next rank</span>
        {att && <span className="sub">{pct(att.rate)} attendance</span>}
      </div>
      {next ? (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="big" style={{ fontSize: 22, color: rankColor(next.min, C.dark) }}>{next.name}</span>
            <span className="sub" style={{ color: 'var(--dim)', fontSize: 11 }}>at {next.min}</span>
          </div>
          <div className="hov relative h-2.5 overflow-hidden rounded-md" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}
            {...bind(() => (
              <TipBox title={`${next.name} at ${next.min}`}>
                {r == null ? <div>unrated — play a rated contest</div> : (
                  <div>
                    <b style={{ color: rankColor(r, C.dark) }}>{r}</b> / {next.min} · {pct(Math.min(1, Math.max(0, (r - next.prev) / (next.min - next.prev))))} of this tier
                  </div>
                )}
              </TipBox>
            ))}>
            <div className="h-full" style={{ width: r == null ? '0%' : pct(Math.min(1, Math.max(0, (r - next.prev) / (next.min - next.prev)))), background: `linear-gradient(90deg, ${rankColor(r, C.dark)}, ${rankColor(next.min, C.dark)})` }} />
          </div>
          <div className="flex justify-between" style={{ fontSize: 10.5, color: 'var(--dim)' }}>
            {r == null
              ? <span>enter a rated contest to get a rating</span>
              : <>
                  <span><b style={{ color: 'var(--fg)' }}>{next.min - r}</b> points to go</span>
                  <span>{slope > 0 ? <>≈ <b style={{ color: 'var(--acc)' }}>{Math.ceil((next.min - r) / slope)}</b> contests at trend</> : 'trend flat or falling'}</span>
                </>}
          </div>
        </>
      ) : (
        <span className="big" style={{ fontSize: 22, color: rankColor(r, C.dark) }}>top tier · +{r - 3000} above LGM</span>
      )}
      <div className="mt-auto flex flex-col gap-1.5 pt-3 row-line">
        <span className="label">Biggest blocker</span>
        {blocker ? (
          <a href={`#/u/${p.info.handle}/weak`} className="flex flex-wrap items-center gap-2.5">
            <span style={{ fontSize: 13, color: 'var(--bad)' }}>{blocker.tag}</span>
            <span className="sub">{pct(blocker.ratio)} solve rate · {blocker.attempted} attempted</span>
          </a>
        ) : <span className="sub">not enough attempts per tag yet</span>}
      </div>
    </section>
  )
}

const COLS = [['name', 'Contest'], ['t', 'Date'], ['rank', 'Rank'], ['new', 'Old → new'], ['delta', 'Δ']]

function ContestTable({ history }) {
  const C = useTheme()
  const [q, setQ] = useState('')
  const [sign, setSign] = useState('all')
  const [sort, setSort] = useState({ k: 't', dir: -1 })
  const rows = history
    .map((h) => ({ id: h.contestId, name: h.contestName, t: h.ratingUpdateTimeSeconds, rank: h.rank, old: h.oldRating, new: h.newRating, delta: h.delta }))
    .filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) && (sign === 'all' || (sign === 'up' ? r.delta >= 0 : r.delta < 0)))
    .sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : a[sort.k] < b[sort.k] ? -1 : 0) * sort.dir)
  return (
    <Panel label="Contest history"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <input className="input" style={{ padding: '5px 8px', fontSize: 10.5, width: 130 }} placeholder="filter…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Seg value={sign} onChange={setSign} options={[['all', 'All'], ['up', 'Up'], ['down', 'Down']]} />
        </div>
      }>
      {!history.length ? <Empty>No rated contests yet.</Empty> : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full border-collapse" style={{ fontSize: 11.5 }}>
            <thead className="sticky top-0" style={{ background: 'var(--panel)' }}>
              <tr>
                {COLS.map(([k, label], i) => (
                  <th key={k} className={`py-2 font-normal ${i > 1 ? 'text-right' : 'text-left'}`}>
                    <button onClick={() => setSort({ k, dir: sort.k === k ? -sort.dir : -1 })} className="label" style={{ fontSize: 9.5, color: sort.k === k ? 'var(--fg)' : 'var(--faint)' }}>
                      {label}{sort.k === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="row-line">
                  <td className="max-w-[320px] truncate py-2 pr-3">
                    <a href={`https://codeforces.com/contest/${r.id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--fg)', fontWeight: 700 }}>{r.name}</a>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap" style={{ color: 'var(--faint)', fontSize: 10.5 }}>{fmtDate(r.t)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.rank}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums" style={{ color: 'var(--dim)' }}>
                    <span style={{ color: rankColor(r.old, C.dark) }}>{r.old}</span> → <span style={{ color: rankColor(r.new, C.dark) }}>{r.new}</span>
                  </td>
                  <td className="py-2 text-right font-bold tabular-nums" style={{ color: r.delta >= 0 ? 'var(--acc)' : 'var(--bad)' }}>{signed(r.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function ByDifficulty({ s }) {
  const C = useTheme()
  const data = s.byRating.map((r) => ({ ...r, x: r.rating === 'unrated' ? 'unrated' : String(r.rating) }))
  return (
    <Panel label="Solved by difficulty" right={<span className="sub">{s.total} of {s.attempted} attempted</span>}>
      {!data.length ? <Empty>No solved problems yet.</Empty> : (
        <div style={{ height: 170 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 14, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="x" {...axisProps(C)} tick={{ fill: C.fg, fontSize: 11, fontWeight: 500, fontFamily: 'JetBrains Mono' }}
                interval={data.length > 14 ? 1 : 0} tickMargin={6} height={26} />
              <Tooltip cursor={tip.cursor} wrapperStyle={chartTipWrapper}
                content={<ChartTip title={(d) => (d.x === 'unrated' ? 'unrated problems' : `rating ${d.x}`)}
                  rows={(d) => <div><b style={{ color: rankColor(d.rating === 'unrated' ? null : d.rating, C.dark) }}>{d.count}</b> solved · {pct(d.count / s.total)} of total</div>} />} />
              <Bar dataKey="count" name="solved" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {data.map((r) => <Cell key={r.x} fill={rankColor(r.rating === 'unrated' ? null : r.rating, C.dark)} />)}
                {data.length <= 16 && <LabelList dataKey="count" position="top" style={{ fill: C.faint, fontSize: 8.5, fontFamily: 'JetBrains Mono' }} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}

function Verdicts({ s }) {
  const C = useTheme()
  return (
    <Panel>
      {!s.verdicts.length ? <Empty>No submissions.</Empty> : (
        <div className="flex items-center gap-5">
          <div className="flex-none" style={{ width: 128, height: 128 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={s.verdicts} dataKey="count" nameKey="verdict" innerRadius="70%" outerRadius="100%" paddingAngle={1} stroke="none" isAnimationActive={false}>
                  {s.verdicts.map((v) => <Cell key={v.verdict} fill={verdictColor(v.verdict, C)} />)}
                </Pie>
                <Tooltip wrapperStyle={chartTipWrapper}
                  content={<ChartTip title={(d) => verdictLabel(d.verdict)}
                    rows={(d) => <div><b style={{ color: verdictColor(d.verdict, C) }}>{d.count}</b> submissions · {(100 * d.count / s.submissions).toFixed(1)}%</div>} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="label mb-1">Verdicts · {s.submissions.toLocaleString()}</span>
            {s.verdicts.slice(0, 6).map((v) => (
              <div key={v.verdict} className="flex items-center gap-2" style={{ fontSize: 10.5 }}>
                <span className="size-2 flex-none rounded-sm" style={{ background: verdictColor(v.verdict, C) }} />
                <span className="flex-1 truncate" style={{ color: 'var(--dim)' }}>{verdictLabel(v.verdict)}</span>
                <span className="tabular-nums">{(100 * v.count / s.submissions).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

function Heatmap({ a, handle }) {
  const C = useTheme()
  const [bind, tipNode, hov] = useHoverTip()
  const [picked, setPicked] = useState(null)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - 364 - start.getDay())
  const cells = []
  for (let d = new Date(start), i = 0; d <= today; d.setDate(d.getDate() + 1), i++) {
    const key = isoDay(d)
    cells.push({ key, n: a.daily[key] ?? 0, ac: a.dailyAc?.[key] ?? 0, x: Math.floor(i / 7), y: d.getDay(), m: d.getMonth(), date: d.getDate() })
  }
  const max = Math.max(1, ...cells.map((c) => c.n))
  // ponytail: 4 levels relative to your own busiest day, so low-volume years still show contrast
  const lvl = (v) => (v ? Math.max(0.25, Math.ceil((4 * v) / max) / 4) : 0)
  const S = 14 // cell pitch in viewBox units; the SVG scales to the panel width
  const L = 28 // weekday label gutter
  const W = L + (cells.at(-1).x + 1) * S
  const H = 7 * S + 18
  const months = cells.filter((c) => c.y === 0 && c.date <= 7).filter((c, i, arr) => !i || c.x - arr[i - 1].x >= 3)
  const nice = (key) => new Date(`${key}T00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const pick = (c) => setPicked(picked?.key === c.key || !c.n ? null : c)
  const dayTip = (c) => (
    <TipBox title={`${nice(c.key)}${c.key === todayKey ? ' · today' : ''}`}>
      {c.n ? (
        <>
          <div>
            <b style={{ color: 'var(--acc2)' }}>{c.n}</b> submission{c.n === 1 ? '' : 's'} · <b style={{ color: 'var(--acc)' }}>{c.ac}</b> AC
            <span style={{ color: 'var(--faint)' }}> · {Math.round((100 * c.ac) / c.n)}%</span>
          </div>
          <div style={{ color: 'var(--faint)' }}>click to list submissions</div>
        </>
      ) : <div style={{ color: 'var(--faint)' }}>no submissions</div>}
    </TipBox>
  )
  const total = cells.reduce((s, c) => s + c.n, 0)
  const totalAc = cells.reduce((s, c) => s + c.ac, 0)
  const active = cells.filter((c) => c.n).length
  const best = cells.reduce((m, c) => (c.n > m.n ? c : m), cells[0])
  const todayKey = isoDay(today)
  return (
    <Panel label="Submission activity · last 12 months"
      right={
        <span className="sub flex items-center gap-3">
          <span>shade = submissions</span>
          <span><span style={{ color: 'var(--acc)' }}>■</span> had an AC</span>
          <span><span style={{ color: 'var(--bad)' }}>■</span> no AC</span>
        </span>
      }>
      <div className="overflow-x-auto">
        <div className="relative" style={{ minWidth: 640 }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block" role="grid" aria-label="Daily submission heatmap — click a day to list its submissions">
            {['Mon', 'Wed', 'Fri'].map((d, i) => (
              <text key={d} x={0} y={(2 * i + 1) * S + 9} fontSize={8} fill={C.faint} fontFamily="JetBrains Mono">{d}</text>
            ))}
            {cells.map((c) => {
              const on = picked?.key === c.key || hov?.key === c.key
              const v = c.n
              return (
                <rect key={c.key} x={L + c.x * S} y={c.y * S} width={S - 3} height={S - 3} rx={2}
                  fill={v ? (c.ac ? C.acc : C.bad) : C.cellbg} fillOpacity={v ? lvl(v) : 1}
                  stroke={on ? C.fg : c.key === todayKey ? C.faint : 'none'} strokeWidth={on ? 1.4 : 0.8}
                  style={{ cursor: c.n ? 'pointer' : 'default', outline: 'none', transition: 'fill-opacity .2s' }}
                  tabIndex={c.n ? 0 : -1} aria-label={`${c.n} submissions, ${c.ac} accepted, ${c.key}`}
                  {...bind(() => dayTip(c), c.key)}
                  onClick={() => pick(c)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(c))} />
              )
            })}
            {months.map((c) => (
              <text key={c.key} x={L + c.x * S} y={7 * S + 12} fontSize={8.5} fill={C.faint} fontFamily="JetBrains Mono">{MONTHS[c.m]}</text>
            ))}
          </svg>
          {tipNode}
        </div>
      </div>
      <div className="sub mt-2 flex flex-wrap items-center justify-between gap-2">
        <span>hover a day for details · click to list its submissions</span>
        <span className="flex items-center gap-1">
          less {[0, 0.25, 0.5, 0.75, 1].map((o) => <span key={o} className="inline-block size-2.5 rounded-sm" style={{ background: o ? C.acc : C.cellbg, opacity: o || 1 }} />)} more
          <span className="ml-1">(max {max}/day)</span>
        </span>
      </div>
      {picked && <DayDetail handle={handle} cell={picked} title={nice(picked.key)} onClose={() => setPicked(null)} />}
      <div className="mt-4 grid grid-cols-2 gap-4 pt-4 row-line sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Submissions" value={total} size={18} hint={`${totalAc} accepted`} />
        <Stat label="Active days" value={active} size={18} hint={`${Math.round((100 * active) / cells.length)}% of days`} />
        <Stat label="Avg / active day" value={active ? (total / active).toFixed(1) : '—'} size={18} />
        <button className="text-left" disabled={!best.n} onClick={() => best.n && setPicked(best)}>
          <Stat label="Best day" value={best.n || '—'} size={18} hint={best.n ? `${fmtMonth(new Date(`${best.key}T00:00`) / 1000)} · click to open` : null} />
        </button>
        <Stat label="Streak" value={`${a.current}d`} size={18} color="var(--acc)" hint={`longest ${a.longest}d`} />
        <Stat label="Solve streak" value={`${a.currentSolve}d`} size={18} hint={`longest ${a.longestSolve}d`} />
      </div>
    </Panel>
  )
}

function DayDetail({ handle, cell, title, onClose }) {
  const q = useFetch(`/day/${encodeURIComponent(handle)}?date=${cell.key}&tz=${tzOffset}`)
  return (
    <div className="mt-4 rounded-lg p-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="label" style={{ color: 'var(--fg)' }}>{title} · {cell.n} submissions · <span style={{ color: 'var(--acc)' }}>{cell.ac} AC</span></span>
        <button className="btn" style={{ padding: '4px 8px' }} onClick={onClose} aria-label="Close day details">✕</button>
      </div>
      {q.loading && <Skeleton style={{ height: 60 }} />}
      {q.error && <ErrorCard title={q.error} onRetry={q.reload} />}
      {q.data && (
        <div className="flex max-h-[300px] flex-col overflow-y-auto">
          {q.data.map((r, i) => <SubRow key={r.id} r={r} first={!i} time />)}
        </div>
      )}
    </div>
  )
}

function SubRow({ r, first, time }) {
  const C = useTheme()
  return (
    <div className={`flex items-center gap-3 py-2.5 ${first ? '' : 'row-line'}`} style={{ fontSize: 11.5 }}>
      <span className="w-10 flex-none font-bold" style={{ color: verdictColor(r.verdict, C), fontSize: 10.5 }} title={verdictLabel(r.verdict)}>{verdictCode(r.verdict)}</span>
      <a className="flex-1 truncate" style={{ color: 'var(--fg)' }} target="_blank" rel="noreferrer"
        href={r.contestId ? `https://codeforces.com/contest/${r.contestId}/submission/${r.id}` : undefined}>
        {r.contestId}{r.index} · {r.name}
      </a>
      {r.rating && <span className="sub" style={{ color: rankColor(r.rating, C.dark) }}>{r.rating}</span>}
      <span className="sub whitespace-nowrap">
        {shortLang(r.lang)} · {time ? new Date(r.t * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : timeAgo(r.t)}
      </span>
    </div>
  )
}

function Milestones({ p }) {
  const C = useTheme()
  const m = p.milestones
  const items = [
    ...m.crossings.map((c) => [rankColor(c.rating, C.dark), `first reached ${c.title} (${c.rating})`, fmtMonth(c.t)]),
    p.info.maxRating && [rankColor(p.info.maxRating, C.dark), `peak rating ${p.info.maxRating} — ${p.info.maxRank}`, null],
    [C.warn, `longest solve streak · ${m.longestSolveStreak} days`, null],
    m.attendance && [C.faint, `contest attendance ${m.attendance.attended} / ~${m.attendance.held} rated rounds`, 'all time'],
  ].filter(Boolean)
  return (
    <Panel label="Milestones">
      <div className="flex max-h-[340px] flex-col overflow-y-auto">
        {items.map(([c, text, right], i) => (
          <div key={i} className={`flex items-center gap-3 py-2.5 ${i ? 'row-line' : ''}`} style={{ fontSize: 11.5 }}>
            <span className="size-2 flex-none rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
            <span className="flex-1">{text}</span>
            {right && <span className="sub">{right}</span>}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function Recent({ recent }) {
  return (
    <Panel label="Recent submissions">
      {!recent.length ? <Empty>No submissions yet.</Empty> : (
        <div className="flex max-h-[340px] flex-col overflow-y-auto">
          {recent.map((r, i) => <SubRow key={r.id} r={r} first={!i} />)}
        </div>
      )}
    </Panel>
  )
}
