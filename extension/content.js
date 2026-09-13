// One content script for problemset problems, contest problems and profile pages.
const TONES = {
  good: { line: '#2f7d52', bg: '#eaf7ef', text: '#17552f', sub: '#3c5c48' },
  level: { line: '#1f6f9c', bg: '#e8f3fa', text: '#124766', sub: '#3d5a6c' },
  hard: { line: '#b23a3a', bg: '#fbecec', text: '#7a1f1f', sub: '#6b4545' },
  contest: { line: '#c89211', bg: '#fff7e0', text: '#6b4d00', sub: '#6f5a2a' },
  neutral: { line: '#8a94a0', bg: '#f3f5f7', text: '#2e3640', sub: '#5d6771' },
}

;(async () => {
  const path = location.pathname
  const profile = path.match(/^\/profile\/([^/?#]+)/)
  if (profile) return profileButton(decodeURIComponent(profile[1]))

  const m = path.match(/^\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/) || path.match(/^\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/)
  if (!m) return
  const inContest = path.startsWith('/contest/')
  const key = `${m[1]}-${m[2].toUpperCase()}`

  // Tags + difficulty live in the sidebar "Problem tags" box; CF hides them while a contest is running.
  const boxes = [...document.querySelectorAll('.tag-box')].map((e) => e.textContent.trim())
  const rating = Number(boxes.find((t) => /^\*\d+$/.test(t))?.slice(1)) || null
  const tags = boxes.filter((t) => !t.startsWith('*'))

  const res = await chrome.runtime.sendMessage({ type: 'summary' })
  let title
  let hits = []
  const details = []
  let tone = 'neutral'
  if (res.error) {
    title = res.error
  } else {
    const u = res.data
    hits = tags.filter((t) => u.weak.includes(t))
    if (!tags.length) {
      title = inContest ? 'contest live · tags hidden by CF' : 'no tags on this problem yet'
      if (inContest) tone = 'contest'
    } else if (hits.length) {
      title = `${hits.length} of ${tags.length} tags are in your weak ${u.relative ? '(relative) ' : ''}clusters: `
    } else {
      title = `no overlap with your weak tags (${u.weak.slice(0, 3).join(', ') || 'none yet'})`
    }

    if (!rating) {
      details.push(inContest ? 'Difficulty hidden — read every problem before committing.' : 'No difficulty rating yet.')
    } else if (!u.rating) {
      details.push(`${rating} · you're unrated — problems ≤ 1200 are a good starting range.`)
    } else {
      const d = rating - u.rating
      const s = `${d >= 0 ? '+' : ''}${d}`
      if (d >= 300) { tone = 'hard'; details.push(`${rating} · ${s} vs your rating — ${inContest ? 'attempt after the easier problems' : 'very hard stretch'}.`) }
      else if (d >= 100) { tone = 'good'; details.push(`${rating} · ${s} above your rating — ${inContest ? 'solving this is a big rating gain' : 'good stretch problem'}.`) }
      else if (d > -100) { tone = 'level'; details.push(`${rating} · right at your level (${s}).`) }
      else details.push(`${rating} · ${s} below your rating — ${inContest ? 'aim to solve it fast' : 'warm-up / speed practice'}.`)
    }
    if (hits.length) {
      const detail = (u.weakDetail ?? []).filter((t) => hits.includes(t.tag))
      if (detail.length) details.push(`Solve rate on these tags: ${Math.round((100 * detail.reduce((a, t) => a + t.ratio, 0)) / detail.length)}%.`)
      if (tone === 'neutral' || tone === 'level') tone = 'good'
    }
    if (inContest && tags.length) tone = 'contest'
    if (u.solved.includes(key)) details.unshift('✓ already solved.')
    else if (u.attempted.includes(key)) details.unshift('✗ attempted before, not solved — worth an upsolve.')
    if (res.stale) details.push('(offline — cached data)')
  }

  const t = TONES[tone]
  const host = document.createElement('div')
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      .b{display:flex;align-items:center;gap:10px;border:1.5px solid ${t.line};background:${t.bg};border-radius:8px;padding:11px 13px;margin:0 0 14px;flex-wrap:wrap}
      .bar{width:7px;align-self:stretch;min-height:34px;background:${t.line};border-radius:3px;flex:none}
      .c{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
      .t{font:700 11.5px/1.35 ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace;color:${t.text}}
      .t .w{color:#a11}
      .s{font:400 11px/1.45 ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace;color:${t.sub}}
      a{font:500 10px/1 ui-monospace,Menlo,Consolas,monospace;color:${t.line};border:1px solid ${t.line};border-radius:5px;padding:5px 8px;white-space:nowrap;text-decoration:none;flex:none;letter-spacing:.06em}
    </style>
    <div class="b"><div class="bar"></div><div class="c"><span class="t"></span></div><a target="_blank">OPEN DASHBOARD ↗</a></div>`
  const tEl = root.querySelector('.t')
  tEl.append(`cf::visualizer — ${title}`)
  hits.forEach((h, i) => {
    const w = document.createElement('span')
    w.className = 'w'
    w.textContent = h
    tEl.append(w, i < hits.length - 1 ? ', ' : '')
  })
  for (const d of details) root.querySelector('.c').appendChild(document.createElement('span')).className = 's'
  root.querySelectorAll('.s').forEach((e, i) => (e.textContent = details[i]))
  const a = root.querySelector('a')
  if (res.noHandle) a.remove()
  else a.href = `${res.settings.dashboard}/#/u/${encodeURIComponent(res.data?.handle ?? res.settings.handle)}/weak`

  const target = document.querySelector('.problem-statement') ?? document.querySelector('#pageContent')
  target?.parentNode.insertBefore(host, target)
})()

async function profileButton(handle) {
  const { settings } = await chrome.runtime.sendMessage({ type: 'settings' })
  const a = document.createElement('a')
  a.href = `${settings.dashboard}/#/u/${encodeURIComponent(handle)}/dash`
  a.target = '_blank'
  a.textContent = 'Open in Visualizer ↗'
  a.style.cssText =
    'display:inline-block;margin-left:10px;padding:4px 10px;font:600 11px ui-monospace,Menlo,Consolas,monospace;vertical-align:middle;' +
    'color:#fff;background:#1f7a4d;border-radius:6px;text-decoration:none;letter-spacing:.02em'
  const h1 = document.querySelector('.main-info h1')
  if (h1) h1.appendChild(a)
  else document.querySelector('#pageContent')?.prepend(a)
}
