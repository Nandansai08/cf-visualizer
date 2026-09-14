import { useMemo, useState } from 'react'
import { fmtDate, problemUrl, rankColor, shortLang, verdictColor, verdictLabel } from './lib'
import { Panel, useTheme } from './ui'

const BUCKETS = [
  { label: '<1000', min: 0, max: 999 },
  { label: '1000–1199', min: 1000, max: 1199 },
  { label: '1200–1399', min: 1200, max: 1399 },
  { label: '1400–1599', min: 1400, max: 1599 },
  { label: '1600–1899', min: 1600, max: 1899 },
  { label: '1900–2099', min: 1900, max: 2099 },
  { label: '2100–2399', min: 2100, max: 2399 },
  { label: '2400+', min: 2400, max: 9999 },
]

export default function Submissions({ p }) {
  const C = useTheme()
  const subs = p.submissions || p.recent || []

  // Ladder stats by rating band
  const ladder = useMemo(() => {
    const map = {}
    const problemsByBucket = {}
    BUCKETS.forEach((b) => {
      map[b.label] = { label: b.label, solved: 0, attempted: 0, total: 0 }
      problemsByBucket[b.label] = new Map()
    })

    subs.forEach((s) => {
      if (!s.rating) return
      const b = BUCKETS.find((b) => s.rating >= b.min && s.rating <= b.max)
      if (!b) return
      const key = `${s.contestId}-${s.index}`
      const m = problemsByBucket[b.label]
      if (!m.has(key)) {
        m.set(key, { solved: false, attempts: 0 })
      }
      const entry = m.get(key)
      entry.attempts += 1
      if (s.verdict === 'OK') entry.solved = true
    })

    BUCKETS.forEach((b) => {
      const m = problemsByBucket[b.label]
      let solved = 0
      let attempted = m.size
      m.forEach((val) => {
        if (val.solved) solved += 1
      })
      map[b.label] = { label: b.label, min: b.min, max: b.max, solved, attempted }
    })
    return BUCKETS.map((b) => map[b.label])
  }, [subs])

  // Filters
  const [search, setSearch] = useState('')
  const [verdictFilter, setVerdictFilter] = useState('ALL')
  const [tagFilter, setTagFilter] = useState('ALL')
  const [ratingFilter, setRatingFilter] = useState('ALL')
  const [langFilter, setLangFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const pageSize = 25

  // All unique tags & languages for dropdowns
  const allTags = useMemo(() => {
    const s = new Set()
    subs.forEach((item) => (item.tags || []).forEach((t) => s.add(t)))
    return Array.from(s).sort()
  }, [subs])

  const allLangs = useMemo(() => {
    const s = new Set()
    subs.forEach((item) => {
      if (item.lang) s.add(shortLang(item.lang))
    })
    return Array.from(s).sort()
  }, [subs])

  const filtered = useMemo(() => {
    return subs.filter((s) => {
      if (search) {
        const q = search.toLowerCase()
        const matchName = s.name?.toLowerCase().includes(q)
        const matchId = `${s.contestId}${s.index}`.toLowerCase().includes(q)
        if (!matchName && !matchId) return false
      }
      if (verdictFilter !== 'ALL' && s.verdict !== verdictFilter) return false
      if (tagFilter !== 'ALL' && !(s.tags || []).includes(tagFilter)) return false
      if (langFilter !== 'ALL' && shortLang(s.lang) !== langFilter) return false
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'CONTEST' && s.type !== 'CONTESTANT') return false
        if (typeFilter === 'PRACTICE' && s.type === 'CONTESTANT') return false
      }
      if (ratingFilter !== 'ALL') {
        const r = s.rating || 0
        if (ratingFilter === '<1000' && (r >= 1000 || r === 0)) return false
        if (ratingFilter === '1000-1400' && (r < 1000 || r >= 1400)) return false
        if (ratingFilter === '1400-1800' && (r < 1400 || r >= 1800)) return false
        if (ratingFilter === '1800-2200' && (r < 1800 || r >= 2200)) return false
        if (ratingFilter === '2200+' && r < 2200) return false
      }
      return true
    })
  }, [subs, search, verdictFilter, tagFilter, ratingFilter, langFilter, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="grid gap-6">
      {/* Problem Ladder Section */}
      <Panel label="Problem Ladder · Difficulty distribution">
        <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-4">
          {ladder.map((b) => {
            const pct = b.attempted ? Math.round((b.solved / b.attempted) * 100) : 0
            const col = rankColor(b.min || 800, C.dark)
            return (
              <div key={b.label} className="flex flex-col gap-2.5 p-3.5 rounded" style={{ background: 'var(--panel2)', border: '1px solid var(--line2)' }}>
                <div className="flex justify-between items-baseline gap-2" style={{ font: "600 12px/1.2 'JetBrains Mono'" }}>
                  <span style={{ color: col }}>{b.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg)', fontWeight: 600 }}>
                    {b.solved} <span style={{ fontSize: 10, color: 'var(--faint)', fontWeight: 400 }}>solved</span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: col }} />
                </div>
                <div className="flex justify-between items-center text-[11px]" style={{ color: 'var(--dim)', font: "11px 'JetBrains Mono'" }}>
                  <span>{b.attempted} tried</span>
                  <span style={{ color: pct > 0 ? 'var(--fg)' : 'var(--faint)' }}>{pct}% accuracy</span>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      {/* Submissions Log Section */}
      <Panel label={`Submission log · ${filtered.length} matching of ${subs.length}`}>
        <div className="flex flex-col gap-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center gap-2.5 p-3 rounded" style={{ background: 'var(--panel2)', border: '1px solid var(--line2)' }}>
            <input
              type="text"
              placeholder="Search problem name or code (e.g. 4A)..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded outline-none text-xs"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--fg)', font: "12px 'JetBrains Mono'" }}
            />
            <select
              value={verdictFilter}
              onChange={(e) => { setVerdictFilter(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 rounded outline-none text-xs"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--fg)' }}
            >
              <option value="ALL">All Verdicts</option>
              <option value="OK">AC (Accepted)</option>
              <option value="WRONG_ANSWER">WA (Wrong Answer)</option>
              <option value="TIME_LIMIT_EXCEEDED">TLE (Time Limit Exceeded)</option>
              <option value="RUNTIME_ERROR">RE (Runtime Error)</option>
              <option value="COMPILATION_ERROR">CE (Compilation Error)</option>
              <option value="MEMORY_LIMIT_EXCEEDED">MLE (Memory Limit)</option>
              <option value="CHALLENGED">HACK (Hacked)</option>
            </select>
            <select
              value={tagFilter}
              onChange={(e) => { setTagFilter(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 rounded outline-none text-xs"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--fg)' }}
            >
              <option value="ALL">All Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={ratingFilter}
              onChange={(e) => { setRatingFilter(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 rounded outline-none text-xs"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--fg)' }}
            >
              <option value="ALL">All Ratings</option>
              <option value="<1000">&lt; 1000</option>
              <option value="1000-1400">1000 – 1400</option>
              <option value="1400-1800">1400 – 1800</option>
              <option value="1800-2200">1800 – 2200</option>
              <option value="2200+">2200+</option>
            </select>
            <select
              value={langFilter}
              onChange={(e) => { setLangFilter(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 rounded outline-none text-xs"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--fg)' }}
            >
              <option value="ALL">All Languages</option>
              {allLangs.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="px-2.5 py-1.5 rounded outline-none text-xs"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--fg)' }}
              aria-label="Submission type"
            >
              <option value="ALL">Contest + Practice</option>
              <option value="CONTEST">In contest</option>
              <option value="PRACTICE">Practice & virtual</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded" style={{ border: '1px solid var(--line2)' }}>
            <table className="w-full text-left border-collapse" style={{ font: "12px/1.5 'JetBrains Mono'" }}>
              <thead>
                <tr className="uppercase text-[10.5px]" style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--line)', color: 'var(--faint)' }}>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Problem</th>
                  <th className="py-2.5 px-3">Rating</th>
                  <th className="py-2.5 px-3">Verdict</th>
                  <th className="py-2.5 px-3">Lang</th>
                  <th className="py-2.5 px-3">Time / Mem</th>
                  <th className="py-2.5 px-3 text-right">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center" style={{ color: 'var(--dim)' }}>
                      No submissions match the selected filters.
                    </td>
                  </tr>
                ) : (
                  paginated.map((s) => {
                    const vCol = verdictColor(s.verdict, C)
                    const rCol = rankColor(s.rating, C.dark)
                    return (
                      <tr key={s.id} className="hover:bg-[var(--panel2)] transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap text-[11px]" style={{ color: 'var(--dim)' }}>
                          {fmtDate(s.t)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="max-w-[280px] overflow-hidden text-ellipsis whitespace-nowrap font-semibold" style={{ color: 'var(--fg)' }} title={s.name}>
                            {s.contestId && s.index ? `${s.contestId}${s.index} - ` : ''}{s.name}
                          </div>
                          {s.tags && s.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {s.tags.slice(0, 3).map((t) => (
                                <span key={t} className="px-1 py-px rounded text-[9.5px]" style={{ background: 'var(--line)', color: 'var(--dim)' }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {s.rating ? (
                            <span className="font-bold px-1.5 py-0.5 rounded text-[11px]" style={{ color: rCol, background: 'color-mix(in srgb, currentColor 10%, transparent)' }}>
                              {s.rating}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--faint)' }}>—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-semibold px-2 py-0.5 rounded text-[11px]" style={{ color: vCol, background: `color-mix(in srgb, ${vCol} 12%, transparent)` }}>
                            {verdictLabel(s.verdict)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-[11px]" style={{ color: 'var(--dim)' }}>
                          {shortLang(s.lang)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-[10.5px]" style={{ color: 'var(--faint)' }}>
                          {s.timeMs ? `${s.timeMs} ms` : '—'} / {s.memBytes ? `${Math.round(s.memBytes / 1024)} KB` : '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-right">
                          {s.contestId && s.index && (
                            <a href={problemUrl(s.contestId, s.index)} target="_blank" rel="noreferrer" className="btn px-2 py-0.5 text-[10.5px] mr-1.5">
                              Problem ↗
                            </a>
                          )}
                          {s.contestId && s.id && (
                            <a href={`https://codeforces.com/contest/${s.contestId}/submission/${s.id}`} target="_blank" rel="noreferrer" className="btn px-2 py-0.5 text-[10.5px]">
                              # {s.id}
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1 text-xs" style={{ font: "12px 'JetBrains Mono'" }}>
              <span style={{ color: 'var(--dim)' }}>
                Page <b style={{ color: 'var(--fg)' }}>{currentPage}</b> of <b style={{ color: 'var(--fg)' }}>{totalPages}</b> ({filtered.length} items)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn px-3 py-1 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="btn px-3 py-1 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
