import { isoDay } from './lib'

// Supported judges; ids match the backend's /api/platform/{id}/{handle}
export const PLATFORMS = [
  { id: 'cf', name: 'Codeforces', short: 'CF', ph: 'tourist', re: /^[A-Za-z0-9_.-]{2,24}$/ },
  { id: 'lc', name: 'LeetCode', short: 'LC', ph: 'neal_wu', re: /^[A-Za-z0-9_-]{1,40}$/ },
  { id: 'ac', name: 'AtCoder', short: 'AC', ph: 'tourist', re: /^[A-Za-z0-9_]{3,16}$/ },
  { id: 'cc', name: 'CodeChef', short: 'CC', ph: 'gennady.korotkevich', re: /^[A-Za-z0-9_.]{1,30}$/ },
]
export const PLAT = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]))
export const pColor = (id) => `var(--p-${id})`

/** "cf:tourist,lc:neal_wu" <-> { cf: 'tourist', lc: 'neal_wu' } — the shareable hub URL segment. */
export function parseSpec(spec) {
  const out = {}
  for (const part of (spec || '').split(',')) {
    const [id, h] = part.split(':')
    if (PLAT[id] && h && PLAT[id].re.test(h)) out[id] = h
  }
  return out
}
export const toSpec = (acc) => PLATFORMS.filter((p) => acc[p.id]).map((p) => `${p.id}:${acc[p.id]}`).join(',')

const KEY = 'accounts'
export function loadAccounts() {
  try {
    return parseSpec(localStorage.getItem(KEY) || '')
  } catch {
    return {}
  }
}
export function saveAccounts(acc) {
  try {
    localStorage.setItem(KEY, toSpec(acc))
  } catch { /* storage blocked */ }
}

// Map each judge's tag vocabulary onto one set of topic names so "DP" on LeetCode and "dp" on Codeforces add up.
const CANON = {
  'dp': 'Dynamic programming', 'dynamic programming': 'Dynamic programming', 'memoization': 'Dynamic programming',
  'graphs': 'Graphs', 'graph': 'Graphs', 'graph theory': 'Graphs', 'dfs and similar': 'DFS / BFS', 'depth-first search': 'DFS / BFS',
  'breadth-first search': 'DFS / BFS', 'shortest paths': 'Shortest paths', 'shortest path': 'Shortest paths',
  'trees': 'Trees', 'tree': 'Trees', 'binary tree': 'Trees', 'binary search tree': 'Trees',
  'greedy': 'Greedy', 'math': 'Math', 'number theory': 'Number theory', 'combinatorics': 'Combinatorics',
  'strings': 'Strings', 'string': 'Strings', 'string matching': 'Strings', 'hashing': 'Hashing', 'hash function': 'Hashing', 'rolling hash': 'Hashing',
  'binary search': 'Binary search', 'sortings': 'Sorting', 'sorting': 'Sorting', 'two pointers': 'Two pointers',
  'bitmasks': 'Bit manipulation', 'bit manipulation': 'Bit manipulation', 'bitmask': 'Bit manipulation',
  'dsu': 'Union-find', 'union find': 'Union-find', 'geometry': 'Geometry', 'implementation': 'Implementation', 'simulation': 'Implementation',
  'constructive algorithms': 'Constructive', 'brute force': 'Brute force', 'enumeration': 'Brute force', 'backtracking': 'Backtracking',
  'data structures': 'Data structures', 'segment tree': 'Data structures', 'binary indexed tree': 'Data structures',
  'heap (priority queue)': 'Heaps', 'stack': 'Stack / queue', 'queue': 'Stack / queue', 'monotonic stack': 'Stack / queue',
  'array': 'Arrays', 'hash table': 'Hash table', 'prefix sum': 'Prefix sums', 'sliding window': 'Two pointers',
  'divide and conquer': 'Divide & conquer', 'games': 'Game theory', 'game theory': 'Game theory', 'probabilities': 'Probability', 'probability and statistics': 'Probability',
  'interactive': 'Interactive', 'topological sort': 'Graphs', 'linked list': 'Linked lists', 'matrix': 'Matrices', 'matrices': 'Matrices',
}
export const canonTag = (t) => CANON[t.toLowerCase()] ?? t.replace(/^./, (c) => c.toUpperCase())

