import { useMemo, useRef, useState, useCallback } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts'
import { useTradeStore } from '@/store/useTradeStore'
import type { Trade } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUsd(v: number) {
  const s = fmt2(Math.abs(v))
  return (v < 0 ? '-$' : '+$') + s
}
function pnlClass(v: number) {
  return v >= 0 ? 'text-emerald-400' : 'text-red-400'
}
function fmtDuration(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  return `${hours.toFixed(1)}h`
}

type SessionName = 'Asia' | 'London' | 'New York' | 'Hors session'

function sessionOf(utcHour: number): SessionName {
  if (utcHour >= 0 && utcHour < 8) return 'Asia'
  if (utcHour >= 8 && utcHour < 13) return 'London'
  if (utcHour >= 13 && utcHour < 22) return 'New York'
  return 'Hors session'
}

const SESSION_DEFS = [
  {
    name: 'Asia' as SessionName,
    range: '00h–08h UTC',
    color: 'text-amber-400',
    badge: 'border border-amber-800 text-amber-400',
    dot: '#f59e0b',
  },
  {
    name: 'London' as SessionName,
    range: '08h–13h UTC',
    color: 'text-emerald-400',
    badge: 'border border-emerald-800 text-emerald-400',
    dot: '#10b981',
  },
  {
    name: 'New York' as SessionName,
    range: '13h–22h UTC',
    color: 'text-sky-400',
    badge: 'border border-sky-800 text-sky-400',
    dot: '#38bdf8',
  },
]

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionStat {
  name: SessionName
  count: number
  wins: number
  winRate: number
  netPnl: number
  avgTrade: number
  totalComm: number
  best: number
  worst: number
}

interface HourStat {
  hour: number
  label: string
  count: number
  wins: number
  winRate: number
  netPnl: number
}

interface DayStat {
  iso: number // 0=Mon … 4=Fri
  label: string
  count: number
  wins: number
  winRate: number
  netPnl: number
}

interface HeatCell {
  count: number
  netPnl: number
}

interface ScatterPt {
  durH: number
  netPnl: number
  win: boolean
  symbol: string
  label: string
}

interface HeatTooltip {
  x: number
  y: number
  hour: number
  day: number
  cell: HeatCell
}

// ── Computation ───────────────────────────────────────────────────────────────

function buildSessionStats(trades: Trade[]): SessionStat[] {
  const map = new Map<SessionName, SessionStat>()
  for (const def of SESSION_DEFS) {
    map.set(def.name, {
      name: def.name,
      count: 0, wins: 0, winRate: 0,
      netPnl: 0, avgTrade: 0, totalComm: 0,
      best: -Infinity, worst: Infinity,
    })
  }
  for (const t of trades) {
    const sName = sessionOf(t.openTime.getUTCHours())
    const s = map.get(sName)
    if (!s) continue
    s.count++
    if (t.win) s.wins++
    s.netPnl += t.netPnl
    s.totalComm += t.totalCommission
    if (t.netPnl > s.best) s.best = t.netPnl
    if (t.netPnl < s.worst) s.worst = t.netPnl
  }
  return SESSION_DEFS.map(({ name }) => {
    const s = map.get(name)!
    s.winRate = s.count > 0 ? (s.wins / s.count) * 100 : 0
    s.avgTrade = s.count > 0 ? s.netPnl / s.count : 0
    if (s.best === -Infinity) s.best = 0
    if (s.worst === Infinity) s.worst = 0
    return s
  })
}

function buildHourStats(trades: Trade[]): HourStat[] {
  const arr: HourStat[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h, label: `${h}h`, count: 0, wins: 0, winRate: 0, netPnl: 0,
  }))
  for (const t of trades) {
    const h = t.openTime.getHours()
    arr[h].count++
    if (t.win) arr[h].wins++
    arr[h].netPnl += t.netPnl
  }
  for (const s of arr) {
    s.winRate = s.count > 0 ? (s.wins / s.count) * 100 : 0
  }
  return arr
}

function buildDayStats(trades: Trade[]): DayStat[] {
  const arr: DayStat[] = DAY_LABELS.map((label, iso) => ({
    iso, label, count: 0, wins: 0, winRate: 0, netPnl: 0,
  }))
  for (const t of trades) {
    const iso = (t.openTime.getDay() + 6) % 7
    if (iso > 4) continue
    arr[iso].count++
    if (t.win) arr[iso].wins++
    arr[iso].netPnl += t.netPnl
  }
  for (const s of arr) {
    s.winRate = s.count > 0 ? (s.wins / s.count) * 100 : 0
  }
  return arr
}

