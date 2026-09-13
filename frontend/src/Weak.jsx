import { useState } from 'react'
import { fmtDate, pct, problemUrl, rankColor, signed } from './lib'
import { Empty, ErrorCard, Panel, Skeleton, TipBox, useFetch, useHoverTip, useTheme } from './ui'

const CLUSTERS = {
  Strength: ['Core strengths', 'acc', 'Solved reliably and at volume — keep them warm with speed practice rather than grinding more.'],
  Developing: ['Developing', 'acc2', 'Decent execution but thinner history. A few more solves here move the needle fastest.'],
  Weak: ['Blockers', 'bad', 'Lowest solve rates. These cost the most in contests — the recommender below leans on them.'],
}
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PHASE = { 'rapid improvement': 'acc', steady: 'acc2', plateau: 'warn', decline: 'bad' }

export default function Weak({ p, handle }) {
  return (
    <div className="grid gap-4">
      <Clusters clusters={p.clusters} />
      <TagBars weak={p.weakTopics} />
      <Recommender handle={handle} rating={p.info.rating} />
      <Patterns pt={p.patterns} phases={p.phases} />
    </div>
  )
}

function Clusters({ clusters }) {
  if (!clusters.length)
    return <Panel label="Strength clusters"><Empty>Clustering needs at least 6 tags with 2+ attempts. Keep solving — this fills in quickly.</Empty></Panel>
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {clusters.map((c, i) => {
        const [title, key, blurb] = CLUSTERS[c.label]
        return (
          <section key={c.label} className="panel flex flex-col gap-3" style={{ borderTop: `2px solid var(--${key})` }}>
            <div className="flex items-baseline justify-between">
              <span style={{ font: "700 12px/1 'JetBrains Mono'", letterSpacing: '.08em', color: `var(--${key})`, textTransform: 'uppercase' }}>{title}</span>
              <span className="sub">cluster {i + 1}</span>
            </div>
            <p style={{ color: 'var(--dim)', fontSize: 11, lineHeight: 1.7 }}>{blurb}</p>
            <div className="flex flex-wrap gap-1.5">
              {c.tags.map((t) => <span key={t} className="chip" style={{ color: 'var(--fg)' }}>{t}</span>)}
            </div>
            <div className="mt-auto flex justify-between pt-3 row-line sub">
              <span>mean solve rate · avg solved {c.avgSolvedRating ?? '—'}</span>
              <b style={{ color: `var(--${key})` }}>{pct(c.avgRatio)}</b>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function TagBars({ weak }) {
  const rows = [...weak.ranked].reverse()
  const max = Math.max(1, ...rows.map((r) => r.attempted))
  const colorOf = (r) => (r.weak ? 'var(--bad)' : r.score >= weak.overall ? 'var(--acc)' : r.score >= weak.overall - 0.03 ? 'var(--acc2)' : 'var(--warn)')
  const [bind, tipNode] = useHoverTip()
  const tagTip = (r) => (
    <TipBox title={`${r.tag}${r.weak ? ' · flagged weak' : ''}`}>
      <div><b style={{ color: colorOf(r) }}>{r.solved}</b> solved of {r.attempted} attempted · {pct(r.ratio)}</div>
      <div>smoothed <b>{pct(r.score)}</b> <span style={{ color: 'var(--faint)' }}>vs your {pct(weak.overall)} overall</span></div>
      {r.avgSolvedRating && <div style={{ color: 'var(--faint)' }}>avg solved rating {r.avgSolvedRating}</div>}
    </TipBox>
  )
  return (
    <Panel label="Solve rate by tag · solved / attempted"
      right={<span className="sub" style={{ color: 'var(--bad)' }}>■ {weak.relative ? 'relatively weakest' : 'flagged weak'} · overall {pct(weak.overall)}</span>}>
      {tipNode}
      {!rows.length ? <Empty>Attempt at least {weak.minAttempts} problems in a tag to get a reading.</Empty> : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <div key={r.tag} className="hovrow grid items-center gap-3 px-1" style={{ gridTemplateColumns: 'minmax(90px,170px) 1fr 70px 40px', fontSize: 11 }} {...bind(() => tagTip(r))}>
              <span className="truncate font-bold" style={{ color: r.weak ? 'var(--bad)' : 'var(--fg)' }} title={r.tag}>{r.tag}</span>
              <div className="h-3 overflow-hidden rounded-sm" style={{ width: pct(r.attempted / max), background: 'var(--line2)' }}>
                <div className="h-full" style={{ width: pct(r.solved / r.attempted), background: colorOf(r) }} />
              </div>
              <span className="sub text-right tabular-nums">{r.solved} / {r.attempted}</span>
              <span className="text-right font-bold tabular-nums" style={{ color: colorOf(r) }}>{pct(r.ratio)}</span>
            </div>
          ))}
          <p className="sub mt-2">Bar length = attempts, fill = solved. Weakness uses the rate smoothed toward your overall {pct(weak.overall)}, so tags with few attempts don’t dominate.</p>
        </div>
      )}
    </Panel>
  )
}

function Recommender({ handle, rating }) {
  const C = useTheme()
  const q = useFetch(`/recommend/${encodeURIComponent(handle)}?limit=40`)
  const [all, setAll] = useState(false)
  const d = q.data
  return (
    <Panel label={d ? `Recommended next · weak-tag weighted, rating ${d.target[0]}–${d.target[1]}` : 'Recommended next'}
      right={d?.problems.length > 10 && <button className="sub" onClick={() => setAll(!all)}>unsolved only · {all ? 'show fewer' : `show all ${d.problems.length}`}</button>}>
      {q.loading && <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 30 }} />)}</div>}
      {q.error && <ErrorCard title={q.error} onRetry={q.reload} />}
      {d && !d.problems.length && <Empty>No unsolved rated problems in range — impressive.</Empty>}
      {d && d.problems.slice(0, all ? 40 : 10).map((x, i) => {
        const reason = x.weakTags.length ? `${x.weakTags.length} weak tag${x.weakTags.length > 1 ? 's' : ''}` : x.upsolve ? 'upsolve' : rating ? `stretch ${signed(x.rating - rating)}` : 'warm-up'
        return (
          <div key={x.key} className={`grid items-center gap-3 py-3 ${i ? 'row-line' : ''}`} style={{ gridTemplateColumns: '70px minmax(0,1fr) auto 120px 48px', fontSize: 11.5 }}>
            <a href={problemUrl(x.contestId, x.index)} target="_blank" rel="noreferrer">{x.contestId}{x.index}</a>
            <a href={problemUrl(x.contestId, x.index)} target="_blank" rel="noreferrer" className="truncate font-bold" style={{ color: 'var(--fg)' }}>{x.name}</a>
            <div className="hidden flex-wrap justify-end gap-1 md:flex">
              {x.upsolve && <span className="chip" style={{ color: 'var(--acc2)', borderColor: 'var(--acc2)' }}>upsolve</span>}
              {x.tags.slice(0, 3).map((t) => (
                <span key={t} className="chip" style={x.weakTags.includes(t) ? { color: 'var(--bad)', borderColor: 'color-mix(in srgb, var(--bad) 60%, transparent)' } : null}>{t}</span>
              ))}
            </div>
            <span className="sub text-right">{reason}</span>
            <span className="big text-right" style={{ fontSize: 14, color: rankColor(x.rating, C.dark) }}>{x.rating}</span>
          </div>
        )
      })}
    </Panel>
  )
}