// Core topics worth covering; the least-solved of these become the practice suggestions.
export const CORE = ['Dynamic programming', 'Graphs', 'Trees', 'Greedy', 'Math', 'Number theory', 'Strings', 'Binary search', 'Data structures',
  'Two pointers', 'Bit manipulation', 'Combinatorics', 'Shortest paths', 'Union-find', 'DFS / BFS', 'Sorting', 'Geometry', 'Game theory']
const CF_TAG = { 'Dynamic programming': 'dp', Graphs: 'graphs', Trees: 'trees', Greedy: 'greedy', Math: 'math', 'Number theory': 'number theory',
  Strings: 'strings', 'Binary search': 'binary search', 'Data structures': 'data structures', 'Two pointers': 'two pointers',
  'Bit manipulation': 'bitmasks', Combinatorics: 'combinatorics', 'Shortest paths': 'shortest paths', 'Union-find': 'dsu',
  'DFS / BFS': 'dfs and similar', Sorting: 'sortings', Geometry: 'geometry', 'Game theory': 'games' }
const LC_TAG = { 'Dynamic programming': 'dynamic-programming', Graphs: 'graph', Trees: 'tree', Greedy: 'greedy', Math: 'math',
  'Number theory': 'number-theory', Strings: 'string', 'Binary search': 'binary-search', 'Data structures': 'segment-tree',
  'Two pointers': 'two-pointers', 'Bit manipulation': 'bit-manipulation', Combinatorics: 'combinatorics', 'Shortest paths': 'shortest-path',
  'Union-find': 'union-find', 'DFS / BFS': 'breadth-first-search', Sorting: 'sorting', Geometry: 'geometry', 'Game theory': 'game-theory' }
export const practiceLinks = (topic, rating) => [
  CF_TAG[topic] && ['Codeforces', `https://codeforces.com/problemset?tags=${encodeURIComponent(CF_TAG[topic])}${rating ? `,${Math.max(800, Math.round(rating / 100) * 100 - 100)}-${Math.round(rating / 100) * 100 + 200}` : ''}`],
  LC_TAG[topic] && ['LeetCode', `https://leetcode.com/tag/${LC_TAG[topic]}/`],
].filter(Boolean)

/** (current, longest) run of consecutive active days; current may end yesterday. */
export function streaks(days, today = new Date()) {
  const set = new Set(days)
  const sorted = [...set].sort()
  let longest = 0, run = 0, prev = null
  for (const d of sorted) {
    const t = new Date(`${d}T00:00`)
    run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = t
  }
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  if (!set.has(isoDay(d))) d.setDate(d.getDate() - 1)
  let current = 0
  while (set.has(isoDay(d))) { current++; d.setDate(d.getDate() - 1) }
  return { current, longest }
}

const LEVELS = ['easy', 'medium', 'hard']

/** Merge loaded platform profiles into the combined view model. `ps` = [{ platform, ...normalized }]. */
export function combine(ps) {
  const daily = {}
  for (const p of ps) for (const [d, n] of Object.entries(p.daily)) (daily[d] ??= {})[p.platform] = n
  const days = Object.keys(daily)
  const totalSubs = (d) => Object.values(daily[d] ?? {}).reduce((s, n) => s + n, 0)
  const topics = {}
  for (const p of ps) for (const t of p.tags) {
    const k = canonTag(t.tag)
    ;(topics[k] ??= { topic: k, total: 0 })[p.platform] = (topics[k][p.platform] ?? 0) + t.solved
    topics[k].total += t.solved
  }
  const levels = LEVELS.map((level) => ({
    level,
    ...Object.fromEntries(ps.map((p) => [p.platform, p.difficulty.filter((d) => d.level === level).reduce((s, d) => s + d.count, 0)])),
  }))
  const week = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  for (let d = new Date(monday); d <= today; d.setDate(d.getDate() + 1)) week.push({ day: isoDay(d), n: totalSubs(isoDay(d)) })
  const last = days.length ? days.sort().at(-1) : null
  const share = ps.map((p) => ({ platform: p.platform, subs: Object.values(p.daily).reduce((s, n) => s + n, 0) }))
  const contests = ps.flatMap((p) => p.contests.map((c) => ({ ...c, platform: p.platform })))
  return {
    daily,
    solved: ps.reduce((s, p) => s + p.solved, 0),
    contests,
    streak: streaks(days, today),
    activeDays: days.length,
    subsYear: days.reduce((s, d) => s + totalSubs(d), 0),
    lastActive: last,
    topics: Object.values(topics).sort((a, b) => b.total - a.total),
    levels,
    week,
    share,
    recent: ps.flatMap((p) => p.recent.map((r) => ({ ...r, platform: p.platform }))).sort((a, b) => b.t - a.t).slice(0, 30),
  }
}

