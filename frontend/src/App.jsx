import { useEffect, useMemo, useState } from 'react'
import Compare from './Compare'
import Profile from './Dashboard'
import { HANDLE_RE, timeAgo } from './lib'
import { ThemeCtx, readTheme } from './ui'

// [id, number, sidebar label, bottom-bar label, bottom-bar glyph]
const TABS = [
  ['dash', '01', 'Overview', 'Overview', '▦'],
  ['submissions', '02', 'Submissions & Ladder', 'Subs', '≡'],
  ['contests', '03', 'Contest Analysis', 'Contests', '◷'],
  ['weak', '04', 'Weak Topics & Practice', 'Topics', '◎'],
  ['blogs', '05', 'Blogs', 'Blogs', '✎'],
]
const TAB_IDS = TABS.map(([t]) => t)
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
    location.hash = `#/u/${h}/${TAB_IDS.includes(tab) ? tab : 'dash'}`
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
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 pt-20 text-center">
      <div className="flex items-center gap-3">
        <div style={{ width: 14, height: 14, background: 'var(--acc)', borderRadius: 3, boxShadow: '0 0 16px var(--acc)' }} />
        <span className="big" style={{ fontSize: 44 }}>cf<span style={{ color: 'var(--acc)' }}>::</span>visualizer</span>
      </div>
      <p style={{ color: 'var(--dim)', lineHeight: 1.8 }}>
        Rating history, problem ladder, submission history, contest post-mortems, weak-topic clusters, and a personal predictor — for any handle.
      </p>
      <Terminal big />
      <p className="sub">
        try {['tourist', 'jiangly', 'Um_nik'].map((h) => <a key={h} href={`#/u/${h}/dash`} className="mx-1.5">{h}</a>)}
        · <a href={`#/compare/${store.get('handle', '')}/`}>compare two</a>
      </p>

      {/* Official Footer Banner */}
      <footer className="mt-16 flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t pt-6 [&>*]:whitespace-nowrap" style={{ borderColor: 'var(--line)', font: "10.5px/1.5 'JetBrains Mono'", color: 'var(--faint)' }}>
        <span>© 2026 <b style={{ color: 'var(--dim)' }}>cf::visualizer</b></span>
        <span>unofficial, not affiliated with Codeforces</span>
        <span>data: Codeforces API</span>
        <a href="https://github.com/Nandansai08/cf-visualizer" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">
            <svg className="size-3.5 flex-none fill-current" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub ↗
          </a>
      </footer>
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

  const active = page === 'u' ? (args[1] === 'predict' ? 'contests' : args[1] || 'dash') : page
  const hrefFor = (t) =>
    t === 'compare' ? `#/compare/${last}/` : last ? `#/u/${last}/${t}` : '#/'
  const pickLook = (l) => {
    document.documentElement.dataset.look = l // set before render so readTheme sees it
    store.set('look', l)
    setLook(l)
  }

  return (
    <ThemeCtx.Provider value={C}>
      <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
        <nav className="sticky top-0 hidden h-screen w-[236px] flex-none flex-col gap-0.5 py-5 md:flex" style={{ borderRight: '1px solid var(--line)', background: 'var(--panel)' }}>
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
              <a key={t} href={hrefFor(t)} className={`nav-tab ${on ? 'active' : ''}`}>
                <span className="nav-num" style={{ color: on ? 'var(--acc)' : 'var(--faint)', fontSize: 9.5, transition: 'color 0.2s' }}>{num}</span>
                <span className="truncate">{label}</span>
              </a>
            )
          })}
          <div className="mt-auto flex flex-col gap-2 px-[18px] pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <a href={hrefFor('compare')} className="btn flex items-center justify-between text-xs py-1.5 px-2.5 mb-1" style={{ color: 'var(--fg)' }}>
              <span>Compare handles</span>
              <span style={{ color: 'var(--acc)' }}>⇄</span>
            </a>
            <div className="flex justify-between uppercase pt-1" style={{ font: "400 9.5px/1.4 'JetBrains Mono'", color: 'var(--faint)', borderTop: '1px solid var(--line2)' }}>
              <span>{sync ? 'synced' : 'cf::visualizer'}</span><span>{sync ? timeAgo(sync.at / 1000) : ''}</span>
            </div>
          </div>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
          <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3.5 px-4 sm:px-[26px] py-3.5"
            style={{ borderBottom: '1px solid var(--line)', background: 'color-mix(in srgb, var(--bg) 86%, transparent)', backdropFilter: 'blur(10px)' }}>
            <Terminal handle={page === 'u' ? args[0] : last || undefined} tab={active} />
            <span className="hidden sm:inline" style={{ font: "400 10px/1 'JetBrains Mono'", color: 'var(--faint)', letterSpacing: '.1em' }}>↵ FETCH</span>
            <div className="hidden flex-1 sm:block" />
            <a href="https://github.com/Nandansai08/cf-visualizer" target="_blank" rel="noreferrer" className="btn flex items-center gap-1.5 flex-none" title="View source on GitHub">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <button className="btn on flex-none" title="Switch look" aria-label={`Look: ${look}. Click to switch.`}
              onClick={() => pickLook(LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length])}>
              ◐<span className="hidden sm:inline"> {look}</span>
            </button>
          </header>
          {/* phones: bottom tab bar, always visible and in thumb reach */}
          <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 md:hidden"
            style={{ borderTop: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel) 92%, transparent)', backdropFilter: 'blur(10px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {[...TABS, ['compare', '', 'Compare', 'Compare', '⇄']].map(([t, , , short, glyph]) => {
              const on = active === t
              return (
                <a key={t} href={hrefFor(t)} aria-current={on ? 'page' : undefined}
                  className="flex flex-col items-center gap-1 py-2"
                  style={{ color: on ? 'var(--acc)' : 'var(--faint)', boxShadow: on ? 'inset 0 2px 0 var(--acc)' : 'none' }}>
                  <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>{glyph}</span>
                  <span style={{ font: "500 9px/1 'JetBrains Mono'", letterSpacing: '.04em', textTransform: 'uppercase' }}>{short}</span>
                </a>
              )
            })}
          </nav>
          <div className="w-full max-w-[1400px] px-4 sm:px-[26px] py-6">
            {page === 'u' && args[0] ? (
              <Profile key={args[0]} handle={args[0]} tab={args[1] || 'dash'} sub={args[2]} />
            ) : page === 'compare' ? (
              <Compare key={args.join('/')} a={args[0]} b={args[1]} />
            ) : (
              <Home />
            )}
          </div>
        </main>
      </div>
    </ThemeCtx.Provider>
  )
}
