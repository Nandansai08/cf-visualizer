export const HANDLE_RE = /^[A-Za-z0-9_.-]{2,24}$/
export const tzOffset = -new Date().getTimezoneOffset()

const sync = (ok) => dispatchEvent(new CustomEvent('cf-sync', { detail: { ok, at: Date.now() } }))

export async function api(path) {
  let r
  try {
    r = await fetch(`/api${path}`)
  } catch {
    sync(false)
    throw new Error('Cannot reach the visualizer backend. Is it running on port 8000?')
  }
  let body = null
  try {
    body = await r.json()
  } catch {
    /* proxy/HTML error page */
  }
  sync(r.status < 500)
  if (!r.ok) {
    const err = new Error(typeof body?.detail === 'string' ? body.detail : `Request failed (${r.status})`)
    err.status = r.status
    throw err
  }
  return body
}

// Codeforces' official rank colours; dark variants lifted for contrast on near-black.
export const TIERS = [
  { min: -1e9, name: 'newbie', light: '#808080', dark: '#9aa3ad' },
  { min: 1200, name: 'pupil', light: '#008000', dark: '#4ade80' },
  { min: 1400, name: 'specialist', light: '#03a89e', dark: '#2dd4bf' },
  { min: 1600, name: 'expert', light: '#0000ff', dark: '#6b8cff' },
  { min: 1900, name: 'candidate master', light: '#aa00aa', dark: '#c77dff' },
  { min: 2100, name: 'master', light: '#ff8c00', dark: '#ffa53a' },
  { min: 2300, name: 'international master', light: '#ff8c00', dark: '#ffa53a' },
  { min: 2400, name: 'grandmaster', light: '#ff0000', dark: '#ff5a5a' },
  { min: 2600, name: 'international grandmaster', light: '#ff0000', dark: '#ff5a5a' },
  { min: 3000, name: 'legendary grandmaster', light: '#ff0000', dark: '#ff5a5a' },
]

export function rankColor(rating, dark) {
  if (rating == null) return dark ? '#828d9c' : '#5d6771'
  const t = TIERS.findLast((t) => rating >= t.min)
  return dark ? t.dark : t.light
}

/** Tier above `rating` (pupil for unrated), or null at the top. */
export function nextTier(rating) {
  const t = rating == null ? TIERS[1] : TIERS.find((t) => t.min > rating)
  if (!t) return null
  const prev = rating == null ? 0 : Math.max(TIERS.findLast((x) => rating >= x.min).min, 0)
  return { ...t, prev }
}

export function tierBands(lo, hi, dark) {
  return TIERS.map((t, i) => ({
    y1: Math.max(t.min, lo),
    y2: Math.min(TIERS[i + 1]?.min ?? 1e9, hi),
    color: dark ? t.dark : t.light,
  })).filter((b) => b.y1 < b.y2)
}

export const fmtDate = (sec) =>
  new Date(sec * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
export const fmtMonth = (sec) => {
  const d = new Date(sec * 1000)
  return `${d.toLocaleDateString(undefined, { month: 'short' })} '${String(d.getFullYear()).slice(2)}`
}

export function timeAgo(sec) {
  const s = Date.now() / 1000 - sec
  for (const [n, u] of [[31536000, 'y'], [2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']])
    if (s >= n) return `${Math.floor(s / n)}${u} ago`
  return 'just now'
}

export const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const problemUrl = (contestId, index) =>
  contestId >= 100000
    ? `https://codeforces.com/gym/${contestId}/problem/${index}`
    : `https://codeforces.com/problemset/problem/${contestId}/${index}`

export const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

/**
 * Round playback from one participant's in-contest submissions. Times are seconds from their own start
 * (CF's relativeTimeSeconds, so virtual/late starts line up). A problem's bar runs from the previous AC
 * (or 0:00) to its AC / last attempt; "wasted" is first failed attempt → AC or last attempt.
 */
export function roundTimeline(subs, start, duration) {
  const at = (s) => (s.rel != null && s.rel < 2 ** 31 - 1 ? s.rel : s.t - start)
  const byIdx = new Map()
  for (const s of subs.map((s) => ({ ...s, at: at(s) })).sort((a, b) => a.at - b.at)) {
    if (!byIdx.has(s.index)) byIdx.set(s.index, [])
    byIdx.get(s.index).push(s)
  }
  const rows = [...byIdx.values()].map((ss) => {
    const ac = ss.find((s) => s.verdict === 'OK')
    const tries = ac ? ss.slice(0, ss.indexOf(ac)) : ss
    const fails = tries.filter((s) => s.verdict !== 'OK')
    const end = ac ? ac.at : ss.at(-1).at
    return {
      index: ss[0].index, name: ss[0].name, rating: ss[0].rating, tags: ss[0].tags ?? [], subs: ss, ac, fails, end,
      // CF: compilation errors and failing test 1 carry no penalty
      penalty: fails.filter((s) => s.verdict !== 'COMPILATION_ERROR' && s.passed > 0).length,
      wasted: fails.length ? end - fails[0].at : 0,
      first: ss[0].at,
    }
  })
  const acs = rows.filter((r) => r.ac).map((r) => r.end)
  for (const r of rows) r.from = Math.max(0, ...acs.filter((t) => t <= r.first && t !== r.end))
  rows.sort((a, b) => a.index.localeCompare(b.index, undefined, { numeric: true }))
  const tags = new Map()
  for (const r of rows) for (const t of r.tags) {
    const e = tags.get(t) ?? { tag: t, wasted: 0, problems: [], struggled: [] }
    e.problems.push(r.index)
    if (r.wasted) { e.wasted += r.wasted; e.struggled.push(r.index) }
    tags.set(t, e)
  }
  return {
    rows,
    span: Math.max(duration || 0, ...rows.map((r) => r.end), 1),
    wasted: rows.reduce((s, r) => s + r.wasted, 0),
    tags: [...tags.values()].filter((t) => t.wasted).sort((a, b) => b.wasted - a.wasted),
  }
}

export const pct = (x) => `${Math.round(x * 100)}%`
export const signed = (n) => (n > 0 ? `+${n}` : `${n}`)
export const shortLang = (l) => l.replace(/^GNU\s*/, '').replace(/\s*\(.*\)$/, '').replace('Microsoft Visual ', 'MSVC ')

// [code, label, theme key or hex]
const VERDICTS = {
  OK: ['AC', 'ok', 'acc'],
  WRONG_ANSWER: ['WA', 'wrong answer', 'bad'],
  TIME_LIMIT_EXCEEDED: ['TLE', 'time limit exceeded', 'warn'],
  MEMORY_LIMIT_EXCEEDED: ['MLE', 'memory limit exceeded', '#c084fc'],
  RUNTIME_ERROR: ['RE', 'runtime error', '#a78bfa'],
  COMPILATION_ERROR: ['CE', 'compilation error', '#60a5fa'],
  IDLENESS_LIMIT_EXCEEDED: ['ILE', 'idleness limit', 'acc2'],
  CHALLENGED: ['HACK', 'hacked', '#fb923c'],
  SKIPPED: ['SKIP', 'skipped', 'faint'],
  TESTING: ['…', 'testing', 'dim'],
}
export const verdictCode = (v) => VERDICTS[v]?.[0] ?? v.slice(0, 3)
export const verdictLabel = (v) => VERDICTS[v]?.[1] ?? v.replaceAll('_', ' ').toLowerCase()
export const verdictColor = (v, C) => {
  const c = VERDICTS[v]?.[2] ?? 'dim'
  return C[c] ?? c
}
