import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, fmtDate, fmtMonth, isoDay, signed, timeAgo, tzOffset } from './lib'
import {
  PLAT, PLATFORMS, combine, contestsByMonth, CORE, download, gcalLink, icsFor, insights, loadAccounts, pColor, parseSpec, practiceLinks,
  saveAccounts, toSpec,
} from './platforms'
import { ChartTip, Empty, ErrorCard, Panel, Seg, Skeleton, Stat, TipBox, axisProps, chartTipWrapper, useFetch, useHoverTip, useTheme } from './ui'

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}

/** #/hub[/<cf:x,lc:y>[/<view>]] — view is 'all', a platform id, or 'connect'. */
export default function Hub({ spec, view = 'all' }) {
  const acc = useMemo(() => (spec ? parseSpec(spec) : loadAccounts()), [spec])
  const ids = PLATFORMS.filter((p) => acc[p.id]).map((p) => p.id)
  if (view === 'connect' || !ids.length) return <Connect initial={acc} />
  return <HubView acc={acc} ids={ids} view={PLAT[view] && acc[view] ? view : 'all'} />
}

function Connect({ initial }) {
  const [v, setV] = useState(() => ({ ...loadAccounts(), ...initial }))
  const bad = PLATFORMS.filter((p) => v[p.id] && !p.re.test(v[p.id]))
  const any = PLATFORMS.some((p) => v[p.id])
  function go(e) {
    e.preventDefault()
    if (bad.length || !any) return
    const clean = Object.fromEntries(PLATFORMS.filter((p) => v[p.id]).map((p) => [p.id, v[p.id]]))
    saveAccounts(clean)
    location.hash = `#/hub/${toSpec(clean)}/all`
  }
  return (
    <form className="panel mx-auto mt-6 flex max-w-xl flex-col gap-3" onSubmit={go}>
      <span className="label">Connect your judges</span>
      <p style={{ color: 'var(--dim)', lineHeight: 1.7, fontSize: 11.5 }}>
        Add a username for any platform you use. Leave the rest blank. They’re saved in this browser only, and the hub link you get is shareable.
      </p>
      {PLATFORMS.map((p) => (
        <label key={p.id} className="input flex items-center gap-2.5" style={{ borderLeft: `3px solid ${pColor(p.id)}` }}>
          <span className="w-24 flex-none" style={{ color: 'var(--fg)' }}>{p.name}</span>
          <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={`e.g. ${p.ph}`} value={v[p.id] ?? ''}
            aria-label={`${p.name} username`} aria-invalid={bad.includes(p)} onChange={(e) => setV({ ...v, [p.id]: e.target.value.trim() })} />
          {bad.includes(p) && <span className="sub" style={{ color: 'var(--bad)' }}>invalid</span>}
        </label>
      ))}
      <button disabled={!any || bad.length > 0} className="btn on" style={{ padding: 11 }}>Build my dashboard ↵</button>
      <span className="sub">Profiles are fetched through the visualizer backend; each judge is queried politely, so a first load can take a few seconds.</span>
    </form>
  )
}

