import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, fmtDate, fmtMonth, isoDay, signed, timeAgo, tzOffset } from './lib'
import {
  PLAT, PLATFORMS, combine, CORE, download, gcalLink, icsFor, insights, loadAccounts, pColor, parseSpec, practiceLinks,
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
  useEffect(() => { if (Object.keys(acc).length) saveAccounts(acc) }, [spec]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-1">
        <a href={`#/hub/${spec}/all`} className={`btn ${view === 'all' ? 'on' : ''}`}>All</a>
        {ids.map((id) => (
          <a key={id} href={`#/hub/${spec}/${id}`} className={`btn flex items-center gap-1.5 ${view === id ? 'on' : ''}`}>
            <span className="inline-block size-1.5 rounded-full" style={{ background: s[id]?.error ? 'var(--bad)' : pColor(id), opacity: s[id]?.loading ? 0.35 : 1 }} />
            {PLAT[id].name}
          </a>
        ))}
        {pending.length > 0 && (
          <span className="sub ml-2 flex items-center gap-2">
            <span className="caret" style={{ height: 11, width: 6 }} /> fetching {pending.map((id) => PLAT[id].name).join(' · ')}
          </span>
        )}
      </div>
      {ids.filter((id) => s[id]?.error).map((id) => (
        <ErrorCard key={id} title={`${PLAT[id].name} · ${acc[id]}: ${s[id].error}`} onRetry={() => reload(id)}>
          {s[id].status === 404 ? 'Check the username, or edit your accounts.' : 'The site may be down or blocking requests. Cached data is used when there is any.'}
        </ErrorCard>
      ))}
      {view === 'all'
        ? loaded.length ? <Combined ps={loaded} acc={acc} spec={spec} /> : pending.length ? <HubLoading /> : null
        : s[view]?.data ? <PlatformView p={s[view].data} /> : s[view]?.error ? null : <HubLoading />}
    </div>
  )
}

function HubLoading() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Skeleton className="min-h-52" />
        <Skeleton className="min-h-52" />
      </div>
      <Skeleton style={{ height: 220 }} />
    </div>
  )
}

// ---------------- combined ----------------