/** Contests per month, last `n` months, one key per platform. */
export function contestsByMonth(contests, n = 24) {
  const now = new Date()
  const rows = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    rows.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: 'short' }), year: d.getFullYear() })
  }
  const idx = Object.fromEntries(rows.map((r, i) => [r.key, i]))
  for (const c of contests) {
    const d = new Date(c.t * 1000)
    const i = idx[`${d.getFullYear()}-${d.getMonth()}`]
    if (i != null) rows[i][c.platform] = (rows[i][c.platform] ?? 0) + 1
  }
  return rows
}

/** Short plain-language observations over the combined data. */
export function insights(ps, m) {
  const out = []
  const sum = m.share.reduce((s, x) => s + x.subs, 0)
  const top = [...m.share].sort((a, b) => b.subs - a.subs)[0]
  if (sum && top?.subs && ps.length > 1) out.push(`${PLAT[top.platform].name} gets ${Math.round((100 * top.subs) / sum)}% of your submissions over the last year.`)
  if (m.lastActive) {
    const gap = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(`${m.lastActive}T00:00`)) / 864e5)
    if (gap > 2) out.push(`Last submission anywhere was ${gap} days ago — a small problem today restarts the streak.`)
  }
  if (m.streak.current >= 3) out.push(`${m.streak.current}-day combined streak running (best ${m.streak.longest}).`)
  const hard = m.levels.find((l) => l.level === 'hard')
  const tot = m.levels.reduce((s, l) => s + ps.reduce((a, p) => a + (l[p.platform] ?? 0), 0), 0)
  const hardN = ps.reduce((a, p) => a + (hard[p.platform] ?? 0), 0)
  if (tot >= 30) {
    const r = hardN / tot
    out.push(r < 0.1 ? `Only ${Math.round(r * 100)}% of solves are hard — push the difficulty up a notch.` : `${Math.round(r * 100)}% of solves are hard problems.`)
  }
  const weak = m.topics.length ? CORE.map((t) => m.topics.find((x) => x.topic === t) ?? { topic: t, total: 0 }).sort((a, b) => a.total - b.total).slice(0, 3) : []
  if (weak.length) out.push(`Least practiced core topics: ${weak.map((w) => `${w.topic} (${w.total})`).join(', ')}.`)
  const rated = ps.filter((p) => p.contests.length)
  const recentUp = rated.map((p) => ({ p, d: p.contests.slice(-5).reduce((s, c) => s + (c.delta ?? 0), 0) })).sort((a, b) => b.d - a.d)
  if (recentUp.length && recentUp[0].d > 0) out.push(`Best recent form: ${PLAT[recentUp[0].p.platform].name}, +${recentUp[0].d} over the last ${Math.min(5, recentUp[0].p.contests.length)} contests.`)
  return out
}

export function icsFor(contests) {
  const f = (s) => new Date(s * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const esc = (s) => s.replace(/[\\,;]/g, (c) => `\\${c}`)
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//cf-visualizer//contests//EN',
    ...contests.flatMap((c) => ['BEGIN:VEVENT', `UID:${c.platform}-${c.start}-${c.name.replace(/\W+/g, '')}@cf-visualizer`, `DTSTAMP:${f(Date.now() / 1000)}`,
      `DTSTART:${f(c.start)}`, `DTEND:${f(c.start + (c.duration || 7200))}`, `SUMMARY:${esc(`[${PLAT[c.platform].name}] ${c.name}`)}`, `URL:${c.url}`, 'END:VEVENT']),
    'END:VCALENDAR'].join('\r\n')
}

export const gcalLink = (c) => {
  const f = (s) => new Date(s * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`[${PLAT[c.platform].name}] ${c.name}`)}&dates=${f(c.start)}/${f(c.start + (c.duration || 7200))}&details=${encodeURIComponent(c.url)}`
}

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
