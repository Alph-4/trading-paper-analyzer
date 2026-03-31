import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useTradeStore } from '@/store/useTradeStore'
import type { Trade } from '@/lib/types'
import { computeStats } from '@/lib/stats'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface DrawdownPeriod {
  id: number
  start: Date
  troughTime: Date
  end: Date | null       // null = still in drawdown
  depthUsd: number       // positive
  depthPct: number       // positive
  durationMs: number     // start → end (or start → last trade)
  recoveryMs: number | null // trough → end, null if unresolved
}

interface BoxStats {
  label: string
  n: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt2(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUsd(v: number) {
  return `${v >= 0 ? '+' : '-'}$${fmt2(Math.abs(v))}`
}
function pnlClass(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-zinc-400'
}
function fmtDate(d: Date) {
  return d.toLocaleString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDatetime(ts: number) {
  return new Date(ts * 1000).toLocaleString('fr-FR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
function fmtDuration(ms: number): string {
  if (ms <= 0) return '—'
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}j ${h % 24}h`
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

function toTs(d: Date): UTCTimestamp {
  return Math.floor(d.getTime() / 1000) as UTCTimestamp
}

// ── Computation ───────────────────────────────────────────────────────────────

function computeDrawdownAnalysis(trades: Trade[]): {
  equityPctSeries: Array<{ time: UTCTimestamp; value: number }>
  periods: DrawdownPeriod[]
  maxDdTroughTs: UTCTimestamp | null
  tradesInCurrentDd: number
} {
  const sorted = [...trades].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime())
  if (sorted.length === 0) {
    return { equityPctSeries: [], periods: [], maxDdTroughTs: null, tradesInCurrentDd: 0 }
  }

  const rawSeries: Array<{ time: UTCTimestamp; value: number }> = []
  const periods: DrawdownPeriod[] = []

  let equity = 0
  let peak = 0
  let peakTime: Date = new Date(sorted[0].closeTime.getTime() - 60000)

  let inDrawdown = false
  let ddStart: Date = new Date()
  let ddTroughTime: Date = new Date()
  let maxDepthUsd = 0
  let maxDepthPct = 0
  let periodId = 0
  let currentDdStartIdx = -1

  let globalMinPct = 0
  let maxDdTroughTs: UTCTimestamp | null = null

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    equity += t.netPnl
    const ts = toTs(t.closeTime)
    const ddPct = peak > 0 ? ((equity - peak) / peak) * 100 : 0  // ≤ 0

    rawSeries.push({ time: ts, value: ddPct })

    if (ddPct < globalMinPct) {
      globalMinPct = ddPct
      maxDdTroughTs = ts
    }

    if (equity >= peak) {
      if (inDrawdown) {
        periods.push({
          id: ++periodId,
          start: ddStart,
          troughTime: ddTroughTime,
          end: t.closeTime,
          depthUsd: maxDepthUsd,
          depthPct: maxDepthPct,
          durationMs: t.closeTime.getTime() - ddStart.getTime(),
          recoveryMs: t.closeTime.getTime() - ddTroughTime.getTime(),
        })
        inDrawdown = false
        currentDdStartIdx = -1
      }
      peak = equity
      peakTime = t.closeTime
    } else {
      const dd = peak - equity
      const ddPctAbs = peak > 0 ? (dd / peak) * 100 : 0
      if (!inDrawdown) {
        inDrawdown = true
        ddStart = peakTime
        maxDepthUsd = dd
        maxDepthPct = ddPctAbs
        ddTroughTime = t.closeTime
        currentDdStartIdx = i
      } else if (dd > maxDepthUsd) {
        maxDepthUsd = dd
        maxDepthPct = ddPctAbs
        ddTroughTime = t.closeTime
      }
    }
  }

  let tradesInCurrentDd = 0
  if (inDrawdown) {
    const last = sorted[sorted.length - 1]
    periods.push({
      id: ++periodId,
      start: ddStart,
      troughTime: ddTroughTime,
      end: null,
      depthUsd: maxDepthUsd,
      depthPct: maxDepthPct,
      durationMs: last.closeTime.getTime() - ddStart.getTime(),
      recoveryMs: null,
    })
    tradesInCurrentDd = currentDdStartIdx >= 0 ? sorted.length - currentDdStartIdx : 0
  }

  // Deduplicate same-second timestamps (LWC requirement: strictly monotonic)
  const equityPctSeries: Array<{ time: UTCTimestamp; value: number }> = []
  for (const p of rawSeries) {
    if (equityPctSeries.length > 0 && equityPctSeries[equityPctSeries.length - 1].time === p.time) {
      equityPctSeries[equityPctSeries.length - 1].value = p.value
    } else {
      equityPctSeries.push({ ...p })
    }
  }

  return { equityPctSeries, periods, maxDdTroughTs, tradesInCurrentDd }
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo)
}

function computeBoxStats(values: number[], label: string): BoxStats | null {
  if (values.length < 2) return null
  const s = [...values].sort((a, b) => a - b)
  return {
    label,
    n: s.length,
    min: s[0],
    q1: quantile(s, 0.25),
    median: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    max: s[s.length - 1],
  }
}

/**
 * Risk of Ruin using the normalized-edge formula:
 *   edge = (W×R − (1−W)) / (W×R + (1−W))
 *   RoR  = ((1−edge)/(1+edge))^(1/f)
 * where W = win rate, R = win/loss ratio, f = fraction of capital risked.
 */
function computeRoR(winRatePct: number, ratio: number, riskPct: number): number {
  const W = winRatePct / 100
  const f = riskPct / 100
  if (W <= 0 || W >= 1 || ratio <= 0 || f <= 0 || f >= 1) return 100
  const grossWin = W * ratio
  const grossLoss = 1 - W
  const edgeNorm = (grossWin - grossLoss) / (grossWin + grossLoss)
  if (edgeNorm <= 0) return 100
  const A = (1 - edgeNorm) / (1 + edgeNorm)
  return Math.min(100, Math.max(0, Math.pow(A, 1 / f) * 100))
}

// ── Shared UI sub-components ──────────────────────────────────────────────────

function KpiCard({
  label, value, valueClass, sub,
}: {
  label: string; value: string; valueClass?: string; sub?: string
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
        <p className={cn('text-lg font-mono font-semibold leading-tight', valueClass ?? 'text-zinc-100')}>
          {value}
        </p>
        {sub && <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </div>
  )
}

// ── Sort helper ───────────────────────────────────────────────────────────────

type SortKey = 'id' | 'depthUsd' | 'depthPct' | 'durationMs' | 'recoveryMs'

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-zinc-700 ml-1">↕</span>
  return <span className="text-zinc-300 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
}

// ── Box Plot SVG ──────────────────────────────────────────────────────────────

function BoxPlotChart({ rows }: { rows: BoxStats[] }) {
  if (rows.length === 0) return null

  const allVals = rows.flatMap((r) => [r.min, r.max])
  const globalMin = Math.min(...allVals)
  const globalMax = Math.max(...allVals)
  const span = globalMax - globalMin || 1

  const W = 600
  const PAD_L = 72
  const PAD_R = 16
  const PAD_V = 12
  const ROW_H = 44
  const chartW = W - PAD_L - PAD_R
  const H = rows.length * ROW_H + PAD_V * 2 + 20 // extra for x-axis labels

  const xScale = (v: number) => PAD_L + ((v - globalMin) / span) * chartW

  const zeroX = globalMin <= 0 && globalMax >= 0 ? xScale(0) : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* Gridlines */}
      {[0.25, 0.5, 0.75].map((q) => {
        const gx = PAD_L + q * chartW
        return (
          <line key={q} x1={gx} y1={PAD_V} x2={gx} y2={H - 20}
            stroke="#27272a" strokeWidth={1} />
        )
      })}

      {/* Zero line */}
      {zeroX !== null && (
        <line x1={zeroX} y1={PAD_V} x2={zeroX} y2={H - 20}
          stroke="#3f3f46" strokeWidth={1} strokeDasharray="3 3" />
      )}

      {rows.map((row, i) => {
        const cy = PAD_V + i * ROW_H + ROW_H / 2
        const xMin = xScale(row.min)
        const xQ1 = xScale(row.q1)
        const xMed = xScale(row.median)
        const xQ3 = xScale(row.q3)
        const xMax = xScale(row.max)
        const isPos = row.median >= 0

        return (
          <g key={row.label}>
            {/* Label */}
            <text x={PAD_L - 6} y={cy + 4} textAnchor="end"
              fill="#71717a" fontSize={10} fontFamily="monospace">
              {row.label}
            </text>
            <text x={PAD_L - 6} y={cy + 15} textAnchor="end"
              fill="#3f3f46" fontSize={8} fontFamily="monospace">
              n={row.n}
            </text>
            {/* Left whisker */}
            <line x1={xMin} y1={cy - 5} x2={xMin} y2={cy + 5} stroke="#52525b" strokeWidth={1.5} />
            <line x1={xMin} y1={cy} x2={xQ1} y2={cy} stroke="#52525b" strokeWidth={1} />
            {/* Box Q1→Q3 */}
            <rect x={xQ1} y={cy - 11} width={Math.max(1, xQ3 - xQ1)} height={22}
              fill="#1c1c1c" stroke="#3f3f46" strokeWidth={1} rx={2} />
            {/* Median line */}
            <line x1={xMed} y1={cy - 11} x2={xMed} y2={cy + 11}
              stroke={isPos ? '#10b981' : '#ef4444'} strokeWidth={2} />
            {/* Right whisker */}
            <line x1={xQ3} y1={cy} x2={xMax} y2={cy} stroke="#52525b" strokeWidth={1} />
            <line x1={xMax} y1={cy - 5} x2={xMax} y2={cy + 5} stroke="#52525b" strokeWidth={1.5} />
            {/* Min / Max labels on hover approximation: static small text */}
            <text x={xMin} y={cy - 8} textAnchor="middle" fill="#3f3f46" fontSize={8} fontFamily="monospace">
              ${Math.round(row.min)}
            </text>
            <text x={xMax} y={cy - 8} textAnchor="middle" fill="#3f3f46" fontSize={8} fontFamily="monospace">
              ${Math.round(row.max)}
            </text>
            <text x={xMed} y={cy + 22} textAnchor="middle"
              fill={isPos ? '#059669' : '#dc2626'} fontSize={8} fontFamily="monospace">
              ${fmt2(row.median)}
            </text>
          </g>
        )
      })}

      {/* X-axis labels */}
      <text x={PAD_L} y={H - 4} textAnchor="middle" fill="#52525b" fontSize={9} fontFamily="monospace">
        ${Math.round(globalMin)}
      </text>
      <text x={PAD_L + chartW} y={H - 4} textAnchor="middle" fill="#52525b" fontSize={9} fontFamily="monospace">
        ${Math.round(globalMax)}
      </text>
      {zeroX !== null && (
        <text x={zeroX} y={H - 4} textAnchor="middle" fill="#52525b" fontSize={9} fontFamily="monospace">
          $0
        </text>
      )}
    </svg>
  )
}

// ── RoR Slider ────────────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, onChange, display,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  display: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="font-mono text-zinc-200">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-zinc-700 accent-emerald-500"
      />
      <div className="flex justify-between text-[10px] text-zinc-700 font-mono">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DrawdownPage() {
  const trades = useTradeStore((s) => s.trades)
  const stats = useMemo(() => computeStats(trades), [trades])

  // ── Sort state for periods table ────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('depthUsd')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── RoR slider state ────────────────────────────────────────────────────
  const [rorWR, setRorWR] = useState(() => Math.round(stats.winRate * 10) / 10)
  const [rorRR, setRorRR] = useState(() => Math.round(Math.max(0.1, stats.avgRR) * 10) / 10)
  const [rorRisk, setRorRisk] = useState(1.0)

  // ── Chart legend state ──────────────────────────────────────────────────
  const [legend, setLegend] = useState<{ datetime: string; pct: number } | null>(null)

  // ── Chart refs ──────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)

  // ── Core analysis ───────────────────────────────────────────────────────
  const analysis = useMemo(() => computeDrawdownAnalysis(trades), [trades])

  // ── Derived KPI values ──────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const { periods, tradesInCurrentDd } = analysis
    const recoveries = periods.filter((p) => p.recoveryMs !== null).map((p) => p.recoveryMs!)
    const avgRecoveryMs = recoveries.length > 0
      ? recoveries.reduce((s, v) => s + v, 0) / recoveries.length
      : 0
    const longestDd = periods.length > 0
      ? Math.max(...periods.map((p) => p.durationMs))
      : 0
    return { avgRecoveryMs, longestDd, tradesInCurrentDd }
  }, [analysis])

  // ── Sorted periods ──────────────────────────────────────────────────────
  const sortedPeriods = useMemo(() => {
    const cmp = (a: DrawdownPeriod, b: DrawdownPeriod): number => {
      let diff = 0
      if (sortKey === 'id') diff = a.id - b.id
      else if (sortKey === 'depthUsd') diff = a.depthUsd - b.depthUsd
      else if (sortKey === 'depthPct') diff = a.depthPct - b.depthPct
      else if (sortKey === 'durationMs') diff = a.durationMs - b.durationMs
      else if (sortKey === 'recoveryMs') {
        const ra = a.recoveryMs ?? Infinity
        const rb = b.recoveryMs ?? Infinity
        diff = ra - rb
      }
      return sortDir === 'asc' ? diff : -diff
    }
    return [...analysis.periods].sort(cmp)
  }, [analysis.periods, sortKey, sortDir])

  // ── Box stats ────────────────────────────────────────────────────────────
  const boxRows = useMemo((): BoxStats[] => {
    const sorted = [...trades].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime())
    const rows: BoxStats[] = []
    const overall = computeBoxStats(sorted.map((t) => t.netPnl), 'Tous les trades')
    if (overall) rows.push(overall)

    const symMap = new Map<string, number[]>()
    for (const t of sorted) {
      const arr = symMap.get(t.symbol) ?? []
      arr.push(t.netPnl)
      symMap.set(t.symbol, arr)
    }
    for (const [sym, vals] of Array.from(symMap).sort(([a], [b]) => a.localeCompare(b))) {
      const r = computeBoxStats(vals, sym)
      if (r) rows.push(r)
    }
    return rows
  }, [trades])

  // ── RoR ──────────────────────────────────────────────────────────────────
  const ror = useMemo(() => computeRoR(rorWR, rorRR, rorRisk), [rorWR, rorRR, rorRisk])
  const rorClass = ror < 10 ? 'text-emerald-400' : ror < 50 ? 'text-yellow-400' : 'text-red-400'

  // ── Create chart once ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      height: 260,
      width: el.clientWidth,
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#71717a',
      },
      grid: {
        vertLines: { color: '#18181b' },
        horzLines: { color: '#18181b' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#27272a',
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      timeScale: { borderColor: '#27272a', timeVisible: true, secondsVisible: false },
    })

    const series = chart.addAreaSeries({
      topColor: '#ef444420',
      bottomColor: '#ef444408',
      lineColor: '#ef4444',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    chartRef.current = chart
    seriesRef.current = series

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) { setLegend(null); return }
      const dp = param.seriesData.get(series) as { value: number } | undefined
      if (dp !== undefined) {
        setLegend({ datetime: fmtDatetime(param.time as number), pct: dp.value })
      }
    })

    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }))
    ro.observe(el)

    return () => { ro.disconnect(); chart.remove() }
  }, [])

  // ── Update chart data ──────────────────────────────────────────────────
  useEffect(() => {
    const s = seriesRef.current
    const c = chartRef.current
    if (!s || !c) return

    const { equityPctSeries, maxDdTroughTs } = analysis
    if (equityPctSeries.length === 0) return

    s.setData(equityPctSeries)

    if (maxDdTroughTs !== null) {
      s.setMarkers([{
        time: maxDdTroughTs,
        position: 'belowBar',
        color: '#ef4444',
        shape: 'arrowUp',
        text: 'Max DD',
        size: 1,
      }])
    }

    c.timeScale().fitContent()
  }, [analysis])

  // ── Toggle sort ────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function TH({
    k, children,
  }: {
    k: SortKey; children: React.ReactNode
  }) {
    return (
      <th
        className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider
          cursor-pointer select-none hover:text-zinc-300 whitespace-nowrap"
        onClick={() => toggleSort(k)}
      >
        {children}
        <SortIcon active={sortKey === k} dir={sortDir} />
      </th>
    )
  }

  // ── Guard ─────────────────────────────────────────────────────────────
  if (trades.length === 0) {
    return <p className="text-zinc-500 text-sm">Aucune donnée chargée.</p>
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Section 1 — KPI Cards ──────────────────────────────────────── */}
      <Section title="Métriques de drawdown">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Max Drawdown $"
            value={`-$${fmt2(stats.maxDrawdown)}`}
            valueClass="text-red-400"
          />
          <KpiCard
            label="Max Drawdown %"
            value={`-${fmt2(stats.maxDrawdownPct)}%`}
            valueClass="text-red-400"
          />
          <KpiCard
            label="Durée max DD"
            value={fmtDuration(kpi.longestDd)}
            valueClass="text-zinc-100"
          />
          <KpiCard
            label="Récupération moy."
            value={kpi.avgRecoveryMs > 0 ? fmtDuration(kpi.avgRecoveryMs) : '—'}
            valueClass="text-zinc-100"
          />
          <KpiCard
            label="DD actuel $"
            value={stats.currentDrawdown > 0 ? `-$${fmt2(stats.currentDrawdown)}` : '$0.00'}
            valueClass={stats.currentDrawdown > 0 ? 'text-red-400' : 'text-emerald-400'}
          />
          <KpiCard
            label="Trades en DD"
            value={kpi.tradesInCurrentDd > 0 ? String(kpi.tradesInCurrentDd) : '—'}
            valueClass={kpi.tradesInCurrentDd > 0 ? 'text-red-400' : 'text-zinc-500'}
            sub={kpi.tradesInCurrentDd > 0 ? 'depuis le dernier pic' : undefined}
          />
        </div>
      </Section>

      {/* ── Section 2 — Drawdown % Chart ──────────────────────────────── */}
      <Section title="Courbe de drawdown">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 pb-2">
            <div className="flex items-baseline gap-4 mb-2">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Drawdown %
              </h3>
              {legend ? (
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-zinc-500">{legend.datetime}</span>
                  <span className="text-red-400">{fmt2(legend.pct)}%</span>
                </div>
              ) : (
                <span className="text-xs text-zinc-600">
                  Relatif au pic — <span className="text-red-600">▲ Max DD marqué</span>
                </span>
              )}
            </div>
            <div ref={containerRef} />
          </CardContent>
        </Card>
      </Section>

      {/* ── Section 3 — Drawdown periods table ────────────────────────── */}
      <Section title="Périodes de drawdown">
        {sortedPeriods.length === 0 ? (
          <p className="text-zinc-500 text-sm">Aucune période de drawdown détectée.</p>
        ) : (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <TH k="id">#</TH>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Début
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Fin
                      </th>
                      <TH k="depthUsd">Depth $</TH>
                      <TH k="depthPct">Depth %</TH>
                      <TH k="durationMs">Durée</TH>
                      <TH k="recoveryMs">Récupération</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPeriods.map((p) => {
                      const isActive = p.end === null
                      return (
                        <tr
                          key={p.id}
                          className={cn(
                            'border-b border-zinc-800/50 font-mono',
                            isActive && 'bg-red-950/20',
                          )}
                        >
                          <td className="px-3 py-2 text-zinc-600">{p.id}</td>
                          <td className="px-3 py-2 text-zinc-400">{fmtDate(p.start)}</td>
                          <td className={cn('px-3 py-2', isActive ? 'text-red-400' : 'text-zinc-400')}>
                            {isActive ? 'En cours' : fmtDate(p.end!)}
                          </td>
                          <td className="px-3 py-2 text-red-400">-${fmt2(p.depthUsd)}</td>
                          <td className="px-3 py-2 text-red-400">-{fmt2(p.depthPct)}%</td>
                          <td className="px-3 py-2 text-zinc-300">{fmtDuration(p.durationMs)}</td>
                          <td className={cn('px-3 py-2', p.recoveryMs === null ? 'text-zinc-600' : 'text-zinc-300')}>
                            {p.recoveryMs === null ? '—' : fmtDuration(p.recoveryMs)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </Section>

      {/* ── Section 4 — Box plot ──────────────────────────────────────── */}
      <Section title="Distribution des trades par PnL">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 mb-4 text-[10px] font-mono text-zinc-600">
              <span className="flex items-center gap-1">
                <span className="inline-block w-8 h-[2px] bg-zinc-600 border-t border-b border-zinc-600" />
                moustaches (min/max)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-6 h-3 border border-zinc-600 bg-[#1c1c1c]" />
                Q1–Q3
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-[2px] h-3 bg-emerald-500" />
                médiane
              </span>
            </div>
            {boxRows.length > 0 ? (
              <BoxPlotChart rows={boxRows} />
            ) : (
              <p className="text-zinc-500 text-sm">Données insuffisantes.</p>
            )}
          </CardContent>
        </Card>
      </Section>

      {/* ── Section 5 — Risk of Ruin ──────────────────────────────────── */}
      <Section title="Estimateur Risk of Ruin">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* Sliders */}
              <div className="space-y-6">
                <Slider
                  label="Win Rate"
                  value={rorWR}
                  min={1}
                  max={99}
                  step={0.5}
                  onChange={setRorWR}
                  display={`${fmt2(rorWR)}%`}
                />
                <Slider
                  label="Ratio Gain/Perte (R:R)"
                  value={rorRR}
                  min={0.1}
                  max={10}
                  step={0.1}
                  onChange={setRorRR}
                  display={`${fmt2(rorRR)}`}
                />
                <Slider
                  label="Capital risqué par trade"
                  value={rorRisk}
                  min={0.1}
                  max={25}
                  step={0.1}
                  onChange={setRorRisk}
                  display={`${fmt2(rorRisk)}%`}
                />
                <div className="text-[10px] text-zinc-600 leading-relaxed">
                  Formule : edge = (W×R − (1−W)) / (W×R + (1−W))
                  &nbsp;·&nbsp; RoR = ((1−edge)/(1+edge))
                  <sup>1/f</sup>
                </div>
              </div>

              {/* Output */}
              <div className="flex flex-col items-center justify-center gap-3">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">
                  Probabilité de ruine
                </p>
                <p className={cn('text-6xl font-mono font-bold tabular-nums', rorClass)}>
                  {fmt2(ror)}%
                </p>
                <div className="w-full max-w-48 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-200',
                      ror < 10 ? 'bg-emerald-500' : ror < 50 ? 'bg-yellow-500' : 'bg-red-500',
                    )}
                    style={{ width: `${Math.min(100, ror)}%` }}
                  />
                </div>
                <div className="text-center text-xs text-zinc-500 mt-2 space-y-1">
                  <p>
                    Edge net :{' '}
                    <span className={pnlClass(rorWR / 100 * rorRR - (1 - rorWR / 100))}>
                      {fmt2((rorWR / 100 * rorRR - (1 - rorWR / 100)) * 100)}%
                    </span>
                  </p>
                  <p className="text-zinc-600">
                    Kelly optimal :{' '}
                    <span className="font-mono">
                      {Math.max(0, rorWR / 100 - (1 - rorWR / 100) / rorRR * 100).toFixed(1)}%
                    </span>
                  </p>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      </Section>

    </div>
  )
}
