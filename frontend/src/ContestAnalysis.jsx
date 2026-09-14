import { useMemo, useRef, useState } from 'react'
import { clock, fmtDate, pct, problemUrl, rankColor, roundTimeline, signed, verdictColor, verdictLabel } from './lib'
import Predict from './Predict'
import { Panel, TipBox, useHoverTip, useTheme } from './ui'

// Submissions made during the round itself. PRACTICE / VIRTUAL are upsolves and must not count as contest solves.
const IN_CONTEST = new Set(['CONTESTANT', 'OUT_OF_COMPETITION'])

export default function ContestAnalysis({ p, contest }) {
  const C = useTheme()
  const history = p.history
  const subs = p.submissions
  const topRef = useRef(null)

  const [selectedContestId, setSelectedContestId] = useState(() => Number(contest) || history.at(-1)?.contestId || null)
  // shareable #/u/<handle>/contests/<id>; replaceState doesn't fire hashchange, so no refetch
  const choose = (id) => {
    setSelectedContestId(id)
    window.history.replaceState(null, '', `#/u/${p.info.handle}/contests/${id}`) // `history` here is the rating list
  }
  const [filterType, setFilterType] = useState('ALL')

  const selectedContest = history.find((h) => h.contestId === selectedContestId) || history.at(-1) || null

  const { round, upsolved } = useMemo(() => {
    if (!selectedContest) return { round: null, upsolved: [] }
    const same = subs.filter((s) => Number(s.contestId) === selectedContest.contestId)
    const during = same.filter((s) => IN_CONTEST.has(s.type))
    const solvedDuring = new Set(during.filter((s) => s.verdict === 'OK').map((s) => s.index))
    const later = [...new Set(same.filter((s) => !IN_CONTEST.has(s.type) && s.verdict === 'OK' && !solvedDuring.has(s.index)).map((s) => s.index))]
    return {
      round: roundTimeline(during, selectedContest.startTimeSeconds ?? 0, selectedContest.durationSeconds),
      upsolved: later.sort(),
    }
  }, [subs, selectedContest])

  const filteredHistory = filterType === 'GAINS' ? history.filter((h) => h.delta > 0) : filterType === 'DROPS' ? history.filter((h) => h.delta < 0) : history

  const pick = (id) => {
    choose(id)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!history.length) {
    return (
      <div className="grid gap-6">
        <Panel label="Contest Analysis">
          <div className="p-8 text-center" style={{ color: 'var(--dim)' }}>
            No contest history available yet for this handle.
          </div>
        </Panel>
        <Predict p={p} />
      </div>
    )
  }

  const rows = round?.rows ?? []
  const solved = rows.filter((r) => r.ac).length
  return (
    <div className="grid grid-cols-1 gap-6">
      <div ref={topRef} style={{ scrollMarginTop: 80 }}>
        <Panel
          label="Contest Post-Mortem · Detailed round playback"
          right={
            <select
              value={selectedContest?.contestId || ''}
              onChange={(e) => choose(Number(e.target.value))}
              className="input max-w-full text-xs"
              style={{ padding: '6px 10px' }}
              aria-label="Contest"
            >
              {history.slice().reverse().map((h) => (
                <option key={h.contestId} value={h.contestId}>
                  {h.contestName} ({signed(h.delta)})
                </option>
              ))}
            </select>
          }
        >
          {selectedContest && (
            <div className="flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5 p-4 rounded" style={{ background: 'var(--panel2)', border: '1px solid var(--line2)' }}>
                <div className="min-w-0">
                  <Label>Contest</Label>
                  <a href={`https://codeforces.com/contest/${selectedContest.contestId}`} target="_blank" rel="noreferrer"
                    className="font-bold text-sm truncate block" style={{ color: 'var(--fg)' }} title={selectedContest.contestName}>
                    {selectedContest.contestName}
                  </a>
                  <span className="text-[11px]" style={{ color: 'var(--dim)' }}>{fmtDate(selectedContest.startTimeSeconds ?? selectedContest.ratingUpdateTimeSeconds)}</span>
                </div>
                <div>
                  <Label>Rank</Label>
                  <span className="big" style={{ fontSize: 22, color: 'var(--fg)' }}>#{selectedContest.rank.toLocaleString()}</span>
                </div>
                <div>
                  <Label>Rating change</Label>
                  <div className="flex items-baseline gap-2">
                    <span className="big" style={{ fontSize: 22, color: selectedContest.delta >= 0 ? 'var(--acc)' : 'var(--bad)' }}>
                      {signed(selectedContest.delta)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--dim)' }}>
                      {selectedContest.oldRating} → <b style={{ color: rankColor(selectedContest.newRating, C.dark) }}>{selectedContest.newRating}</b>
                    </span>
                  </div>
                </div>
                <div>
                  <Label>Solved / tried</Label>
                  <span className="big" style={{ fontSize: 22, color: 'var(--acc)' }}>{solved} / {rows.length || '—'}</span>
                  {upsolved.length > 0 && (
                    <span className="block text-[11px]" style={{ color: 'var(--acc2)' }}>+ upsolved {upsolved.join(', ')}</span>
                  )}
                </div>
                <div>
                  <Label>Time wasted</Label>
                  <span className="big" style={{ fontSize: 22, color: round?.wasted ? 'var(--bad)' : 'var(--faint)' }}>{rows.length ? clock(round.wasted) : '—'}</span>
                  {round?.wasted > 0 && <span className="block text-[11px]" style={{ color: 'var(--dim)' }}>{pct(round.wasted / round.span)} of the round</span>}
                </div>
              </div>

              {rows.length > 0 ? (
                <>
                  <Playback round={round} />
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                    <Breakdown rows={rows} contestId={selectedContest.contestId} />
                    <CostlyTags round={round} />
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-xs flex flex-col items-center gap-3 rounded" style={{ background: 'var(--panel2)', color: 'var(--dim)', border: '1px solid var(--line2)' }}>
                  <span>
                    No in-contest submissions found for <b>{selectedContest.contestName}</b>
                    {upsolved.length ? ` (upsolved later: ${upsolved.join(', ')})` : ''}.
                  </span>
                  <a href={`https://codeforces.com/contest/${selectedContest.contestId}/my`} target="_blank" rel="noreferrer" className="btn px-3.5 py-1.5 text-xs">
                    Open Submissions on Codeforces ↗
                  </a>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        label={`Rating Change History · ${history.length} contests`}
        right={
          <div className="flex gap-2">
            <button className={`btn text-xs px-2.5 py-1 ${filterType === 'ALL' ? 'on' : ''}`} onClick={() => setFilterType('ALL')}>All</button>
            <button className={`btn text-xs px-2.5 py-1 ${filterType === 'GAINS' ? 'on' : ''}`} onClick={() => setFilterType('GAINS')}>Gains</button>
            <button className={`btn text-xs px-2.5 py-1 ${filterType === 'DROPS' ? 'on' : ''}`} onClick={() => setFilterType('DROPS')}>Drops</button>
          </div>
        }
      >
        <div className="max-h-[520px] overflow-auto rounded" style={{ border: '1px solid var(--line2)' }}>
          <table className="w-full text-left border-collapse" style={{ font: "12px/1.5 'JetBrains Mono'" }}>
            <thead className="sticky top-0">
              <tr className="uppercase text-[10.5px]" style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--line)', color: 'var(--faint)' }}>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Contest</th>
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Old → New</th>
                <th className="py-2.5 px-3 text-right">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {filteredHistory.slice().reverse().map((h) => {
                const rCol = rankColor(h.newRating, C.dark)
                const on = h.contestId === selectedContest?.contestId
                return (
                  <tr key={h.contestId} className="hover:bg-[var(--panel2)] transition-colors cursor-pointer" tabIndex={0}
                    style={on ? { background: 'var(--panel2)', boxShadow: 'inset 3px 0 0 var(--acc)' } : null}
                    title="Show post-mortem"
                    onClick={() => pick(h.contestId)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(h.contestId))}>
                    <td className="py-2.5 px-3 whitespace-nowrap text-[11px]" style={{ color: 'var(--dim)' }}>
                      {fmtDate(h.ratingUpdateTimeSeconds)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold" style={{ color: 'var(--fg)' }}>{h.contestName}</span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-semibold">#{h.rank}</span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span style={{ color: 'var(--dim)' }}>{h.oldRating}</span> → <b style={{ color: rCol }}>{h.newRating}</b>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-right">
                      <span className="font-bold px-2 py-0.5 rounded text-[11px]" style={{
                        color: h.delta >= 0 ? 'var(--acc)' : 'var(--bad)',
                        background: h.delta >= 0 ? 'color-mix(in srgb, var(--acc) 10%, transparent)' : 'color-mix(in srgb, var(--bad) 10%, transparent)',
                      }}>
                        {signed(h.delta)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Predict p={p} />
    </div>
  )
}

const Label = ({ children }) => <span className="label block mb-1.5" style={{ fontSize: 9.5, color: 'var(--faint)' }}>{children}</span>

const COLS = 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(80px,180px)_minmax(0,1fr)_84px]'

/** "Where the hours went": thinking span per problem, a tick per submission. */
function Playback({ round }) {
  const C = useTheme()
  const [bind, tipNode] = useHoverTip()
  const x = (sec) => `${(100 * Math.min(sec, round.span)) / round.span}%`
  const ticks = [0, 0.5, 1].map((f) => Math.round((f * round.span) / 60) * 60) // more collide on narrow panels
  return (
    <div className="flex flex-col gap-2 rounded p-4" style={{ border: '1px solid var(--line2)' }}>
      {tipNode}
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <span className="label">Where the {round.span >= 3600 ? `${+(round.span / 3600).toFixed(2)} hours` : `${Math.round(round.span / 60)} minutes`} went</span>
        <span className="sub flex items-center gap-3">
          <span><span style={{ color: 'var(--acc)' }}>▮</span> AC</span>
          <span><span style={{ color: 'var(--bad)' }}>▮</span> failed</span>
          <span><span style={{ color: 'var(--line2)' }}>■</span> thinking</span>
        </span>
      </div>
      {round.rows.map((r) => (
        <div key={r.index} className={`grid ${COLS} items-center gap-x-3 gap-y-1`} style={{ fontSize: 11.5 }}>
          <span className="truncate" title={r.name}><b style={{ color: 'var(--acc)' }}>{r.index}.</b> {r.name}</span>
          {/* phones: name + status on one line, full-width bar underneath */}
          <div className="relative col-span-2 row-start-2 h-5 rounded-sm sm:col-span-1 sm:row-start-auto" style={{ background: 'var(--panel2)' }}>
            <div className="absolute inset-y-0 rounded-sm" style={{ left: x(r.from), width: `calc(${x(r.end)} - ${x(r.from)})`, background: 'var(--line2)' }} />
            {r.subs.map((s) => (
              <span key={s.id} className="hov absolute -inset-y-0.5" tabIndex={0}
                style={{ left: x(s.at), width: 3, marginLeft: -1.5, background: s.verdict === 'OK' ? C.acc : C.bad, cursor: 'default' }}
                {...bind(() => (
                  <TipBox title={`${r.index} · ${clock(s.at)}`}>
                    <b style={{ color: verdictColor(s.verdict, C) }}>{verdictLabel(s.verdict)}</b>
                    {s.verdict !== 'OK' && s.verdict !== 'COMPILATION_ERROR' && <span style={{ color: 'var(--faint)' }}> · passed {s.passed} tests</span>}
                  </TipBox>
                ))} />
            ))}
          </div>
          <span className="text-right font-bold tabular-nums" style={{ color: r.ac ? 'var(--acc)' : 'var(--bad)' }}>{r.ac ? `AC ${clock(r.end)}` : 'Unsolved'}</span>
        </div>
      ))}
      <div className={`grid ${COLS} gap-x-3`}>
        <span className="hidden sm:block" />
        <div className="relative col-span-2 h-4 sub sm:col-span-1">
          {ticks.map((t, i) => (
            <span key={i} className="absolute" style={{ left: x(t), transform: `translateX(${i === 0 ? 0 : i === 4 ? -100 : -50}%)` }}>
              {Math.floor(t / 3600)}:{String(Math.floor((t % 3600) / 60)).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Breakdown({ rows, contestId }) {
  const C = useTheme()
  return (
    <div className="flex flex-col rounded" style={{ border: '1px solid var(--line2)' }}>
      <span className="label px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>Problem breakdown</span>
      {rows.map((r, i) => (
        <div key={r.index} className={`flex flex-col gap-2 px-4 py-3 ${i ? 'row-line' : ''}`}
          style={r.ac ? null : { boxShadow: 'inset 3px 0 0 var(--bad)', background: 'color-mix(in srgb, var(--bad) 5%, transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <a href={problemUrl(contestId, r.index)} target="_blank" rel="noreferrer" className="min-w-0 truncate font-bold" style={{ color: 'var(--fg)', fontSize: 12.5 }}>
              <span style={{ color: 'var(--acc)' }}>{r.index}</span> {r.name}
            </a>
            <span className="chip flex-none" style={r.ac ? { color: 'var(--acc)', borderColor: 'var(--acc)' } : { color: 'var(--bad)', borderColor: 'var(--bad)' }}>
              {r.ac ? `AC in ${clock(r.end)}` : 'UNSOLVED'}
            </span>
          </div>
          <div className="sub flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{r.subs.length} attempt{r.subs.length === 1 ? '' : 's'}</span>
            {r.rating && <span style={{ color: rankColor(r.rating, C.dark) }}>{r.rating}</span>}
            {r.penalty > 0 && <span style={{ color: 'var(--warn)' }} title="Wrong attempts before AC; compilation errors and test-1 failures carry no penalty">+{r.penalty} penalty</span>}
            {r.wasted > 0 && <span style={{ color: 'var(--bad)' }}>{clock(r.wasted)} after first fail</span>}
          </div>
          {r.tags.length > 0 && <div className="flex flex-wrap gap-1">{r.tags.map((t) => <span key={t} className="chip" style={{ fontSize: 9.5, padding: '2px 6px' }}>{t}</span>)}</div>}
        </div>
      ))}
    </div>
  )
}

function CostlyTags({ round }) {
  const top = round.tags[0]
  return (
    <div className="flex flex-col rounded" style={{ border: '1px solid var(--line2)' }}>
      <span className="label px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>Tags that cost you time</span>
      {!round.tags.length ? (
        <span className="px-4 py-5" style={{ color: 'var(--dim)', fontSize: 11.5 }}>Clean round — no failed attempts before your accepted solutions.</span>
      ) : (
        <>
          {round.tags.map((t, i) => (
            <div key={t.tag} className={`flex items-center justify-between gap-3 px-4 py-3 ${i ? 'row-line' : ''}`}>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-bold" style={{ color: 'var(--fg)', fontSize: 12.5 }}>{t.tag}</span>
                <span className="sub">struggled in {t.struggled.join(', ')} · {t.problems.length} of {round.rows.length} problems</span>
              </div>
              <span className="font-bold tabular-nums" style={{ color: 'var(--bad)' }}>-{clock(t.wasted)}</span>
            </div>
          ))}
          <p className="mt-auto px-4 py-3" style={{ color: 'var(--dim)', fontSize: 11, lineHeight: 1.7, borderTop: '1px solid var(--line)', boxShadow: 'inset 3px 0 0 var(--bad)' }}>
            You lost <b style={{ color: 'var(--fg)' }}>{clock(round.wasted)}</b> to failed attempts — {pct(round.wasted / round.span)} of the round.
            {' '}{top.struggled.length} of {round.rows.filter((r) => r.wasted).length} struggling problem{round.rows.filter((r) => r.wasted).length === 1 ? '' : 's'} involved <b style={{ color: 'var(--fg)' }}>{top.tag}</b>.
          </p>
        </>
      )}
    </div>
  )
}
