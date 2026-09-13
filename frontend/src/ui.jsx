import { createContext, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, rankColor } from './lib'

const KEYS = ['bg', 'panel', 'panel2', 'line', 'line2', 'fg', 'dim', 'faint', 'acc', 'acc2', 'warn', 'bad', 'grid', 'cellbg']

/** Palette for the active look, read back from the CSS variables so CSS stays the single source. */
export function readTheme(look) {
  const cs = getComputedStyle(document.documentElement)
  return { look, dark: look !== 'daylight', ...Object.fromEntries(KEYS.map((k) => [k, cs.getPropertyValue(`--${k}`).trim()])) }
}

export const ThemeCtx = createContext(null)
export const useTheme = () => useContext(ThemeCtx)

export function useFetch(path) {
  const [state, setState] = useState({ loading: true })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    setState({ loading: true })
    api(path).then(
      (data) => live && setState({ data }),
      (e) => live && setState({ error: e.message, status: e.status }),
    )
    return () => {
      live = false
    }
  }, [path, nonce])
  return { ...state, reload: () => setNonce((n) => n + 1) }
}

export function Panel({ label, right, children, className = '', style }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {(label || right) && (
        <div className="panel-head">
          <span className="label">{label}</span>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="flex gap-1">
      {options.map(([v, label]) => (
        <button key={v} className={`btn ${value === v ? 'on' : ''}`} style={{ padding: '5px 8px', fontSize: 9.5 }} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, color, size = 24, hint }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="label" style={{ fontSize: 9.5, letterSpacing: '.14em', color: 'var(--faint)' }}>{label}</span>
      <span className="big truncate" style={{ fontSize: size, color }}>{value}</span>
      {hint && <span className="sub truncate">{hint}</span>}
    </div>
  )
}

export const Skeleton = ({ className = '', style }) => <div className={`shim ${className}`} style={style} />

export function Empty({ title, children, actions }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-dashed p-5" style={{ borderColor: 'var(--line2)' }}>
      {title && <span className="big" style={{ fontSize: 17 }}>{title}</span>}
      <span style={{ color: 'var(--dim)', fontSize: 11.5, lineHeight: 1.7 }}>{children}</span>
      {actions && <div className="mt-1 flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorCard({ title, children, onRetry }) {
  return (
    <section role="alert" className="panel flex flex-col gap-3" style={{ borderColor: 'color-mix(in srgb, var(--bad) 70%, transparent)' }}>
      <span style={{ font: "700 13px/1.4 'JetBrains Mono'", color: 'var(--bad)' }}>{title}</span>
      {children && <span style={{ color: 'var(--dim)', fontSize: 11.5, lineHeight: 1.7 }}>{children}</span>}
      {onRetry && (
        <div>
          <button className="btn" onClick={onRetry} style={{ color: 'var(--fg)' }}>Try again</button>
        </div>
      )}
    </section>
  )
}

/** Handle coloured by rank; legendary grandmasters get CF's black/white first letter. */
export function HandleName({ handle, rating }) {
  const C = useTheme()
  const c = rankColor(rating, C.dark)
  if (rating >= 3000)
    return (
      <span style={{ color: c }}>
        <span style={{ color: 'var(--fg)' }}>{handle[0]}</span>
        {handle.slice(1)}
      </span>
    )
  return <span style={{ color: c }}>{handle}</span>
}

/** The one tooltip look used everywhere: dim title line, then content rows. */
export function TipBox({ title, children }) {
  return (
    <div className="whitespace-nowrap px-2.5 py-1.5 shadow-lg" style={{ ...tip.contentStyle, lineHeight: 1.65 }}>
      {title && <div style={{ color: 'var(--dim)' }}>{title}</div>}
      {children}
    </div>
  )
}

/** Recharts `content` adapter: <Tooltip content={<ChartTip title={(d, label) => …} rows={(d, payload) => …} />} /> */
export function ChartTip({ active, payload, label, title, rows }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return <TipBox title={title(d, label)}>{rows(d, payload)}</TipBox>
}
export const chartTipWrapper = { outline: 'none', zIndex: 30 }

/**
 * Hover/focus tooltip for plain elements. Rendered in a fixed-position portal so scroll containers
 * can't clip it; flips below the anchor near the sticky header and clamps to the viewport sides.
 * bind(() => content, key) spreads onto the element; `hovered.key` lets callers highlight.
 */
export function useHoverTip() {
  const [h, setH] = useState(null)
  const close = () => setH(null)
  const open = (e, content, key) => setH({ rect: e.currentTarget.getBoundingClientRect(), content, key })
  const bind = (content, key) => ({
    onMouseEnter: (e) => open(e, content, key),
    onFocus: (e) => open(e, content, key),
    onMouseLeave: close,
    onBlur: close,
  })
  return [bind, h && <FloatTip rect={h.rect} onClose={close}>{h.content()}</FloatTip>, h]
}

function FloatTip({ rect, onClose, children }) {
  useEffect(() => {
    addEventListener('scroll', onClose, true)
    return () => removeEventListener('scroll', onClose, true)
  }, [onClose])
  const below = rect.top < 150 // sticky header zone
  const left = Math.min(Math.max(rect.left + rect.width / 2, 130), innerWidth - 130)
  return createPortal(
    <div className="pointer-events-none fixed z-50"
      style={{ left, top: below ? rect.bottom + 8 : rect.top - 8, transform: `translate(-50%, ${below ? '0' : '-100%'})`, animation: 'fadeIn .12s ease both' }}>
      {children}
    </div>,
    document.body,
  )
}

export const axisProps = (C) => ({
  tick: { fill: C.faint, fontSize: 9.5, fontFamily: 'JetBrains Mono' },
  stroke: C.line,
  tickLine: false,
  axisLine: false,
})

export const tip = {
  contentStyle: { background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--fg)', fontSize: 11, fontFamily: 'JetBrains Mono' },
  itemStyle: { color: 'var(--fg)' },
  labelStyle: { color: 'var(--dim)' },
  cursor: { fill: 'var(--grid)' },
}
