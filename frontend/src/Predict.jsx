import { useEffect, useState } from 'react'
import { RatingChart } from './charts'
import { api, nextTier, rankColor, signed } from './lib'
import { Empty, ErrorCard, Panel, Stat, useFetch, useTheme } from './ui'

export default function Predict({ p }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <Estimator p={p} />
      <Forecast p={p} />
    </div>
  )
}

function Estimator({ p }) {
  const C = useTheme()
  const handle = p.info.handle
  const contests = useFetch('/contests')
  const live = (contests.data ?? []).filter((c) => c.phase !== 'FINISHED')
  const recent = (contests.data ?? []).filter((c) => c.phase === 'FINISHED').slice(0, 25)
  const mine = p.history.slice(-40).reverse()
  const [cid, setCid] = useState('')
  const chosen = cid || String(live[0]?.id ?? mine[0]?.contestId ?? recent[0]?.id ?? '')
  const name = [...live, ...recent].find((c) => String(c.id) === chosen)?.name ?? mine.find((h) => String(h.contestId) === chosen)?.contestName
  const [field, setField] = useState(null) // {size, seed} for the chosen contest
  const [rank, setRank] = useState(1)
  const [res, setRes] = useState({})

  // New contest: probe once to learn field size and your seed, then start the slider at your seed.
  useEffect(() => {
    if (!chosen) return
    let live = true
    setField(null)
    setRes({ busy: true })
    api(`/estimate/${encodeURIComponent(handle)}?contestId=${chosen}&rank=1`).then(
      (d) => { if (live) { setField({ size: d.fieldSize, seed: d.seed }); setRank(Math.min(d.fieldSize, Math.max(1, d.seed))) } },
      (e) => live && setRes({ error: e.message }),
    )
    return () => { live = false }
  }, [chosen, handle])

  useEffect(() => {
    if (!field) return
    let live = true
    setRes((r) => ({ ...r, busy: true }))
    const id = setTimeout(() => {
      api(`/estimate/${encodeURIComponent(handle)}?contestId=${chosen}&rank=${rank}`).then(
        (data) => live && setRes({ data }),
        (e) => live && setRes({ error: e.message }),
      )
    }, 220) // debounce slider drags
    return () => { live = false; clearTimeout(id) }
  }, [field, rank, chosen, handle])

  const d = res.data
  const perfNext = d && nextTier(d.performance)
  return (
    <Panel label="Live rating change estimator"
      right={<span className="sub">{name ?? '—'}{field ? ` · ${field.size.toLocaleString()} rated participants` : ''}</span>}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <select value={chosen} onChange={(e) => setCid(e.target.value)} className="input w-full min-w-0" aria-label="Contest">
            {live.length > 0 && <optgroup label="Running / awaiting ratings">{live.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
            {mine.length > 0 && <optgroup label="Your rated contests (what-if)">{mine.map((h) => <option key={h.contestId} value={h.contestId}>{h.contestName}</option>)}</optgroup>}
            <optgroup label="Recent contests">{recent.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          </select>
          <div className="flex items-baseline justify-between">
            <span style={{ fontSize: 11.5 }}>hypothetical rank</span>
            <input type="number" min={1} max={field?.size} value={rank} disabled={!field}
              onChange={(e) => setRank(Math.max(1, Math.min(field?.size ?? 1, Number(e.target.value) || 1)))}
              className="big w-28 bg-transparent text-right outline-none" style={{ fontSize: 26, color: 'var(--fg)' }} />
          </div>
          <input type="range" min={1} max={field?.size ?? 1} value={rank} disabled={!field} onChange={(e) => setRank(Number(e.target.value))} className="w-full" aria-label="Hypothetical rank" />
          <div className="sub flex justify-between">
            <span>1st</span><span>seed {field?.seed ?? '—'}</span><span>{field?.size.toLocaleString() ?? '—'}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Seed rank', field?.seed ?? '—', undefined],
              ['Performance', d?.performance ?? '—', d && rankColor(d.performance, C.dark)],
              ['New rating', d?.newRating ?? '—', d && rankColor(d.newRating, C.dark)],
            ].map(([k, v, c]) => (
              <div key={k} className="rounded-lg p-3.5" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                <Stat label={k} value={v} color={c} size={20} />
              </div>
            ))}
          </div>
          {res.busy && !field && <span className="sub">loading contest field — live contests pull the full rated list once a day (~20 s)…</span>}
        </div>
        <div className="flex flex-col items-center justify-center gap-3 border-t pt-5 text-center lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6" style={{ borderColor: 'var(--line)' }}>
          {res.error ? <ErrorCard title={res.error} /> : (
            <>
              <span className="label" style={{ color: 'var(--faint)' }}>Predicted Δ</span>
              <span className="big" style={{ fontSize: 68, color: !d ? 'var(--faint)' : d.delta > 0 ? 'var(--acc)' : d.delta < 0 ? 'var(--bad)' : 'var(--dim)', opacity: res.busy ? 0.55 : 1, transition: 'opacity .15s' }}>
                {d ? signed(d.delta) : '··'}
              </span>
              {d && (
                <p style={{ color: 'var(--dim)', fontSize: 11, lineHeight: 1.7, maxWidth: 280 }}>
                  Rank {d.rank} {d.rank <= d.seed ? 'beats' : 'falls short of'} your seed of {d.seed}. That performance is {d.performance}
                  {perfNext ? ` — ${perfNext.min - d.performance} short of ${perfNext.name}.` : '.'}
                  {d.actual != null && <><br />Actual: rank {d.actualRank}, <b style={{ color: d.actual >= 0 ? 'var(--acc)' : 'var(--bad)' }}>{signed(d.actual)}</b>.</>}
                </p>
              )}
              <p className="sub">CF formula over the {d?.source ?? 'contest field'}{d?.newcomerAdjusted ? ' · newcomer offset applied' : ''}</p>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

function Forecast({ p }) {
  const f = p.forecast
  if (!f)
    return (
      <Panel label="Trajectory forecast">
        <Empty>Forecast needs at least 5 rated contests — {p.history.length ? `${p.history.length} so far` : 'none yet'}. It stays hidden rather than guessing from too little data.</Empty>
      </Panel>
    )
  const end = f.points.at(-1)
  const gapDays = Math.round((f.points[1]?.t - f.points[0].t) / 86400) || 7
  return (
    <Panel label="Trajectory forecast · damped weighted least squares on last 30 contests"
      right={<span className="sub" style={{ color: 'var(--warn)' }}>⚠ rough estimate — not a promise</span>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <RatingChart history={p.history} forecast={f} last={30} height={280} />
        <div className="flex flex-col gap-4">
          <Stat label="Trend" value={`${signed(f.slopePerContest)} / contest`} color={f.slopePerContest >= 0 ? 'var(--acc)' : 'var(--bad)'} size={22} />
          <div className="flex flex-col gap-1.5">
            <span className="label" style={{ fontSize: 9.5, color: 'var(--faint)' }}>In {f.points.length} contests</span>
            <span className="big" style={{ fontSize: 22 }}>{end.rating} <span style={{ fontSize: 13, color: 'var(--dim)' }}>± {Math.round((end.hi - end.lo) / 2)}</span></span>
          </div>
          <Stat label="Residual σ" value={f.sigma} size={22} color="var(--acc2)" />
          <p className="pt-3 row-line" style={{ color: 'var(--dim)', fontSize: 10.5, lineHeight: 1.7 }}>
            Band ≈ 80% interval (±1.28σ, widening with horizon). Recent contests weigh more; the trend is damped so it flattens further out.
            Your median contest gap of ~{gapDays} days is folded into the time axis.
          </p>
        </div>
      </div>
    </Panel>
  )
}