function Patterns({ pt, phases }) {
  const [bind, tipNode] = useHoverTip()
  if (!pt.byHour.length) return <Panel label="When you solve"><Empty>No submissions to analyse.</Empty></Panel>
  const hours = pt.byHour
  const total = hours.reduce((s, h) => s + h.subs, 0)
  const acc = hours.reduce((s, h) => s + h.ac, 0) / total
  const maxH = Math.max(...hours.map((h) => h.subs))
  const good = hours.filter((h) => h.subs >= 10)
  const worst = good.length ? good.reduce((m, h) => (h.acRate < m.acRate ? h : m)) : null
  const best = good.length ? good.reduce((m, h) => (h.acRate > m.acRate ? h : m)) : null
  // busiest 3-hour window
  const win = hours.map((_, i) => [i, [0, 1, 2].reduce((s, k) => s + hours[(i + k) % 24].subs, 0)]).reduce((m, x) => (x[1] > m[1] ? x : m))
  const hh = (h) => `${String(h % 24).padStart(2, '0')}:00`
  const days = pt.byWeekday
  const maxD = Math.max(1, ...days.map((d) => d.subs))
  const lastPhase = phases.at(-1)
  return (
    <section className="panel grid gap-6 lg:grid-cols-2">
      {tipNode}
      <div className="flex flex-col gap-3">
        <span className="label">When you solve · by hour, local time</span>
        <div className="flex h-36 items-end gap-[3px]">
          {hours.map((h) => {
            const c = h.subs < 5 ? 'var(--line2)' : h.acRate < acc - 0.08 ? 'var(--bad)' : h.acRate > acc + 0.08 ? 'var(--acc)' : 'var(--line2)'
            return (
              <div key={h.hour} className="hov hovcol flex h-full flex-1 items-end"
                {...bind(() => (
                  <TipBox title={`${hh(h.hour)}–${String(h.hour).padStart(2, '0')}:59`}>
                    {h.subs ? <div><b style={{ color: 'var(--acc2)' }}>{h.subs}</b> submissions · <b style={{ color: 'var(--acc)' }}>{h.ac}</b> AC · {pct(h.acRate)}</div>
                      : <div style={{ color: 'var(--faint)' }}>no submissions</div>}
                    {h.subs >= 5 && <div style={{ color: 'var(--faint)' }}>{signed(Math.round((h.acRate - acc) * 100))} pts vs your average</div>}
                  </TipBox>
                ))}>
                <div className="w-full rounded-t-sm" style={{ height: pct(Math.max(0.02, h.subs / maxH)), background: c }} />
              </div>
            )
          })}
        </div>
        <div className="sub flex justify-between"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
        <p style={{ color: 'var(--dim)', fontSize: 11, lineHeight: 1.7 }}>
          Peak window <b style={{ color: 'var(--warn)' }}>{hh(win[0])}–{hh(win[0] + 3)}</b>.
          {best && worst && <> Accuracy is best at <b style={{ color: 'var(--acc)' }}>{hh(best.hour)}</b> ({pct(best.acRate)}) and worst at <b style={{ color: 'var(--bad)' }}>{hh(worst.hour)}</b> ({pct(worst.acRate)}). Green/red = AC rate 8+ points above/below your {pct(acc)} average.</>}
        </p>
        <div className="grid grid-cols-7 gap-2 pt-3 row-line">
          {days.map((d) => (
            <div key={d.weekday} className="hov flex flex-col items-center gap-1"
              {...bind(() => (
                <TipBox title={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d.weekday]}>
                  <div><b style={{ color: 'var(--acc2)' }}>{d.subs}</b> submissions · <b style={{ color: 'var(--acc)' }}>{d.ac}</b> AC · {pct(d.acRate)}</div>
                </TipBox>
              ))}>
              <div className="flex h-10 w-full items-end"><div className="w-full rounded-t-sm" style={{ height: pct(Math.max(0.04, d.subs / maxD)), background: 'var(--acc2)', opacity: 0.75 }} /></div>
              <span className="sub">{WEEKDAYS[d.weekday]}</span>
            </div>
          ))}
        </div>
        {pt.bursts.length > 0 && <p className="sub">burst days (&gt; mean + 3σ): {pt.bursts.map((b) => `${b.day} (${b.subs})`).join(' · ')}</p>}
      </div>
      <div className="flex flex-col gap-3">
        <span className="label">Phase detection · rolling slope changepoints</span>
        {!phases.length ? <Empty>Needs 7+ rated contests.</Empty> : (
          <>
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
              {phases.slice(-8).map((ph) => {
                const c = `var(--${PHASE[ph.label]})`
                return (
                  <div key={ph.from} className="grid items-center gap-3" style={{ gridTemplateColumns: '100px 1fr 54px', fontSize: 11 }}>
                    <span className="sub">contests {ph.fromIdx}–{ph.toIdx}</span>
                    <span className="hov truncate rounded-md px-2.5 py-1.5 font-bold"
                      {...bind(() => (
                        <TipBox title={`${fmtDate(ph.from)} → ${fmtDate(ph.to)}`}>
                          <div>{ph.ratingFrom} → <b>{ph.ratingTo}</b> <b style={{ color: c }}>{signed(ph.ratingTo - ph.ratingFrom)}</b></div>
                          <div style={{ color: 'var(--faint)' }}>{ph.contests} contests · {signed(Math.round((ph.ratingTo - ph.ratingFrom) / Math.max(ph.contests, 1)))}/contest</div>
                        </TipBox>
                      ))}
                      style={{ color: c, border: `1px solid ${c}`, background: `color-mix(in srgb, ${c} 9%, transparent)` }}>
                      {ph.label}{ph === lastPhase ? ` · ${Math.round((Date.now() / 1000 - ph.from) / 86400)} days` : ''}
                    </span>
                    <span className="text-right font-bold tabular-nums" style={{ color: c }}>{signed(ph.ratingTo - ph.ratingFrom)}</span>
                  </div>
                )
              })}
            </div>
            <p style={{ color: 'var(--dim)', fontSize: 11, lineHeight: 1.7 }}>
              You are <b style={{ color: `var(--${PHASE[lastPhase.label]})` }}>{Math.round((Date.now() / 1000 - lastPhase.from) / 86400)} days into a {lastPhase.label}</b> phase
              ({lastPhase.ratingFrom} → {lastPhase.ratingTo} over {lastPhase.contests} contests).
            </p>
          </>
        )}
      </div>
    </section>
  )
}
