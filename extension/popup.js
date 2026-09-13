const $ = (id) => document.getElementById(id)
const TIERS = [[2400, '#ff5a5a'], [2100, '#ffa53a'], [1900, '#c77dff'], [1600, '#6b8cff'], [1400, '#2dd4bf'], [1200, '#4ade80']]
const color = (r) => (r == null ? '#828d9c' : TIERS.find(([min]) => r >= min)?.[1] ?? '#9aa3ad')

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props)
  e.append(...kids)
  return e
}

async function render(force) {
  $('view').replaceChildren(el('span', { className: 'muted', textContent: 'Loading…' }))
  const res = await chrome.runtime.sendMessage({ type: 'summary', force })
  const s = res.settings
  for (const k of ['handle', 'backend', 'dashboard']) $(k).value = s[k]
  if (res.error) {
    $('view').replaceChildren(el('p', { className: 'err', textContent: res.error }))
    if (res.noHandle) $('settings').open = true
    return
  }
  const u = res.data
  const refresh = el('button', { className: 'link', textContent: 'refresh' })
  refresh.onclick = () => render(true)
  const mins = Math.round((Date.now() - res.at) / 60000)
  const weak = (u.weakDetail ?? []).slice(0, 3)
  $('view').replaceChildren(
    el('div', { className: 'top' },
      el('img', { className: 'av', src: u.avatar ?? '', alt: '' }),
      el('div', {},
        el('div', { className: 'handle', textContent: u.handle, style: `color:${color(u.rating)}` }),
        el('div', { className: 'muted', textContent: `${u.rank ?? 'unrated'} · ${u.rating ?? '—'}` })),
      el('div', { className: 'delta' }, el('div', { textContent: u.solved.length }), el('div', { className: 'muted', textContent: 'solved' }))),
    el('div', { className: 'label', textContent: u.relative ? 'Relatively weakest tags' : 'Your weakest tags' }),
    ...(weak.length
      ? weak.map((t) => el('div', { className: 'tag' },
          el('span', { textContent: t.tag }), el('b', { textContent: `${Math.round(t.ratio * 100)}%` }),
          el('div', { className: 'bar' }, el('span', { style: `width:${Math.round(t.ratio * 100)}%` }))))
      : [el('div', { className: 'muted', textContent: 'Not enough attempts per tag yet' })]),
    el('div', { className: 'muted', style: 'display:flex;justify-content:space-between;margin-top:10px' },
      el('span', { textContent: `max ${u.maxRating ?? '—'}` }),
      el('span', {}, `${res.stale ? 'cached' : 'synced'} ${mins ? `${mins}m ago` : 'now'} · `, refresh)),
    el('a', { className: 'btn', href: `${s.dashboard}/#/u/${encodeURIComponent(u.handle)}/dash`, target: '_blank', textContent: 'Open full dashboard ↗' }),
  )
}

$('form').onsubmit = async (e) => {
  e.preventDefault()
  await chrome.storage.sync.set({
    handle: $('handle').value.trim(),
    backend: $('backend').value.replace(/\/+$/, ''),
    dashboard: $('dashboard').value.replace(/\/+$/, ''),
  })
  $('settings').open = false
  render(true)
}

render(false)
