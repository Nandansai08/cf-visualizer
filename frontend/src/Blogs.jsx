import { fmtDate, signed } from './lib'
import { Empty, ErrorCard, Panel, Skeleton, Stat, useFetch } from './ui'

// CF blog titles arrive as HTML fragments ("<p>Editorial</p>"); DOMParser never runs scripts.
const text = (html) => new DOMParser().parseFromString(html ?? '', 'text/html').body.textContent.trim()

export default function Blogs({ handle }) {
  const q = useFetch(`/blogs/${encodeURIComponent(handle)}`)
  if (q.loading) return <Skeleton style={{ height: 240 }} />
  if (q.error) return <ErrorCard title={q.error} onRetry={q.reload} />
  const posts = q.data
  if (!posts.length)
    return <Panel label="Blogs"><Empty title={handle}>No blog entries yet.</Empty></Panel>
  const total = posts.reduce((s, b) => s + b.rating, 0)
  const best = posts.reduce((m, b) => (b.rating > m.rating ? b : m))
  const color = (r) => (r > 0 ? 'var(--acc)' : r < 0 ? 'var(--bad)' : 'var(--faint)')
  return (
    <div className="grid gap-4">
      <section className="panel grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Posts" value={posts.length} />
        <Stat label="Total votes" value={signed(total)} color={color(total)} />
        <Stat label="Avg / post" value={signed(Math.round(total / posts.length))} />
        <Stat label="Top post" value={signed(best.rating)} color={color(best.rating)} hint={text(best.title)} />
      </section>
      <Panel label={`Blog entries · ${posts.length}`}>
        <div className="flex flex-col">
          {posts.map((b, i) => (
            <div key={b.id} className={`grid items-center gap-3 py-3 ${i ? 'row-line' : ''}`} style={{ gridTemplateColumns: '96px minmax(0,1fr) auto 56px', fontSize: 12 }}>
              <span className="sub">{fmtDate(b.creationTimeSeconds)}</span>
              <a href={`https://codeforces.com/blog/entry/${b.id}`} target="_blank" rel="noreferrer" className="truncate font-bold" style={{ color: 'var(--fg)' }}>
                {text(b.title) || `entry ${b.id}`}
              </a>
              <div className="hidden flex-wrap justify-end gap-1 md:flex">
                {(b.tags ?? []).slice(0, 3).map((t) => <span key={t} className="chip">{t}</span>)}
              </div>
              <span className="text-right font-bold tabular-nums" style={{ color: color(b.rating) }}>{signed(b.rating)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