function buildHeatmap(trades: Trade[]): Record<number, Record<number, HeatCell>> {
  const map: Record<number, Record<number, HeatCell>> = {}
  for (let h = 0; h < 24; h++) {
    map[h] = {}
    for (let d = 0; d < 5; d++) {
      map[h][d] = { count: 0, netPnl: 0 }
    }
  }
  for (const t of trades) {
    const h = t.openTime.getHours()
    const iso = (t.openTime.getDay() + 6) % 7
    if (iso > 4) continue
    map[h][iso].count++
    map[h][iso].netPnl += t.netPnl
  }
  return map
}

function buildScatterPts(trades: Trade[]): ScatterPt[] {
  return trades.map((t) => {
    const durH = (t.closeTime.getTime() - t.openTime.getTime()) / 3_600_000
    return {
      durH,
      netPnl: t.netPnl,
      win: t.win,
      symbol: t.symbol,
      label: `${t.symbol} — ${fmtDuration(durH)} — ${t.netPnl >= 0 ? '+' : ''}$${fmt2(t.netPnl)}`,
    }
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between items-baseline py-0.5">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={cn('text-xs font-mono', cls ?? 'text-zinc-200')}>{value}</span>
    </div>
  )
}

interface ScatterPlotProps { pts: ScatterPt[] }

function ScatterPlot({ pts }: ScatterPlotProps) {
  const [hovered, setHovered] = useState<ScatterPt | null>(null)

  const ML = 56, MR = 20, MT = 16, MB = 32
  const W = 600, H = 260
  const PW = W - ML - MR
  const PH = H - MT - MB

  const maxDur = Math.max(...pts.map((p) => p.durH), 0.5)
  const maxAbsPnl = Math.max(...pts.map((p) => Math.abs(p.netPnl)), 1)

  const xS = (v: number) => ML + (v / maxDur) * PW
  const yS = (v: number) => MT + PH / 2 - (v / maxAbsPnl) * (PH / 2)

  const yTicks = [-maxAbsPnl, -maxAbsPnl / 2, 0, maxAbsPnl / 2, maxAbsPnl]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 260 }}>
        {/* Grid + axes */}
        {yTicks.map((v) => {
          const y = yS(v)
          return (
            <g key={v}>
              <line x1={ML} y1={y} x2={W - MR} y2={y}
                stroke={v === 0 ? '#52525b' : '#27272a'}
                strokeWidth={v === 0 ? 1 : 0.5}
                strokeDasharray={v === 0 ? '4 3' : '2 3'}
              />
              <text x={ML - 4} y={y + 4} textAnchor="end"
                fill="#71717a" fontSize={9} fontFamily="monospace">
                {v === 0 ? '0' : `${v > 0 ? '+' : ''}$${Math.round(Math.abs(v))}`}
              </text>
            </g>
          )
        })}
        {/* X axis */}
        <line x1={ML} y1={H - MB} x2={W - MR} y2={H - MB} stroke="#3f3f46" strokeWidth={1} />
        {[0, maxDur / 4, maxDur / 2, (maxDur * 3) / 4, maxDur].map((v) => (
          <text key={v} x={xS(v)} y={H - MB + 14} textAnchor="middle"
            fill="#71717a" fontSize={9} fontFamily="monospace">
            {fmtDuration(v)}
          </text>
        ))}
        {/* Points */}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={xS(p.durH)}
            cy={yS(p.netPnl)}
            r={4}
            fill={p.win ? '#10b981' : '#ef4444'}
            fillOpacity={0.65}
            stroke={p.win ? '#10b981' : '#ef4444'}
            strokeWidth={0.5}
            className="cursor-pointer"
            onMouseEnter={() => setHovered(p)}
            onMouseLeave={() => setHovered(null)}
          >
            <title>{p.label}</title>
          </circle>
        ))}
        {/* Axis labels */}
        <text x={ML + PW / 2} y={H - 2} textAnchor="middle" fill="#52525b" fontSize={9}>
          Durée
        </text>
        <text x={10} y={MT + PH / 2} textAnchor="middle" fill="#52525b" fontSize={9}
          transform={`rotate(-90, 10, ${MT + PH / 2})`}>
          Net PnL
        </text>
      </svg>

      {/* Hover strip */}
      <div className={cn(
        'h-6 flex items-center justify-center text-xs font-mono transition-opacity',
        hovered ? 'opacity-100' : 'opacity-0',
        hovered && (hovered.win ? 'text-emerald-400' : 'text-red-400'),
      )}>
        {hovered?.label}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const trades = useTradeStore((s) => s.trades)

  const heatmapRef = useRef<HTMLDivElement>(null)
  const [heatTip, setHeatTip] = useState<HeatTooltip | null>(null)

  const sessionStats = useMemo(() => buildSessionStats(trades), [trades])
  const hourStats = useMemo(() => buildHourStats(trades), [trades])
  const dayStats = useMemo(() => buildDayStats(trades), [trades])
  const heatmap = useMemo(() => buildHeatmap(trades), [trades])
  const scatterPts = useMemo(() => buildScatterPts(trades), [trades])

  const maxAbsHeat = useMemo(() => {
    let m = 1
    for (let h = 0; h < 24; h++)
      for (let d = 0; d < 5; d++)
        m = Math.max(m, Math.abs(heatmap[h]?.[d]?.netPnl ?? 0))
    return m
  }, [heatmap])

  // Duration stats
  const durStats = useMemo(() => {
    if (scatterPts.length === 0) return null
    const durs = scatterPts.map((p) => p.durH).sort((a, b) => a - b)
    const avg = durs.reduce((s, v) => s + v, 0) / durs.length
    const med = durs[Math.floor(durs.length / 2)]
    return { min: durs[0], max: durs[durs.length - 1], avg, median: med }
  }, [scatterPts])

  // Custom day-axis tick for section 4
  const renderDayTick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      const { x = 0, y = 0, payload } = props as { x?: number; y?: number; payload?: { value: string } }
      const xn = Number(x)
      const s = dayStats.find((d) => d.label === payload?.value)
      if (!s) return <g />
      return (
        <g transform={`translate(${xn},${y})`}>
          <text textAnchor="middle" fill="#a1a1aa" fontSize={11} y={4}>{s.label}</text>
          <text textAnchor="middle" fill="#71717a" fontSize={9} y={17}>{s.count} trades</text>
          <text textAnchor="middle" fill={s.winRate >= 50 ? '#10b981' : '#f59e0b'} fontSize={9} y={30}>
            {s.winRate.toFixed(0)}%
          </text>
        </g>
      )
    },
    [dayStats],
  )

  if (trades.length === 0) {
    return <p className="text-zinc-500 text-sm">Aucune donnée chargée.</p>
  }

  // ── Section 3 data: only hours with trades ─────────────────────────────────
  const hourChartData = hourStats.filter((h) => h.count > 0)

  return (
    <div className="space-y-5">

      {/* ── Section 1 — Session cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SESSION_DEFS.map((def) => {
          const s = sessionStats.find((x) => x.name === def.name)!
          return (
            <Card key={def.name} className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={cn('text-sm font-semibold', def.color)}>{def.name}</span>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded font-mono', def.badge)}>
                    {def.range}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <StatRow label="Trades" value={String(s.count)} />
                  <StatRow label="Win Rate" value={`${s.winRate.toFixed(1)}%`}
                    cls={s.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'} />
                  <StatRow label="Net PnL" value={fmtUsd(s.netPnl)} cls={pnlClass(s.netPnl)} />
                  <StatRow label="Avg / Trade" value={fmtUsd(s.avgTrade)} cls={pnlClass(s.avgTrade)} />
                  <StatRow label="Commissions" value={`-$${fmt2(s.totalComm)}`} cls="text-zinc-400" />
                  <StatRow label="Meilleur" value={`+$${fmt2(s.best)}`} cls="text-emerald-400" />
                  <StatRow label="Pire" value={`-$${fmt2(Math.abs(s.worst))}`} cls="text-red-400" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── Section 2 — Heatmap heure × jour ────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Heatmap — Net PnL par heure &amp; jour
          </h3>
          <div ref={heatmapRef} className="relative overflow-auto">
            <table className="text-[10px] font-mono border-collapse w-full">
              <thead>
                <tr>
                  <th className="text-zinc-600 font-normal pr-2 pb-1 text-right w-8">h</th>
                  {DAY_LABELS.map((d) => (
                    <th key={d} className="text-zinc-500 font-normal pb-1 text-center">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 24 }, (_, h) => (
                  <tr key={h}>
                    <td className="text-zinc-600 pr-2 text-right leading-none py-px">{h}h</td>
                    {Array.from({ length: 5 }, (_, d) => {
                      const cell = heatmap[h]?.[d] ?? { count: 0, netPnl: 0 }
                      const hasData = cell.count > 0
                      const alpha = hasData
                        ? Math.max(0.15, Math.min(0.9, Math.abs(cell.netPnl) / maxAbsHeat))
                        : 0
                      const bg = !hasData
                        ? '#18181b'
                        : cell.netPnl >= 0
                          ? `rgba(16,185,129,${alpha})`
                          : `rgba(239,68,68,${alpha})`

                      return (
                        <td
                          key={d}
                          style={{ background: bg }}
                          className="w-10 h-5 text-center cursor-default select-none border border-zinc-950/40"
                          onMouseEnter={(e) => {
                            if (!hasData || !heatmapRef.current) return
                            const rect = e.currentTarget.getBoundingClientRect()
                            const par = heatmapRef.current.getBoundingClientRect()
                            setHeatTip({
                              x: rect.left - par.left + rect.width / 2,
                              y: rect.top - par.top - 8,
                              hour: h, day: d, cell,
                            })
                          }}
                          onMouseLeave={() => setHeatTip(null)}
                        >
                          {hasData && (
                            <span className={cell.netPnl >= 0 ? 'text-emerald-200' : 'text-red-200'}>
                              {cell.count}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Floating tooltip */}
            {heatTip && (
              <div
                className="absolute z-10 pointer-events-none bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono shadow-lg -translate-x-1/2 -translate-y-full"
                style={{ left: heatTip.x, top: heatTip.y }}
              >
                <div className="text-zinc-400 mb-0.5">
                  {heatTip.hour}h — {DAY_LABELS[heatTip.day]}
                </div>
                <div className="text-zinc-300">{heatTip.cell.count} trade{heatTip.cell.count > 1 ? 's' : ''}</div>
                <div className={pnlClass(heatTip.cell.netPnl)}>
                  {heatTip.cell.netPnl >= 0 ? '+' : ''}${fmt2(heatTip.cell.netPnl)}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(16,185,129,0.65)' }} />
              Gain
            </div>
            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(239,68,68,0.65)' }} />
              Perte
            </div>
            <span className="text-[10px] text-zinc-600 ml-auto">chiffre = nb trades</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3 — PnL + Win Rate par heure ────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Net PnL &amp; Win Rate par heure
            </h3>
            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-1 inline-block rounded" style={{ background: '#10b981' }} />
                Net PnL (axe gauche)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 inline-block rounded" style={{ background: '#818cf8' }} />
                Win Rate % (axe droit)
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={hourChartData} margin={{ top: 4, right: 48, bottom: 0, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: '#3f3f46' }}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => `$${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(0)}`}
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: '#818cf8', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 11 }}
                cursor={{ fill: '#27272a' }}
                formatter={(v, name) => {
                  if (name === 'netPnl') return [`$${fmt2(v as number)}`, 'Net PnL']
                  if (name === 'winRate') return [`${(v as number).toFixed(1)}%`, 'Win Rate']
                  return [v, name]
                }}
                labelFormatter={(l) => <span className="text-zinc-400">{l}</span>}
              />
              <ReferenceLine yAxisId="left" y={0} stroke="#52525b" strokeDasharray="3 3" />
              <Bar yAxisId="left" dataKey="netPnl" radius={[3, 3, 0, 0]}>
                {hourChartData.map((h) => (
                  <Cell key={h.hour} fill={h.netPnl >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                dataKey="winRate"
                stroke="#818cf8"
                strokeWidth={1.5}
                dot={{ r: 3, fill: '#818cf8', strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Section 4 — PnL par jour de la semaine ───────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Net PnL par jour de la semaine
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={dayStats}
              margin={{ top: 4, right: 16, bottom: 10, left: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="label"
                tick={renderDayTick}
                height={44}
                interval={0}
                tickLine={false}
                axisLine={{ stroke: '#3f3f46' }}
              />
              <YAxis
                tickFormatter={(v) => `$${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(0)}`}
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 11 }}
                cursor={{ fill: '#27272a' }}
                formatter={(v, name) => {
                  if (name === 'netPnl') return [`$${fmt2(v as number)}`, 'Net PnL']
                  return [v, name]
                }}
                labelFormatter={(l) => {
                  const s = dayStats.find((d) => d.label === l)
                  return (
                    <span className="text-zinc-400">
                      {l} — {s?.count ?? 0} trades
                    </span>
                  )
                }}
              />
              <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
              <Bar dataKey="netPnl" radius={[3, 3, 0, 0]}>
                {dayStats.map((d) => (
                  <Cell key={d.iso} fill={d.netPnl >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Section 5 — Durée des trades (scatter) ──────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            Durée des trades vs Net PnL
          </h3>
          <p className="text-[10px] text-zinc-600 mb-3">
            Axe X = durée (ouverture → fermeture) &nbsp;·&nbsp; Axe Y = net PnL &nbsp;·&nbsp;
            <span className="text-emerald-600">vert = win</span>&ensp;
            <span className="text-red-600">rouge = loss</span>
          </p>

          <ScatterPlot pts={scatterPts} />

          {durStats && (
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-zinc-800">
              {[
                { label: 'Min', value: fmtDuration(durStats.min) },
                { label: 'Max', value: fmtDuration(durStats.max) },
                { label: 'Moy', value: fmtDuration(durStats.avg) },
                { label: 'Méd', value: fmtDuration(durStats.median) },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
                  <div className="text-sm font-mono text-zinc-200">{value}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