/** Fetch every connected profile in parallel; each resolves independently so one slow judge doesn't block the rest. */
function useProfiles(acc, ids) {
  const [s, setS] = useState({})
  const key = toSpec(acc)
  const load = (id, isLive = () => true) => {
    setS((x) => ({ ...x, [id]: { loading: true } }))
    api(`/platform/${id}/${encodeURIComponent(acc[id])}?tz=${tzOffset}`).then(
      (data) => isLive() && setS((x) => ({ ...x, [id]: { data } })),
      (e) => isLive() && setS((x) => ({ ...x, [id]: { error: e.message, status: e.status } })),
    )
  }
  useEffect(() => {
    let live = true
    for (const id of ids) load(id, () => live)
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return [s, load]
}

function HubView({ acc, ids, view }) {
  const [s, reload] = useProfiles(acc, ids)
  const spec = toSpec(acc)
  const loaded = ids.filter((id) => s[id]?.data).map((id) => s[id].data)
  const pending = ids.filter((id) => !s[id] || s[id].loading)
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (Object.keys(acc).length) saveAccounts(acc) }, [spec]) // eslint-disable-line react-hooks/exhaustive-deps
  const share = () => {
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/hub/${spec}/all`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`#/hub/${spec}/all`} className={`btn ${view === 'all' ? 'on' : ''}`}>Combined</a>
        {ids.map((id) => (
          <a key={id} href={`#/hub/${spec}/${id}`} className={`btn flex items-center gap-1.5 ${view === id ? 'on' : ''}`}>
            <span className="inline-block size-2 rounded-full" style={{ background: pColor(id), opacity: s[id]?.data ? 1 : 0.35 }} />
            {PLAT[id].name}
            {s[id]?.error && <span style={{ color: 'var(--bad)' }} title={s[id].error}>!</span>}
          </a>
        ))}
        <div className="flex-1" />
        <span className="sub flex flex-wrap items-center gap-3">
          <a href={`#/hub/${spec}/connect`}>edit accounts</a>
          <a href="#" onClick={(e) => { e.preventDefault(); share() }}>{copied ? 'link copied' : 'copy link'}</a>
          {loaded.length > 0 && (
            <a href="#" onClick={(e) => { e.preventDefault(); download(`coding-profile-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ accounts: acc, profiles: loaded }, null, 2)) }}>export json</a>
          )}
        </span>
      </div>
      {pending.length > 0 && (
        <span className="sub flex items-center gap-2">
          <span className="caret" style={{ height: 11, width: 6 }} /> fetching {pending.map((id) => PLAT[id].name).join(' · ')}
        </span>
      )}
      {ids.filter((id) => s[id]?.error).map((id) => (
        <ErrorCard key={id} title={`${PLAT[id].name} · ${acc[id]}: ${s[id].error}`} onRetry={() => reload(id)}>
          {s[id].status === 404 ? 'Check the username, or edit your accounts.' : 'The judge may be down or blocking requests; cached data is used when available.'}
        </ErrorCard>
      ))}
      {view === 'all'
        ? loaded.length ? <Combined ps={loaded} spec={spec} /> : pending.length ? <Skeleton style={{ height: 340 }} /> : null
        : s[view]?.data ? <PlatformView p={s[view].data} /> : s[view]?.error ? null : <Skeleton style={{ height: 340 }} />}
    </div>
  )
}

// ---------------- combined ----------------

function Combined({ ps, spec }) {
  const m = useMemo(() => combine(ps), [ps])
  const notes = useMemo(() => insights(ps, m), [ps, m])
  return (
    <>
      <section className="panel grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Problems solved" value={m.solved.toLocaleString()} hint={`across ${ps.length} platform${ps.length > 1 ? 's' : ''}`} />
        <Stat label="Contests" value={m.contests.length} hint={`${m.contests.filter((c) => c.t > Date.now() / 1000 - 365 * 864e2).length} in the last year`} />
        <Stat label="Streak" value={`${m.streak.current}d`} color="var(--acc)" hint={`longest ${m.streak.longest}d (last year)`} />
        <Stat label="Active days" value={m.activeDays} hint="last 12 months" />
        <Stat label="Submissions" value={m.subsYear.toLocaleString()} hint="last 12 months" />
        <Stat label="Last active" value={m.lastActive ? rel(m.lastActive) : '—'} hint={m.lastActive ? fmtDate(new Date(`${m.lastActive}T00:00`) / 1000) : 'no recent activity'} />
      </section>

      <div className={`grid gap-4 sm:grid-cols-2 ${ps.length > 2 ? 'xl:grid-cols-4' : ''}`}>
        {ps.map((p) => <PlatformCard key={p.platform} p={p} spec={spec} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Heatmap daily={m.daily} ids={ps.map((p) => p.platform)} />
        <Panel label="Insights">
          {notes.length ? (
            <ul className="flex flex-col gap-2.5" style={{ fontSize: 11.5, lineHeight: 1.65 }}>
              {notes.map((n) => <li key={n} className="flex gap-2"><span style={{ color: 'var(--acc)' }}>›</span><span>{n}</span></li>)}
            </ul>
          ) : <Empty>Not enough data yet for insights.</Empty>}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeeklyGoal m={m} />
        <SolvedShare ps={ps} />
      </div>

      {ps.some((p) => p.contests.length) && <RatingGrid ps={ps.filter((p) => p.contests.length)} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <DifficultyMix ps={ps} />
        <ContestsPerMonth contests={m.contests} ids={ps.map((p) => p.platform)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Topics m={m} ids={ps.filter((p) => p.tags.length).map((p) => p.platform)} />
        <Practice m={m} ps={ps} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Upcoming compact filter={ps.map((p) => p.platform)} />
        <RecentFeed items={m.recent} />
      </div>
    </>
  )
}

const rel = (day) => {
  const d = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(`${day}T00:00`)) / 864e5)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`
}

function PlatformCard({ p, spec }) {
  const last = p.contests.at(-1)
  return (
    <a href={`#/hub/${spec}/${p.platform}`} className="panel flex flex-col gap-3" style={{ borderTop: `3px solid ${pColor(p.platform)}`, color: 'var(--fg)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="label" style={{ color: 'var(--fg)' }}>{p.name}</span>
        <span className="sub truncate">{p.handle}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Rating" value={p.rating ?? '—'} size={20} hint={p.title ?? (p.rating == null ? 'unrated' : 'rated')} />
        <Stat label="Max" value={p.maxRating ?? '—'} size={20} />
        <Stat label="Solved" value={p.solved.toLocaleString()} size={20} hint={`${p.contests.length} contests`} />
      </div>
      {last && (
        <span className="sub truncate">
          last contest {timeAgo(last.t)} · {last.delta != null && <b style={{ color: last.delta >= 0 ? 'var(--acc)' : 'var(--bad)' }}>{signed(last.delta)}</b>}
        </span>
      )}
    </a>
  )
}

/** Last-12-months calendar; shade = total submissions, tooltip splits by platform. With one id, shades in that platform's colour. */
function Heatmap({ daily, ids, label = 'Combined activity · last 12 months' }) {
  const C = useTheme()
  const [bind, tipNode, hov] = useHoverTip()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - 364 - start.getDay())
  const cells = []
  for (let d = new Date(start), i = 0; d <= today; d.setDate(d.getDate() + 1), i++) {
    const key = isoDay(d)
    const by = daily[key] ?? {}
    cells.push({ key, by, n: ids.reduce((s, id) => s + (by[id] ?? 0), 0), x: Math.floor(i / 7), y: d.getDay(), m: d.getMonth(), date: d.getDate() })
  }
  const max = Math.max(1, ...cells.map((c) => c.n))
  const lvl = (v) => (v ? Math.max(0.25, Math.ceil((4 * v) / max) / 4) : 0)
  const fill = ids.length === 1 ? C[`p-${ids[0]}`] : C.acc
  const S = 14, L = 28
  const W = L + (cells.at(-1).x + 1) * S
  const H = 7 * S + 18
  const months = cells.filter((c) => c.y === 0 && c.date <= 7).filter((c, i, arr) => !i || c.x - arr[i - 1].x >= 3)
  const nice = (key) => new Date(`${key}T00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <Panel label={label} right={
      <span className="sub flex items-center gap-1.5">
        less {[0, 0.25, 0.5, 0.75, 1].map((o) => <span key={o} className="inline-block size-2.5 rounded-sm" style={{ background: o ? fill : C.cellbg, opacity: o || 1 }} />)} more
      </span>}>
      {tipNode}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block" style={{ minWidth: 640 }} role="img" aria-label={`${label}: ${cells.filter((c) => c.n).length} active days`}>
          {['Mon', 'Wed', 'Fri'].map((d, i) => <text key={d} x={0} y={(2 * i + 1) * S + 9} fontSize={8} fill={C.faint} fontFamily="JetBrains Mono">{d}</text>)}
          {cells.map((c) => (
            <rect key={c.key} x={L + c.x * S} y={c.y * S} width={S - 3} height={S - 3} rx={2}
              fill={c.n ? fill : C.cellbg} fillOpacity={c.n ? lvl(c.n) : 1}
              stroke={hov?.key === c.key ? C.fg : 'none'} strokeWidth={1}
              {...bind(() => (
                <TipBox title={nice(c.key)}>
                  {c.n ? ids.filter((id) => c.by[id]).map((id) => (
                    <div key={id}><span style={{ color: pColor(id) }}>■</span> {PLAT[id].name} <b>{c.by[id]}</b></div>
                  )) : <div style={{ color: 'var(--faint)' }}>no activity</div>}
                </TipBox>
              ), c.key)} />
          ))}
          {months.map((c) => (
            <text key={c.key} x={L + c.x * S} y={7 * S + 12} fontSize={8} fill={C.faint} fontFamily="JetBrains Mono">
              {new Date(`${c.key}T00:00`).toLocaleDateString(undefined, { month: 'short' })}
            </text>
          ))}
        </svg>
      </div>
      {ids.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-3 sub">
          {ids.map((id) => {
            const n = cells.reduce((s, c) => s + (c.by[id] ?? 0), 0)
            return <span key={id}><span style={{ color: pColor(id) }}>■</span> {PLAT[id].name} · {n.toLocaleString()} submissions</span>
          })}
        </div>
      )}
    </Panel>
  )
}

function WeeklyGoal({ m }) {
  const [goal, setGoal] = useState(() => Number(store.get('weeklyGoal', '20')) || 20)
  const done = m.week.reduce((s, d) => s + d.n, 0)
  const pctDone = Math.min(1, done / goal)
  const dayMax = Math.max(1, ...m.week.map((d) => d.n))
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const upd = (g) => { setGoal(g); store.set('weeklyGoal', String(g)) }
  return (
    <Panel label="Weekly goal · submissions, all platforms" right={
      <label className="sub flex items-center gap-2">target
        <input type="number" min={1} max={500} value={goal} onChange={(e) => upd(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
          className="input w-16" style={{ padding: '4px 6px' }} aria-label="Weekly submission target" />
      </label>}>
      <div className="flex items-baseline gap-2">
        <span className="big" style={{ fontSize: 34, color: pctDone >= 1 ? 'var(--acc)' : 'var(--fg)' }}>{done}</span>
        <span style={{ color: 'var(--dim)' }}>/ {goal} this week</span>
        <span className="sub ml-auto">{pctDone >= 1 ? '✓ goal reached' : `${goal - done} to go`}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded" style={{ background: 'var(--cellbg)' }} role="progressbar" aria-valuenow={done} aria-valuemax={goal}>
        <div className="h-full rounded" style={{ width: `${pctDone * 100}%`, background: 'var(--acc)', transition: 'width .3s' }} />
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2">
        {names.map((n, i) => {
          const d = m.week[i]
          return (
            <div key={n} className="flex flex-col items-center gap-1.5">
              <div className="flex h-16 w-full items-end">
                <div className="w-full rounded-t" title={d ? `${d.n} on ${n}` : 'upcoming'}
                  style={{ height: d?.n ? `${Math.max(8, (100 * d.n) / dayMax)}%` : 2, background: d?.n ? 'var(--acc2)' : 'var(--line2)' }} />
              </div>
              <span className="sub" style={{ color: d?.day === isoDay(new Date()) ? 'var(--fg)' : undefined }}>{n}</span>
              <span className="sub tabular-nums">{d ? d.n : ''}</span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function SolvedShare({ ps }) {
  const total = ps.reduce((s, p) => s + p.solved, 0)
  const max = Math.max(1, ...ps.map((p) => p.solved))
  return (
    <Panel label="Solved by platform">
      <div className="flex flex-col gap-3">
        {[...ps].sort((a, b) => b.solved - a.solved).map((p) => (
          <div key={p.platform} className="grid items-center gap-3" style={{ gridTemplateColumns: '92px 1fr 88px', fontSize: 11.5 }}>
            <span className="truncate">{p.name}</span>
            <div className="h-3.5 rounded-r" style={{ width: `${Math.max(1, (100 * p.solved) / max)}%`, background: pColor(p.platform) }} />
            <span className="text-right tabular-nums"><b>{p.solved.toLocaleString()}</b> <span className="sub">{total ? Math.round((100 * p.solved) / total) : 0}%</span></span>
          </div>
        ))}
      </div>
      <p className="sub mt-4">Each judge counts distinct accepted problems its own way; CodeChef’s figure is read from its profile page.</p>
    </Panel>
  )
}

function RatingGrid({ ps }) {
  return (
    <Panel label="Rating journeys · each on its own scale">
      <div className={`grid gap-4 ${ps.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {ps.map((p) => (
          <div key={p.platform} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="label" style={{ color: 'var(--fg)' }}><span style={{ color: pColor(p.platform) }}>■</span> {p.name}</span>
              <span className="sub">{p.rating ?? '—'} now · peak {p.maxRating ?? '—'}</span>
            </div>
            <RatingLine p={p} height={170} />
          </div>
        ))}
      </div>
    </Panel>
  )
}

function RatingLine({ p, height }) {
  const C = useTheme()
  const data = p.contests.filter((c) => c.rating != null).map((c) => ({ ...c, ms: c.t * 1000 }))
  if (!data.length) return <Empty>No rated contests.</Empty>
  const vals = data.map((d) => d.rating)
  const lo = Math.floor((Math.min(...vals) - 50) / 100) * 100
  const hi = Math.ceil((Math.max(...vals) + 50) / 100) * 100
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="ms" type="number" scale="time" domain={['dataMin', 'dataMax']} {...axisProps(C)} tickFormatter={(t) => fmtMonth(t / 1000)} minTickGap={40} />
          <YAxis domain={[lo, hi]} width={46} {...axisProps(C)} />
          <Tooltip cursor={{ stroke: C.line2 }} wrapperStyle={chartTipWrapper}
            content={<ChartTip title={(d) => `${fmtDate(d.t)}${d.rank ? ` · rank ${d.rank}` : ''}`}
              rows={(d) => (
                <>
                  <div className="max-w-72 truncate font-bold">{d.name}</div>
                  <div><b>{d.rating}</b>{d.delta != null && <> <b style={{ color: d.delta >= 0 ? 'var(--acc)' : 'var(--bad)' }}>{signed(d.delta)}</b></>}
                    {d.performance ? <span style={{ color: 'var(--faint)' }}> · perf {d.performance}</span> : null}</div>
                </>
              )} />} />
          <Line dataKey="rating" stroke={C[`p-${p.platform}`]} strokeWidth={2} dot={data.length < 60 ? { r: 2, fill: C[`p-${p.platform}`], strokeWidth: 0 } : false}
            activeDot={{ r: 4, stroke: C.panel, strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const LEVEL_OP = { easy: 0.4, medium: 0.7, hard: 1 }

function DiffRow({ name, by, total, color, bind }) {
  return (
    <div className="grid items-center gap-3" style={{ gridTemplateColumns: '92px 1fr 52px', fontSize: 11.5 }}>
      <span className="truncate">{name}</span>
      <div className="flex h-4 gap-[2px]">
        {['easy', 'medium', 'hard'].map((k) => by[k] > 0 && (
          <div key={k} className="h-full first:rounded-l last:rounded-r" style={{ width: `${(100 * by[k]) / total}%`, background: color, opacity: LEVEL_OP[k] }}
            {...bind(() => <TipBox title={`${name} · ${k}`}><div><b>{by[k]}</b> solved · {Math.round((100 * by[k]) / total)}%</div></TipBox>)} />
        ))}
      </div>
      <span className="text-right tabular-nums sub">{total}</span>
    </div>
  )
}

function DifficultyMix({ ps }) {
  const [bind, tipNode] = useHoverTip()
  const rows = ps.map((p) => {
    const by = { easy: 0, medium: 0, hard: 0 }
    for (const d of p.difficulty) if (d.level) by[d.level] += d.count
    return { p, by, total: by.easy + by.medium + by.hard }
  }).filter((r) => r.total)
  const all = { easy: 0, medium: 0, hard: 0 }
  for (const r of rows) for (const k in all) all[k] += r.by[k]
  const allTotal = all.easy + all.medium + all.hard
  return (
    <Panel label="Difficulty mix · easy / medium / hard" right={<span className="sub">lighter → harder</span>}>
      {tipNode}
      {!rows.length ? <Empty>No difficulty data yet.</Empty> : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => <DiffRow bind={bind} key={r.p.platform} name={r.p.name} by={r.by} total={r.total} color={pColor(r.p.platform)} />)}
          {rows.length > 1 && <div className="row-line pt-3"><DiffRow bind={bind} name="All" by={all} total={allTotal} color="var(--fg)" /></div>}
          <p className="sub">
            Codeforces: &lt;1600 easy, 1600–1999 medium, 2000+ hard · AtCoder: below cyan easy, cyan/blue medium, yellow+ hard · LeetCode: its own labels.
            {ps.some((p) => p.platform === 'cc') && ' CodeChef doesn’t expose per-problem difficulty.'}
          </p>
        </div>
      )}
    </Panel>
  )
}

function ContestsPerMonth({ contests, ids }) {
  const C = useTheme()
  const data = contestsByMonth(contests)
  const shown = ids.filter((id) => data.some((r) => r[id]))
  return (
    <Panel label="Contests per month · last 2 years" right={
      <span className="sub flex flex-wrap gap-3">{shown.map((id) => <span key={id}><span style={{ color: pColor(id) }}>■</span> {PLAT[id].name}</span>)}</span>}>
      {!shown.length ? <Empty>No contests in the last two years.</Empty> : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 6, right: 4, left: -24, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="key" {...axisProps(C)} tickFormatter={(k) => data.find((r) => r.key === k)?.label} interval={2} />
              <YAxis allowDecimals={false} width={40} {...axisProps(C)} />
              <Tooltip cursor={{ fill: C.grid }} wrapperStyle={chartTipWrapper}
                content={<ChartTip title={(d) => `${d.label} ${d.year}`} rows={(d) => shown.map((id) => (
                  <div key={id}><span style={{ color: pColor(id) }}>■</span> {PLAT[id].name} <b>{d[id] ?? 0}</b></div>
                ))} />} />
              {shown.map((id, i) => (
                <Bar key={id} dataKey={id} stackId="c" fill={C[`p-${id}`]} stroke={C.panel} strokeWidth={1} isAnimationActive={false}
                  radius={i === shown.length - 1 ? [3, 3, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}

function Topics({ m, ids }) {
  const [n, setN] = useState(14)
  const [bind, tipNode] = useHoverTip()
  const rows = m.topics.slice(0, n)
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <Panel label="Topics · solved, merged across platforms" right={<Seg options={[[14, 'top 14'], [30, 'top 30']]} value={n} onChange={setN} />}>
      {tipNode}
      {!rows.length ? <Empty>No topic data. Codeforces and LeetCode report tags; AtCoder and CodeChef don’t.</Empty> : (
        <>
          <div className="mb-3 flex flex-wrap gap-3 sub">{ids.map((id) => <span key={id}><span style={{ color: pColor(id) }}>■</span> {PLAT[id].name}</span>)}</div>
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <div key={r.topic} className="hovrow grid items-center gap-3 px-1 py-0.5" style={{ gridTemplateColumns: '130px 1fr 40px', fontSize: 10.5 }}
                {...bind(() => (
                  <TipBox title={r.topic}>
                    {ids.filter((id) => r[id]).map((id) => <div key={id}><span style={{ color: pColor(id) }}>■</span> {PLAT[id].name} <b>{r[id]}</b></div>)}
                  </TipBox>
                ))}>
                <span className="truncate text-right" title={r.topic}>{r.topic}</span>
                <div className="flex h-3 gap-[2px]" style={{ width: `${(100 * r.total) / max}%` }}>
                  {ids.filter((id) => r[id]).map((id) => <div key={id} className="h-full first:rounded-l last:rounded-r" style={{ flex: r[id], background: pColor(id) }} />)}
                </div>
                <span className="text-right font-bold tabular-nums">{r.total}</span>
              </div>
            ))}
          </div>
          <p className="sub mt-3">Tag names are unified (e.g. LeetCode “Dynamic Programming” + Codeforces “dp”). A problem with several tags counts toward each.</p>
        </>
      )}
    </Panel>
  )
}

function Practice({ m, ps }) {
  const cfRating = ps.find((p) => p.platform === 'cf')?.rating
  const weak = CORE.map((t) => m.topics.find((x) => x.topic === t) ?? { topic: t, total: 0 }).sort((a, b) => a.total - b.total).slice(0, 6)
  const cf = ps.find((p) => p.platform === 'cf')
  return (
    <Panel label="Practice next · least-covered core topics">
      {!m.topics.length ? <Empty>Connect Codeforces or LeetCode to get topic suggestions.</Empty> : (
        <div className="flex flex-col">
          {weak.map((w, i) => (
            <div key={w.topic} className={`flex flex-wrap items-center gap-2 py-2.5 ${i ? 'row-line' : ''}`} style={{ fontSize: 11.5 }}>
              <span className="flex-1">{w.topic} <span className="sub">· {w.total} solved</span></span>
              {practiceLinks(w.topic, cfRating).map(([name, url]) => (
                <a key={name} className="chip" href={url} target="_blank" rel="noreferrer">{name} ↗</a>
              ))}
            </div>
          ))}
          {cf && <a className="btn mt-3 self-start" href={`#/u/${cf.handle}/weak`}>Codeforces weak-topic deep dive →</a>}
        </div>
      )}
    </Panel>
  )
}

function RecentFeed({ items, label = 'Recent accepted · all platforms' }) {
  return (
    <Panel label={label}>
      {!items.length ? <Empty>No recent accepted problems.</Empty> : (
        <div className="flex max-h-[360px] flex-col overflow-y-auto">
          {items.map((r, i) => (
            <div key={`${r.platform}${r.t}${r.title}`} className={`flex items-center gap-3 py-2 ${i ? 'row-line' : ''}`} style={{ fontSize: 11.5 }}>
              <span className="w-7 flex-none font-bold" style={{ fontSize: 9.5 }}><span style={{ color: pColor(r.platform) }}>■</span> {PLAT[r.platform].short}</span>
              {r.url ? <a className="flex-1 truncate" style={{ color: 'var(--fg)' }} href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                : <span className="flex-1 truncate">{r.title}</span>}
              {r.rating ? <span className="sub">{r.rating}</span> : null}
              <span className="sub whitespace-nowrap">{timeAgo(r.t)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ---------------- upcoming contests ----------------

function countdown(sec) {
  const s = sec - Date.now() / 1000
  if (s <= 0) return 'running'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `in ${d}d ${h}h` : h ? `in ${h}h ${m}m` : `in ${m}m`
}
const dur = (s) => (s ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : '—')

export function Upcoming({ compact, filter }) {
  const q = useFetch('/upcoming')
  const [on, setOn] = useState(() => new Set(filter ?? PLATFORMS.map((p) => p.id)))
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(id) }, [])
  const list = (q.data?.contests ?? []).filter((c) => on.has(c.platform))
  const shown = compact ? list.slice(0, 8) : list
  const toggle = (id) => setOn((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n })
  return (
    <Panel label="Upcoming contests" right={
      <div className="flex flex-wrap items-center gap-1.5">
        {PLATFORMS.map((p) => (
          <button key={p.id} className={`btn ${on.has(p.id) ? 'on' : ''}`} style={{ padding: '4px 7px', fontSize: 9 }} onClick={() => toggle(p.id)} aria-pressed={on.has(p.id)}>
            <span style={{ color: pColor(p.id) }}>■</span> {p.short}
          </button>
        ))}
        <button className="btn" style={{ padding: '4px 7px', fontSize: 9 }} disabled={!list.length} title="Download all shown contests as a calendar file"
          onClick={() => download('contests.ics', icsFor(list), 'text/calendar')}>.ics</button>
      </div>}>
      {q.loading ? <Skeleton style={{ height: 160 }} /> : q.error ? <ErrorCard title={q.error} onRetry={q.reload} /> : (
        <>
          {!shown.length ? <Empty>No upcoming contests for the selected platforms.</Empty> : (
            <div className={`flex flex-col ${compact ? 'max-h-[360px] overflow-y-auto' : ''}`}>
              {shown.map((c, i) => (
                <div key={`${c.platform}${c.start}${c.name}`} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${i ? 'row-line' : ''}`} style={{ fontSize: 11.5 }}>
                  <span className="w-7 flex-none font-bold" style={{ fontSize: 9.5 }}><span style={{ color: pColor(c.platform) }}>■</span> {PLAT[c.platform].short}</span>
                  <a className="min-w-0 flex-1 truncate" style={{ color: 'var(--fg)' }} href={c.url} target="_blank" rel="noreferrer" title={c.name}>{c.name}</a>
                  <span className="sub whitespace-nowrap">
                    {new Date(c.start * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {dur(c.duration)}
                  </span>
                  <span className="w-20 text-right font-bold whitespace-nowrap" style={{ fontSize: 10.5, color: c.start < Date.now() / 1000 + 86400 ? 'var(--acc)' : 'var(--dim)' }}>{countdown(c.start)}</span>
                  <a className="chip" href={gcalLink(c)} target="_blank" rel="noreferrer" title="Add to Google Calendar">+ cal</a>
                </div>
              ))}
            </div>
          )}
          {compact && list.length > shown.length && <a className="sub mt-2 block" href="#/upcoming">all {list.length} upcoming →</a>}
          {Object.keys(q.data.errors ?? {}).length > 0 && (
            <p className="sub mt-3">Couldn’t reach: {Object.keys(q.data.errors).map((id) => PLAT[id]?.name ?? id).join(', ')}.</p>
          )}
        </>
      )}
    </Panel>
  )
}

// ---------------- one platform ----------------

function PlatformView({ p }) {
  const C = useTheme()
  const daily = useMemo(() => Object.fromEntries(Object.entries(p.daily).map(([d, n]) => [d, { [p.platform]: n }])), [p])
  const best = p.contests.filter((c) => c.rank).reduce((m, c) => (!m || c.rank < m.rank ? c : m), null)
  const gains = p.contests.filter((c) => c.delta != null)
  const maxGain = gains.reduce((m, c) => (!m || c.delta > m.delta ? c : m), null)
  const diff = p.difficulty.filter((d) => d.count || d.label !== 'unrated')
  const [n, setN] = useState(20)
  return (
    <div className="grid gap-4">
      <section className="panel flex flex-wrap items-center gap-5" style={{ borderLeft: `3px solid ${pColor(p.platform)}` }}>
        {p.avatar && <img src={p.avatar.startsWith('//') ? `https:${p.avatar}` : p.avatar} alt="" className="size-16 rounded-lg object-cover" referrerPolicy="no-referrer" />}
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="label">{p.name}</span>
          <a href={p.url} target="_blank" rel="noreferrer" className="big truncate" style={{ fontSize: 26, color: 'var(--fg)' }}>{p.handle} ↗</a>
          <span className="sub">{p.title ?? (p.rating == null ? 'unrated' : 'contest rated')}</span>
        </div>
        <div className="flex-1" />
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Rating" value={p.rating ?? '—'} />
          <Stat label="Peak" value={p.maxRating ?? '—'} />
          <Stat label="Solved" value={p.solved.toLocaleString()} hint={p.attempted ? `${p.attempted} attempted` : null} />
          <Stat label="Contests" value={p.contests.length} hint={best ? `best rank ${best.rank}` : null} />
        </div>
        {p.platform === 'cf' && <a className="btn on" href={`#/u/${p.handle}/dash`}>Full Codeforces analytics →</a>}
      </section>

      {p.contests.length > 0 && (
        <Panel label={`Rating history · ${p.contests.length} contests`}
          right={maxGain && <span className="sub">biggest gain <b style={{ color: 'var(--acc)' }}>{signed(maxGain.delta)}</b> · {maxGain.name}</span>}>
          <RatingLine p={p} height={280} />
        </Panel>
      )}

      <Heatmap daily={daily} ids={[p.platform]} label="Activity · last 12 months" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Solved by difficulty">
          {!diff.length ? <Empty>{p.name} doesn’t expose per-problem difficulty.</Empty> : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={diff} margin={{ top: 16, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps(C)} interval={0} />
                  <YAxis allowDecimals={false} width={40} {...axisProps(C)} />
                  <Tooltip cursor={{ fill: C.grid }} wrapperStyle={chartTipWrapper}
                    content={<ChartTip title={(d) => d.label} rows={(d) => <div><b>{d.count}</b> solved{d.level ? ` · ${d.level}` : ''}</div>} />} />
                  <Bar dataKey="count" fill={C[`p-${p.platform}`]} radius={[4, 4, 0, 0]} isAnimationActive={false}
                    label={{ position: 'top', fill: C.dim, fontSize: 9.5, fontFamily: 'JetBrains Mono' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel label="Topics solved" right={p.tags.length > 20 && <Seg options={[[20, 'top 20'], [60, 'more']]} value={n} onChange={setN} />}>
          {!p.tags.length ? <Empty>{p.name} doesn’t report problem tags.</Empty> : (
            <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
              {p.tags.slice(0, n).map((t) => (
                <div key={t.tag} className="grid items-center gap-3" style={{ gridTemplateColumns: '140px 1fr 36px', fontSize: 10.5 }}>
                  <span className="truncate text-right" title={t.tag}>{t.tag}</span>
                  <div className="h-3 rounded-r" style={{ width: `${(100 * t.solved) / p.tags[0].solved}%`, background: pColor(p.platform) }} />
                  <span className="text-right font-bold tabular-nums">{t.solved}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Recent contests">
          {!p.contests.length ? <Empty>No rated contests yet.</Empty> : (
            <div className="flex max-h-[340px] flex-col overflow-y-auto">
              {p.contests.slice().reverse().slice(0, 40).map((c, i) => (
                <div key={`${c.t}${c.name}`} className={`flex items-center gap-3 py-2 ${i ? 'row-line' : ''}`} style={{ fontSize: 11.5 }}>
                  <span className="flex-1 truncate" title={c.name}>{c.name}</span>
                  {c.rank && <span className="sub">#{c.rank}</span>}
                  <span className="w-12 text-right tabular-nums">{c.rating}</span>
                  <span className="w-12 text-right font-bold tabular-nums" style={{ color: c.delta == null ? 'var(--faint)' : c.delta >= 0 ? 'var(--acc)' : 'var(--bad)' }}>
                    {c.delta == null ? '—' : signed(c.delta)}
                  </span>
                  <span className="sub w-20 text-right">{fmtDate(c.t)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <RecentFeed label="Recent accepted" items={p.recent.map((r) => ({ ...r, platform: p.platform }))} />
      </div>
      {p.notes.length > 0 && <p className="sub">{p.notes.join(' ')}</p>}
    </div>
  )
}
