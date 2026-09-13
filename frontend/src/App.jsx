import { useEffect, useMemo, useState } from 'react'
import Compare from './Compare'
import Profile from './Dashboard'
import { HANDLE_RE, timeAgo } from './lib'
import { Panel, ThemeCtx, readTheme } from './ui'

const TABS = [['dash', '01', 'Dashboard'], ['weak', '02', 'Weak topics'], ['predict', '03', 'Predict'], ['compare', '04', 'Compare'], ['ext', '05', 'Extension']]
const LOOKS = ['phosphor', 'amber', 'daylight']

function useRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const f = () => setHash(location.hash)
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
}

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}

function useSync() {
  const [s, setS] = useState(null)
  const [, tick] = useState(0)
  useEffect(() => {
    const f = (e) => setS(e.detail)
    addEventListener('cf-sync', f)
    const id = setInterval(() => tick((n) => n + 1), 30000)
    return () => { removeEventListener('cf-sync', f); clearInterval(id) }
  }, [])
  return s
}

function Terminal({ handle, tab, big }) {
  const [h, setH] = useState(handle ?? '')
  const [err, setErr] = useState('')
  useEffect(() => setH(handle ?? ''), [handle])
  function go(e) {
    e.preventDefault()
    if (!HANDLE_RE.test(h)) return setErr('2–24 chars: letters, digits, _ - .')
    setErr('')
    location.hash = `#/u/${h}/${['weak', 'predict'].includes(tab) ? tab : 'dash'}`
  }
  return (
    <form onSubmit={go} className={`flex flex-col gap-1 ${big ? 'w-full max-w-xl' : 'min-w-0 flex-1'}`} style={big ? null : { maxWidth: 420 }}>
      <label className="flex items-center gap-2.5" style={{ border: '1px solid var(--line2)', background: 'var(--panel2)', borderRadius: 7, padding: big ? '16px 16px' : '8px 11px' }}>
        <span style={{ color: 'var(--acc)', font: `500 ${big ? 16 : 12}px/1 'JetBrains Mono'` }}>&gt;</span>
        <input aria-label="Codeforces handle" value={h} onChange={(e) => setH(e.target.value.trim())} placeholder="codeforces handle"
          className="min-w-0 flex-1 bg-transparent outline-none" style={{ color: 'var(--fg)', font: `500 ${big ? 17 : 12.5}px/1 'JetBrains Mono'` }} />
        <span className="caret" style={big ? { height: 20, width: 9 } : null} />
      </label>
      {err && <span className="sub" style={{ color: 'var(--bad)' }}>{err}</span>}
    </form>
  )
}

function Home() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 pt-24 text-center">
      <div className="flex items-center gap-3">
        <div style={{ width: 14, height: 14, background: 'var(--acc)', borderRadius: 3, boxShadow: '0 0 16px var(--acc)' }} />
        <span className="big" style={{ fontSize: 44 }}>cf<span style={{ color: 'var(--acc)' }}>::</span>visualizer</span>
      </div>
      <p style={{ color: 'var(--dim)', lineHeight: 1.8 }}>
        Rating history, weak-topic clusters, a personal problem recommender, Codeforces’ own rating formula and a forecast — for any handle.
      </p>
      <Terminal big />
      <p className="sub">
        try {['tourist', 'jiangly', 'Um_nik'].map((h) => <a key={h} href={`#/u/${h}/dash`} className="mx-1.5">{h}</a>)}
        · <a href={`#/compare/${store.get('handle', '')}/`}>compare two</a>
      </p>
    </div>
  )
}