function Combined({ ps, acc, spec }) {
  const m = useMemo(() => combine(ps), [ps])
  const rated = ps.filter((p) => p.contests.length)
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Summary ps={ps} m={m} acc={acc} spec={spec} />
        <ThisWeek ps={ps} m={m} />
      </div>
      <Heatmap daily={m.daily} ids={ps.map((p) => p.platform)} m={m} />
      {rated.length > 0 && <Ratings ps={rated} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Topics m={m} ps={ps} />
        <DifficultyMix ps={ps} />
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

/** Same shape as the Codeforces profile card: who, the headline number, then one row per account. */
function Summary({ ps, m, acc, spec }) {
  const [copied, setCopied] = useState(false)
  const share = () => {
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/hub/${spec}/all`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {})
  }
  const exportJson = () => download(`coding-profile-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ accounts: acc, profiles: ps }, null, 2))
  const total = Math.max(1, m.solved)
  return (
    <section className="panel gridbg flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <span className="label">{ps.length} platform{ps.length > 1 ? 's' : ''} connected</span>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="big" style={{ fontSize: 34, letterSpacing: '-.01em' }}>{m.solved.toLocaleString()}</span>
          <span style={{ color: 'var(--dim)' }}>problems solved</span>
        </div>
        <div className="flex h-2 gap-[2px] overflow-hidden rounded-sm" role="img" aria-label="Share of solved problems by platform">
          {ps.filter((p) => p.solved).map((p) => (
            <div key={p.platform} style={{ flex: p.solved, background: pColor(p.platform) }} title={`${p.name} ${p.solved}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="grid gap-3 px-1 pb-1" style={{ gridTemplateColumns: 'minmax(0,1.3fr) repeat(3, minmax(0,1fr))' }}>
          {['account', 'rating', 'solved', 'last Δ'].map((l, i) => (
            <span key={l} className={`label ${i ? 'text-right' : ''}`} style={{ fontSize: 8.5, color: 'var(--faint)' }}>{l}</span>
          ))}
        </div>
        {ps.map((p) => {
          const last = p.contests.at(-1)
          return (
            <a key={p.platform} href={`#/hub/${spec}/${p.platform}`} className="hovrow row-line grid items-center gap-3 px-1 py-2.5"
              style={{ gridTemplateColumns: 'minmax(0,1.3fr) repeat(3, minmax(0,1fr))', color: 'var(--fg)', fontSize: 11.5 }}>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2"><span className="size-2 flex-none rounded-full" style={{ background: pColor(p.platform) }} /><b className="truncate">{p.name}</b></span>
                <span className="sub truncate pl-4">{p.handle}{p.title ? ` · ${p.title}` : ''}</span>
              </span>
              <MiniStat value={p.rating ?? '—'} hint={p.maxRating ? `max ${p.maxRating}` : null} />
              <MiniStat value={p.solved.toLocaleString()} hint={`${Math.round((100 * p.solved) / total)}%`} />
              <MiniStat value={last?.delta != null ? signed(last.delta) : '—'}
                color={last?.delta == null ? undefined : last.delta >= 0 ? 'var(--acc)' : 'var(--bad)'} hint={last ? timeAgo(last.t) : `${p.contests.length} contests`} />
            </a>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="chip" href={`#/hub/${spec}/connect`}>edit accounts</a>
        <button className="chip cursor-pointer bg-transparent" onClick={share}>{copied ? 'link copied ✓' : 'copy share link'}</button>
        <button className="chip cursor-pointer bg-transparent" onClick={exportJson}>export json</button>
        <a className="chip" href="#/upcoming">contest calendar ↗</a>
      </div>
    </section>
  )
}

function MiniStat({ value, hint, color }) {
  return (
    <span className="flex min-w-0 flex-col gap-1 text-right">
      <span className="font-bold tabular-nums" style={{ fontSize: 14, color }}>{value}</span>
      {hint && <span className="sub truncate">{hint}</span>}
    </span>
  )
}

/** Right-hand card, like "Next rank" on the Codeforces overview: the goal, the streak, and what to do next. */
function ThisWeek({ ps, m }) {
  const [goal, setGoal] = useState(() => Number(store.get('weeklyGoal', '20')) || 20)
  const [editing, setEditing] = useState(false)
  const done = m.week.reduce((s, d) => s + d.n, 0)
  const frac = Math.min(1, done / goal)
  const dayMax = Math.max(1, ...m.week.map((d) => d.n))
  const notes = useMemo(() => insights(ps, m).slice(0, 3), [ps, m])
  const upd = (g) => { setGoal(g); store.set('weeklyGoal', String(g)) }
  const todayKey = isoDay(new Date())
  return (
    <section className="panel flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between">
        <span className="label">This week</span>
        {editing ? (
          <label className="sub flex items-center gap-1.5">goal
            <input autoFocus type="number" min={1} max={500} value={goal} className="input w-14" style={{ padding: '3px 5px' }} aria-label="Weekly submission goal"
              onChange={(e) => upd(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} onBlur={() => setEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditing(false)} />
          </label>
        ) : <button className="sub cursor-pointer bg-transparent" onClick={() => setEditing(true)}>goal {goal} · edit</button>}
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="big" style={{ fontSize: 22, color: frac >= 1 ? 'var(--acc)' : 'var(--fg)' }}>{done} / {goal}</span>
        <span className="sub">{frac >= 1 ? 'goal reached' : `${goal - done} submissions to go`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm" style={{ background: 'var(--cellbg)' }} role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={goal}>
        <div className="h-full" style={{ width: `${frac * 100}%`, background: 'var(--acc)' }} />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((n, i) => {
          const d = m.week[i]
          return (
            <div key={i} className="flex flex-col items-center gap-1" title={d ? `${d.n} submission${d.n === 1 ? '' : 's'}` : ''}>
              <div className="flex h-9 w-full items-end">
                <div className="w-full rounded-sm" style={{ height: d?.n ? `${Math.max(12, (100 * d.n) / dayMax)}%` : 2, background: d?.n ? 'var(--acc)' : 'var(--line2)', opacity: d?.n ? 0.85 : 1 }} />
              </div>
              <span className="sub" style={{ color: d?.day === todayKey ? 'var(--fg)' : undefined }}>{n}</span>
            </div>
          )
        })}
      </div>
      <div className="row-line flex flex-wrap gap-x-7 gap-y-3 pt-3.5">
        <Stat label="Streak" value={`${m.streak.current}d`} size={18} color="var(--acc)" hint={`best ${m.streak.longest}d`} />
        <Stat label="Last active" value={m.lastActive ? rel(m.lastActive) : '—'} size={18} />
      </div>
      {notes.length > 0 && (
        <ul className="row-line flex flex-col gap-2 pt-3.5" style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--dim)' }}>
          {notes.map((n) => <li key={n} className="flex gap-2"><span style={{ color: 'var(--acc)' }}>›</span><span>{n}</span></li>)}
        </ul>
      )}
    </section>
  )
}

/** Last-12-months calendar; shade = total submissions, tooltip splits by platform. With one id, shades in that platform's colour. */
function Heatmap({ daily, ids, m, label = 'Activity · last 12 months · all platforms' }) {
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
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 sub">
          {ids.map((id) => {
            const n = cells.reduce((s, c) => s + (c.by[id] ?? 0), 0)
            return <span key={id}><span style={{ color: pColor(id) }}>■</span> {PLAT[id].name} {n.toLocaleString()}</span>
          })}
        </div>
      )}
      {m && (
        <div className="mt-4 grid grid-cols-2 gap-4 pt-4 row-line sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Submissions" value={m.subsYear.toLocaleString()} size={18} />
          <Stat label="Active days" value={m.activeDays} size={18} hint={`${Math.round((100 * m.activeDays) / cells.length)}% of days`} />
          <Stat label="Streak" value={`${m.streak.current}d`} size={18} color="var(--acc)" hint={`longest ${m.streak.longest}d`} />
          <Stat label="Contests" value={m.contests.length} size={18} hint={`${m.contests.filter((c) => c.t * 1000 > start.getTime()).length} this year`} />
          <Stat label="Last active" value={m.lastActive ? rel(m.lastActive) : '—'} size={18} />
        </div>
      )}
    </Panel>
  )
}

function Ratings({ ps }) {
  const [pick, setPick] = useState(() => [...ps].sort((a, b) => b.contests.length - a.contests.length)[0].platform)
  const p = ps.find((x) => x.platform === pick) ?? ps[0]
  const best = p.contests.filter((c) => c.delta != null).reduce((b, c) => (!b || c.delta > b.delta ? c : b), null)
  return (
    <Panel label={`Rating history · ${p.name} · ${p.contests.length} contests`}
      right={ps.length > 1 && <Seg options={ps.map((x) => [x.platform, PLAT[x.platform].short])} value={p.platform} onChange={setPick} />}>
      <div className="mb-4 flex flex-wrap gap-x-7 gap-y-3">
        <Stat label="Now" value={p.rating ?? '—'} size={18} color={pColor(p.platform)} hint={p.title} />
        <Stat label="Peak" value={p.maxRating ?? '—'} size={18} />
        <Stat label="Best gain" value={best ? signed(best.delta) : '—'} size={18} color="var(--acc)" hint={best?.name} />
        <Stat label="Last 5" value={signed(p.contests.slice(-5).reduce((s, c) => s + (c.delta ?? 0), 0))} size={18} hint="net change" />
      </div>
      <RatingLine p={p} height={260} />
      {ps.length > 1 && <p className="sub mt-2">Each site uses its own rating scale, so switch between them rather than overlaying.</p>}
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

const LEVELS = [['easy', 0.35], ['medium', 0.65], ['hard', 1]]

function DifficultyMix({ ps }) {
  const rows = ps.map((p) => {
    const by = { easy: 0, medium: 0, hard: 0 }
    for (const d of p.difficulty) if (d.level) by[d.level] += d.count
    return { p, by, total: by.easy + by.medium + by.hard }
  }).filter((r) => r.total)
  return (
    <Panel label="Difficulty" right={
      <span className="sub flex gap-3">{LEVELS.map(([k, o]) => <span key={k} className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm" style={{ background: 'var(--fg)', opacity: o }} />{k}</span>)}</span>}>
      {!rows.length ? <Empty>No difficulty data yet.</Empty> : (
        <div className="flex flex-col gap-4">
          {rows.map(({ p, by, total }) => (
            <div key={p.platform} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between" style={{ fontSize: 11.5 }}>
                <span>{p.name}</span><span className="sub tabular-nums">{total} rated solves</span>
              </div>
              <div className="flex h-5 gap-[2px] overflow-hidden rounded-sm">
                {LEVELS.map(([k, o]) => by[k] > 0 && (
                  <div key={k} className="flex items-center px-1.5" title={`${k}: ${by[k]}`}
                    style={{ flex: by[k], background: `color-mix(in srgb, ${pColor(p.platform)} ${o * 100}%, var(--panel))` }}>
                    {by[k] / total > 0.12 && <span className="font-bold tabular-nums" style={{ fontSize: 9.5, color: o > 0.5 ? 'var(--bg)' : 'var(--fg)' }}>{by[k]}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="sub">Codeforces &lt;1600 easy, 1600–1999 medium, 2000+ hard. AtCoder below cyan easy, cyan–blue medium, yellow+ hard. LeetCode uses its own labels.
            {ps.some((p) => p.platform === 'cc') && ' CodeChef doesn’t publish per-problem difficulty.'}</p>
        </div>
      )}
    </Panel>
  )
}

function Topics({ m, ps }) {
  const [n, setN] = useState(12)
  const [bind, tipNode] = useHoverTip()
  const ids = ps.filter((p) => p.tags.length).map((p) => p.platform)
  const rows = m.topics.slice(0, n)
  const max = Math.max(1, ...rows.map((r) => r.total))
  const cfRating = ps.find((p) => p.platform === 'cf')?.rating
  const weak = CORE.map((t) => m.topics.find((x) => x.topic === t) ?? { topic: t, total: 0 }).sort((a, b) => a.total - b.total).slice(0, 4)
  return (
    <Panel label="Topics · solved across platforms" right={m.topics.length > 12 && <Seg options={[[12, 'top 12'], [30, 'top 30']]} value={n} onChange={setN} />}>
      {tipNode}
      {!rows.length ? <Empty>No topic data. Codeforces and LeetCode report tags; AtCoder and CodeChef don’t.</Empty> : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            {rows.map((r) => (
              <div key={r.topic} className="hovrow grid items-center gap-3 px-1 py-1" style={{ gridTemplateColumns: '128px 1fr 40px', fontSize: 10.5 }}
                {...bind(() => (
                  <TipBox title={r.topic}>
                    {ids.filter((id) => r[id]).map((id) => <div key={id}><span style={{ color: pColor(id) }}>■</span> {PLAT[id].name} <b>{r[id]}</b></div>)}
                  </TipBox>
                ))}>
                <span className="truncate text-right" title={r.topic}>{r.topic}</span>
                <div className="flex h-2.5 gap-[2px]" style={{ width: `${(100 * r.total) / max}%` }}>
                  {ids.filter((id) => r[id]).map((id) => <div key={id} className="h-full rounded-sm" style={{ flex: r[id], background: pColor(id) }} />)}
                </div>
                <span className="text-right font-bold tabular-nums">{r.total}</span>
              </div>
            ))}
          </div>
          <div className="row-line flex flex-col gap-2 pt-4">
            <span className="label" style={{ fontSize: 9.5 }}>Practice next · least-solved core topics</span>
            {weak.map((w) => (
              <div key={w.topic} className="flex flex-wrap items-center gap-2" style={{ fontSize: 11.5 }}>
                <span className="flex-1">{w.topic} <span className="sub">· {w.total} solved</span></span>
                {practiceLinks(w.topic, cfRating).map(([name, url]) => <a key={name} className="chip" href={url} target="_blank" rel="noreferrer">{name} ↗</a>)}
              </div>
            ))}
          </div>
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
                <div key={`${c.platform}${c.start}${c.name}`} className={`flex items-center gap-3 py-2.5 ${i ? 'row-line' : ''}`} style={{ fontSize: 11.5 }}>
                  <span className="size-2 flex-none rounded-full" style={{ background: pColor(c.platform) }} title={PLAT[c.platform].name} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <a style={{ color: 'var(--fg)' }} href={c.url} target="_blank" rel="noreferrer">{c.name}</a>
                    <span className="sub">
                      {PLAT[c.platform].name} · {new Date(c.start * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {dur(c.duration)}
                      {' · '}<a href={gcalLink(c)} target="_blank" rel="noreferrer">add to calendar</a>
                    </span>
                  </div>
                  <span className="flex-none text-right font-bold whitespace-nowrap tabular-nums" style={{ fontSize: 10.5, color: c.start < Date.now() / 1000 + 86400 ? 'var(--acc)' : 'var(--dim)' }}>{countdown(c.start)}</span>
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

/** Profile photo, or the handle's initials when there is none (CF's "no-title" placeholder) or it fails to load. */
function Avatar({ p }) {
  const [broken, setBroken] = useState(false)
  const src = p.avatar?.startsWith('//') ? `https:${p.avatar}` : p.avatar
  const none = broken || !src || /no-title|no-avatar|default/i.test(src)
  return (
    <div className="grid size-16 flex-none place-items-center overflow-hidden rounded-lg" style={{ border: '1px solid var(--line2)', background: 'var(--panel2)' }}>
      {none
        ? <span className="big" style={{ fontSize: 20, color: pColor(p.platform) }}>{p.handle.slice(0, 2).toUpperCase()}</span>
        : <img src={src} alt={`${p.handle} avatar`} className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
    </div>
  )
}

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
        <Avatar p={p} />
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
