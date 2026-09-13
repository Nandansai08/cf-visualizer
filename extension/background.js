const DEFAULTS = { handle: '', backend: 'http://localhost:8000', dashboard: 'http://localhost:5173' }
const TTL = 30 * 60 * 1000

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS))) }
}

async function summary(force) {
  const s = await settings()
  if (!s.handle) return { error: 'Set your Codeforces handle in the CF Visualizer popup.', noHandle: true }
  const key = `summary:${s.handle.toLowerCase()}`
  const { [key]: cached } = await chrome.storage.local.get(key)
  if (!force && cached && Date.now() - cached.at < TTL) return { data: cached.data, at: cached.at }
  try {
    const r = await fetch(`${s.backend}/api/summary/${encodeURIComponent(s.handle)}`)
    const body = await r.json().catch(() => null)
    if (!r.ok) throw new Error(body?.detail || `Backend returned HTTP ${r.status}`)
    const at = Date.now()
    await chrome.storage.local.set({ [key]: { at, data: body } })
    return { data: body, at }
  } catch (e) {
    if (cached) return { data: cached.data, at: cached.at, stale: true }
    return { error: e instanceof TypeError ? `Visualizer backend unreachable at ${s.backend}` : e.message }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const work = msg.type === 'summary' ? summary(msg.force) : Promise.resolve({})
  work.then(async (r) => reply({ ...r, settings: await settings() }))
  return true // async reply
})