function ExtPage() {
  const notes = [
    ['Manifest V3', 'The service worker holds the only network path. Content scripts never touch the backend directly — they message the worker.'],
    ['Cache', 'chrome.storage.local keyed by handle with a 30-minute TTL, so browsing 30 problems is one backend call, not thirty.'],
    ['CORS', 'FastAPI allows chrome-extension://<id> origins explicitly. If the backend is unreachable the badge falls back to cached data.'],
    ['Matches', 'problemset/problem/*, contest/*/problem/*, and profile/*. CF hides tags during live contests, so the contest badge says so.'],
  ]
  return (
    <div className="grid gap-4">
      <Panel label="Install · load unpacked">
        <ol className="grid gap-3" style={{ color: 'var(--dim)', lineHeight: 1.7 }}>
          {[
            <>Open <b style={{ color: 'var(--fg)' }}>chrome://extensions</b> and switch on Developer mode.</>,
            <>Click <b style={{ color: 'var(--fg)' }}>Load unpacked</b> and pick the <b style={{ color: 'var(--acc)' }}>extension/</b> folder of this repo.</>,
            <>Open the toolbar popup → settings → enter your handle. Backend and dashboard URLs default to localhost.</>,
            <>Visit any Codeforces problem: a cf::visualizer badge compares its tags and rating with your profile. Profile pages get an <b style={{ color: 'var(--fg)' }}>Open in Visualizer</b> button.</>,
          ].map((s, i) => (
            <li key={i} className="flex gap-3"><span style={{ color: 'var(--faint)' }}>0{i + 1}</span><span>{s}</span></li>
          ))}
        </ol>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {notes.map(([k, v]) => (
          <Panel key={k} label={<span style={{ color: 'var(--acc)' }}>{k}</span>}>
            <p style={{ color: 'var(--dim)', lineHeight: 1.7, fontSize: 11 }}>{v}</p>
          </Panel>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const [look, setLook] = useState(() => document.documentElement.dataset.look || 'phosphor')
  const C = useMemo(() => readTheme(look), [look])
  const [page, ...args] = useRoute()
  const sync = useSync()
  const [last, setLast] = useState(() => store.get('handle', ''))
  const handle = page === 'u' ? args[0] : page === 'compare' ? args[0] : null
  useEffect(() => {
    if (handle && HANDLE_RE.test(handle)) { setLast(handle); store.set('handle', handle) }
  }, [handle])

  const active = page === 'u' ? args[1] || 'dash' : page
  const hrefFor = (t) =>
    t === 'compare' ? `#/compare/${last}/` : t === 'ext' ? '#/ext' : last ? `#/u/${last}/${t}` : '#/'
  const pickLook = (l) => {
    document.documentElement.dataset.look = l // set before render so readTheme sees it
    store.set('look', l)
    setLook(l)
  }

  return (
    <ThemeCtx.Provider value={C}>
      <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
        <nav className="sticky top-0 hidden h-screen w-[216px] flex-none flex-col gap-0.5 py-5 md:flex" style={{ borderRight: '1px solid var(--line)', background: 'var(--panel)' }}>
          <a href="#/" className="flex flex-col gap-1 px-[18px] pb-5" style={{ color: 'var(--fg)' }}>
            <span className="flex items-center gap-2">
              <span style={{ width: 9, height: 9, background: 'var(--acc)', borderRadius: 2, boxShadow: '0 0 10px var(--acc)' }} />
              <span style={{ font: "700 13px/1 'JetBrains Mono'", letterSpacing: '.02em' }}>cf<span style={{ color: 'var(--acc)' }}>::</span>visualizer</span>
            </span>
            <span className="label" style={{ fontSize: 9.5, color: 'var(--faint)', paddingLeft: 17 }}>profile analytics</span>
          </a>
          {TABS.map(([t, num, label]) => {
            const on = active === t
            return (
              <a key={t} href={hrefFor(t)} className="flex items-center gap-2.5 px-[18px] py-2 uppercase"
                style={{ font: "500 10.5px/1 'JetBrains Mono'", letterSpacing: '.12em', color: on ? 'var(--fg)' : 'var(--dim)', background: on ? 'var(--panel2)' : 'transparent', borderLeft: `2px solid ${on ? 'var(--acc)' : 'transparent'}` }}>
                <span style={{ color: 'var(--faint)', fontSize: 9.5 }}>{num}</span>
                {label}
              </a>
            )
          })}
          <div className="mt-auto flex flex-col gap-2 px-[18px] pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex justify-between uppercase" style={{ font: "400 9.5px/1.4 'JetBrains Mono'", color: 'var(--faint)' }}>
              <span>synced</span><span>{sync ? timeAgo(sync.at / 1000) : '—'}</span>
            </div>
          </div>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3.5 px-[26px] py-3.5"
            style={{ borderBottom: '1px solid var(--line)', background: 'color-mix(in srgb, var(--bg) 86%, transparent)', backdropFilter: 'blur(10px)' }}>
            <Terminal handle={page === 'u' ? args[0] : last || undefined} tab={active} />
            <span className="hidden sm:inline" style={{ font: "400 10px/1 'JetBrains Mono'", color: 'var(--faint)', letterSpacing: '.1em' }}>↵ FETCH</span>
            <div className="flex-1" />
            <button className="btn on flex-none" title="Switch look" aria-label={`Look: ${look}. Click to switch.`}
              onClick={() => pickLook(LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length])}>
              ◐ {look}
            </button>
            <div className="flex w-full gap-1 overflow-x-auto md:hidden">
              {TABS.map(([t, , label]) => (
                <a key={t} href={hrefFor(t)} className={`btn ${active === t ? 'on' : ''}`}>{label}</a>
              ))}
            </div>
          </header>
          <div className="w-full max-w-[1400px] px-[26px] py-6">
            {page === 'u' && args[0] ? (
              <Profile key={args[0]} handle={args[0]} tab={args[1] || 'dash'} />
            ) : page === 'compare' ? (
              <Compare key={args.join('/')} a={args[0]} b={args[1]} />
            ) : page === 'ext' ? (
              <ExtPage />
            ) : (
              <Home />
            )}
          </div>
        </main>
      </div>
    </ThemeCtx.Provider>
  )
}
