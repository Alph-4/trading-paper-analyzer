import { useEffect, useRef, useMemo, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts'
import { useTradeStore } from '@/store/useTradeStore'
import type { Trade } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDatetime(d: Date) {
  return d.toLocaleString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDateShort(d: Date) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}
function toTs(d: Date): UTCTimestamp {
  return Math.floor(d.getTime() / 1000) as UTCTimestamp
}
function lwcFmt(ts: number) {
  return new Date(ts * 1000).toLocaleString('fr-FR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

type SortKey = 'idx' | 'commission' | 'grossPnl' | 'netPnl' | 'commPct'

// ── Data builders ─────────────────────────────────────────────────────────────

interface SymbolCommRow {
  symbol: string
  commissionsAbs: number
  count: number
  grossPnlAbs: number
  commPct: number
}

interface TradeRow {
  idx: number
  symbol: string
  dir: 'long' | 'short'
  openTime: Date
  closeTime: Date
  grossPnl: number
  commission: number
  netPnl: number
  commPct: number
  totalUnits: number
}

interface CumPt { time: UTCTimestamp; gross: number; net: number }
interface CommPt { time: UTCTimestamp; value: number }

function buildSymbolRows(trades: Trade[]): SymbolCommRow[] {
  const map = new Map<string, { comm: number; count: number; gross: number }>()
  for (const t of trades) {
    const d = map.get(t.symbol) ?? { comm: 0, count: 0, gross: 0 }
    d.comm += t.totalCommission
    d.count += 1
    d.gross += t.grossPnl
    map.set(t.symbol, d)
  }
  return Array.from(map.entries())
    .map(([symbol, d]): SymbolCommRow => ({
      symbol,
      commissionsAbs: Math.abs(d.comm),
      count: d.count,
      grossPnlAbs: Math.abs(d.gross),
      commPct: d.gross !== 0 ? Math.abs(d.comm) / Math.abs(d.gross) * 100 : 0,
    }))
    .sort((a, b) => b.commissionsAbs - a.commissionsAbs)
}

function buildTableRows(trades: Trade[]): TradeRow[] {
  const sorted = [...trades].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime())
  return sorted.map((t, i) => ({
    idx: i + 1,
    symbol: t.symbol,
    dir: t.direction,
    openTime: t.openTime,
    closeTime: t.closeTime,
    grossPnl: t.grossPnl,
    commission: t.totalCommission,
    netPnl: t.netPnl,
    commPct: t.grossPnl !== 0 ? Math.abs(t.totalCommission) / Math.abs(t.grossPnl) * 100 : 0,
    totalUnits: t.totalUnits,
  }))
}

function buildCumulativeSeries(trades: Trade[]): { grossData: CumPt[]; commData: CommPt[] } {
  const sorted = [...trades].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime())
  let gross = 0; let net = 0
  const grossData: CumPt[] = []
  const commData: CommPt[] = []

  for (const t of sorted) {
    gross += t.grossPnl
    net += t.netPnl
    const ts = toTs(t.closeTime)
    if (grossData.length > 0 && grossData[grossData.length - 1].time >= ts) {
      grossData[grossData.length - 1].gross = gross
      grossData[grossData.length - 1].net = net
      commData[commData.length - 1].value = net - gross
    } else {
      grossData.push({ time: ts, gross, net })
      commData.push({ time: ts, value: net - gross })
    }
  }

  // Leading anchor
  if (sorted.length > 0) {
    const anchor = (toTs(sorted[0].closeTime) - 60) as UTCTimestamp
    grossData.unshift({ time: anchor, gross: 0, net: 0 })
    commData.unshift({ time: anchor, value: 0 })
  }
  return { grossData, commData }
}

// ── Chart legend type ─────────────────────────────────────────────────────────

interface ChartLegend { datetime: string; gross: number; net: number; comm: number }
interface CommLegend { datetime: string; value: number }

// ── Stat row ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, valueClass }: {
  label: string; value: string; sub?: string; valueClass?: string
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <p className="text-xs text-zinc-500 mb-1">{label}</p>
        <p className={cn('text-lg font-mono font-semibold', valueClass ?? 'text-zinc-100')}>{value}</p>
        {sub && <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ── Sort indicator ────────────────────────────────────────────────────────────

function SortTh({
  label, sortKey, current, onSort,
}: {
  label: string; sortKey: SortKey
  current: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void
}) {
  const active = current.key === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 cursor-pointer select-none whitespace-nowrap hover:text-zinc-300 transition-colors"
    >
      {label}
      {active && <span className="ml-1 text-zinc-400">{current.dir === 'desc' ? '↓' : '↑'}</span>}
    </th>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommissionsPage() {
  const trades = useTradeStore((s) => s.trades)

  // Chart refs
  const cumContainerRef = useRef<HTMLDivElement>(null)
  const commContainerRef = useRef<HTMLDivElement>(null)
  const cumChartRef = useRef<IChartApi | null>(null)
  const commChartRef = useRef<IChartApi | null>(null)
  const grossSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const netSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const commSeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const isSyncing = useRef(false)

  const [chartLegend, setChartLegend] = useState<ChartLegend | null>(null)
  const [commLegend, setCommLegend] = useState<CommLegend | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'commission', dir: 'desc' })

  // ── Derived data ────────────────────────────────────────────────────────────

  const totalComm = useMemo(() => trades.reduce((s, t) => s + t.totalCommission, 0), [trades])
  const grossPnl = useMemo(() => trades.reduce((s, t) => s + t.grossPnl, 0), [trades])
  const netPnl = useMemo(() => trades.reduce((s, t) => s + t.netPnl, 0), [trades])
  const avgCommTrade = useMemo(() => trades.length > 0 ? totalComm / trades.length : 0, [trades, totalComm])
  const commDragPct = useMemo(() => grossPnl !== 0 ? Math.abs(totalComm) / Math.abs(grossPnl) * 100 : 0, [totalComm, grossPnl])

  const worstDay = useMemo(() => {
    const map = new Map<string, { label: string; total: number }>()
    for (const t of trades) {
      const key = fmtDateShort(t.closeTime)
      const d = map.get(key) ?? { label: key, total: 0 }
      d.total += t.totalCommission
      map.set(key, d)
    }
    return [...map.values()].sort((a, b) => a.total - b.total)[0] ?? null
  }, [trades])

  const worstPair = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of trades) map.set(t.symbol, (map.get(t.symbol) ?? 0) + t.totalCommission)
    const entries = [...map.entries()].sort((a, b) => a[1] - b[1])
    return entries[0] ? { symbol: entries[0][0], total: entries[0][1] } : null
  }, [trades])

  const symbolRows = useMemo(() => buildSymbolRows(trades), [trades])
  const tableRows = useMemo(() => buildTableRows(trades), [trades])
  const cumSeries = useMemo(() => buildCumulativeSeries(trades), [trades])

  // Break-even
  const breakEven = useMemo(() => {
    if (trades.length === 0) return null
    const sorted = [...trades].sort((a, b) => a.openTime.getTime() - b.openTime.getTime())
    const lastClose = [...trades].sort((a, b) => b.closeTime.getTime() - a.closeTime.getTime())[0]
    const spanHours = (lastClose.closeTime.getTime() - sorted[0].openTime.getTime()) / 3_600_000
    const totalUnitsAll = trades.reduce((s, t) => s + t.totalUnits, 0)
    const commPerHour = spanHours > 0 ? Math.abs(totalComm) / spanHours : 0
    const avgCommPerLot = totalUnitsAll > 0 ? Math.abs(totalComm) / (totalUnitsAll / 100_000) : 0
    const improvementPct = netPnl !== 0 ? Math.abs(totalComm) / Math.abs(netPnl) * 100 : null
    return { grossPnl, improvement: Math.abs(totalComm), improvementPct, commPerHour, avgCommPerLot }
  }, [trades, totalComm, grossPnl, netPnl])

  // Sorted table rows
  const sortedRows = useMemo(() => {
    const rows = [...tableRows]
    rows.sort((a, b) => {
      let av = 0; let bv = 0
      if (sort.key === 'idx') { av = a.idx; bv = b.idx }
      if (sort.key === 'commission') { av = Math.abs(a.commission); bv = Math.abs(b.commission) }
      if (sort.key === 'grossPnl') { av = a.grossPnl; bv = b.grossPnl }
      if (sort.key === 'netPnl') { av = a.netPnl; bv = b.netPnl }
      if (sort.key === 'commPct') { av = a.commPct; bv = b.commPct }
      return sort.dir === 'desc' ? bv - av : av - bv
    })
    return rows
  }, [tableRows, sort])

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    )
  }

  // ── Create charts once on mount ────────────────────────────────────────────

  useEffect(() => {
    const cc = cumContainerRef.current
    const dc = commContainerRef.current
    if (!cc || !dc) return

    const baseOpts = (h: number) => ({
      height: h,
      layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#71717a' },
      grid: { vertLines: { color: '#18181b' }, horzLines: { color: '#18181b' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#27272a' },
      timeScale: { borderColor: '#27272a', timeVisible: true, secondsVisible: false },
    })

    // Cumulative gross & net chart
    const cumChart = createChart(cc, { ...baseOpts(300), width: cc.clientWidth })
    const grossSeries = cumChart.addLineSeries({
      color: '#10b981', lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false,
    })
    const netSeries = cumChart.addLineSeries({
      color: '#f59e0b', lineWidth: 2, lineStyle: 0,
      priceLineVisible: false, lastValueVisible: false,
    })
    cumChartRef.current = cumChart
    grossSeriesRef.current = grossSeries
    netSeriesRef.current = netSeries

    // Cumulative commission drag chart (always ≤ 0)
    const commChart = createChart(dc, { ...baseOpts(160), width: dc.clientWidth })
    const commSeries = commChart.addAreaSeries({
      topColor: '#ef444430', bottomColor: '#ef444408',
      lineColor: '#ef4444', lineWidth: 1,
      priceLineVisible: false, lastValueVisible: false,
    })
    commChartRef.current = commChart
    commSeriesRef.current = commSeries

    // Time sync
    const sync = (src: IChartApi, tgt: IChartApi) => {
      src.timeScale().subscribeVisibleLogicalRangeChange((r) => {
        if (isSyncing.current || !r) return
        isSyncing.current = true
        tgt.timeScale().setVisibleLogicalRange(r)
        isSyncing.current = false
      })
    }
    sync(cumChart, commChart)
    sync(commChart, cumChart)

    // Crosshair: cumulative chart
    cumChart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        commChart.clearCrosshairPosition()
        setChartLegend(null)
        return
      }
      commChart.setCrosshairPosition(0, param.time, commSeries)
      const gp = param.seriesData.get(grossSeries) as { value: number } | undefined
      const np = param.seriesData.get(netSeries) as { value: number } | undefined
      if (gp !== undefined && np !== undefined) {
        setChartLegend({
          datetime: lwcFmt(param.time as number),
          gross: gp.value,
          net: np.value,
          comm: np.value - gp.value,
        })
      }
    })

    commChart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        cumChart.clearCrosshairPosition()
        setCommLegend(null)
        return
      }
      cumChart.setCrosshairPosition(0, param.time, grossSeries)
      const dp = param.seriesData.get(commSeries) as { value: number } | undefined
      if (dp !== undefined) {
        setCommLegend({ datetime: lwcFmt(param.time as number), value: dp.value })
      }
    })

    // Resize observers
    const roC = new ResizeObserver(([e]) => cumChart.applyOptions({ width: e.contentRect.width }))
    const roD = new ResizeObserver(([e]) => commChart.applyOptions({ width: e.contentRect.width }))
    roC.observe(cc); roD.observe(dc)

    return () => {
      roC.disconnect(); roD.disconnect()
      cumChart.remove(); commChart.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update chart data ──────────────────────────────────────────────────────

  useEffect(() => {
    const gS = grossSeriesRef.current
    const nS = netSeriesRef.current
    const cS = commSeriesRef.current
    if (!gS || !nS || !cS) return

    const { grossData, commData } = cumSeries
    if (grossData.length === 0) return

    gS.setData(grossData.map((p) => ({ time: p.time, value: p.gross })))
    nS.setData(grossData.map((p) => ({ time: p.time, value: p.net })))
    cS.setData(commData)

    cumChartRef.current?.timeScale().fitContent()
    commChartRef.current?.timeScale().fitContent()
  }, [cumSeries])

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (trades.length === 0) {
    return <p className="text-zinc-500 text-sm">Aucune donnée chargée.</p>
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Section 1 — KPI cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard
          label="Total commissions"
          value={`-$${fmt2(Math.abs(totalComm))}`}
          valueClass="text-red-400"
        />
        <KpiCard
          label="% du Gross PnL"
          value={`${commDragPct.toFixed(1)}%`}
          sub={`Gross $${fmt2(grossPnl)} → Net $${fmt2(netPnl)}`}
          valueClass="text-amber-400"
        />
        <KpiCard
          label="Comm. moy. / trade"
          value={`-$${fmt2(Math.abs(avgCommTrade))}`}
          sub={`sur ${trades.length} trade${trades.length > 1 ? 's' : ''}`}
          valueClass="text-red-400"
        />
        <KpiCard
          label="Jour le plus coûteux"
          value={worstDay ? `-$${fmt2(Math.abs(worstDay.total))}` : '—'}
          sub={worstDay?.label}
          valueClass="text-red-400"
        />
        <KpiCard
          label="Paire la plus coûteuse"
          value={worstPair ? `-$${fmt2(Math.abs(worstPair.total))}` : '—'}
          sub={worstPair?.symbol}
          valueClass="text-red-400"
        />
      </div>

      {/* ── Section 2 — Commissions par paire (horizontal bars) ─────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Commissions par paire
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(160, symbolRows.length * 36)}>
            <BarChart
              data={symbolRows}
              layout="vertical"
              margin={{ top: 4, right: 72, bottom: 4, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: '#3f3f46' }}
              />
              <YAxis
                type="category"
                dataKey="symbol"
                tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                cursor={{ fill: '#27272a' }}
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 11 }}
                formatter={(v, name) => {
                  if (name === 'commissionsAbs') return [`-$${fmt2(v as number)}`, 'Commissions']
                  return [v, name]
                }}
                labelFormatter={(sym) => {
                  const row = symbolRows.find((r) => r.symbol === sym)
                  return (
                    <span className="text-zinc-400">
                      {sym} — {row?.count} trades — drag {row?.commPct.toFixed(1)}%
                    </span>
                  )
                }}
              />
              <Bar dataKey="commissionsAbs" fill="#f59e0b" radius={[0, 4, 4, 0]}>
                {symbolRows.map((r) => (
                  <Cell key={r.symbol} fill={r.commPct > 50 ? '#ef4444' : r.commPct > 20 ? '#f59e0b' : '#d97706'} />
                ))}
                <LabelList
                  dataKey="commPct"
                  position="right"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => typeof v === 'number' ? `${v.toFixed(1)}%` : ''}
                  style={{ fill: '#71717a', fontSize: 9, fontFamily: 'monospace' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-zinc-600 mt-1">
            Pourcentage = comm / |gross PnL| de la paire. Rouge &gt; 50 %, ambre &gt; 20 %.
          </p>
        </CardContent>
      </Card>

      {/* ── Section 3 — Cumulative chart (LWC) ──────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4 pb-2">
          {/* Cumulative gross vs net */}
          <div className="flex items-baseline gap-4 mb-2">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Gross PnL cumulatif vs Net PnL cumulatif
            </h3>
            {chartLegend ? (
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span className="text-zinc-500">{chartLegend.datetime}</span>
                <span className="text-emerald-400">Gross +${fmt2(chartLegend.gross)}</span>
                <span className="text-amber-400">Net {chartLegend.net >= 0 ? '+' : ''}${fmt2(chartLegend.net)}</span>
                <span className="text-red-400">Comm {fmt2(chartLegend.comm)}$</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 inline-block bg-emerald-500 rounded" />
                  Gross PnL
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 inline-block bg-amber-500 rounded" />
                  Net PnL
                </span>
                <span className="text-zinc-700">— écart = commissions cumulées</span>
              </div>
            )}
          </div>
          <div ref={cumContainerRef} />

          {/* Commission drag */}
          <div className="flex items-baseline gap-4 mt-3 mb-2">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Drag commissions cumulatif
            </h3>
            {commLegend ? (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-zinc-500">{commLegend.datetime}</span>
                <span className="text-red-400">${fmt2(commLegend.value)}</span>
              </div>
            ) : (
              <span className="text-[10px] text-zinc-600">Montant total perdu en commissions</span>
            )}
          </div>
          <div ref={commContainerRef} />
        </CardContent>
      </Card>

      {/* ── Section 4 — Tableau détaillé ─────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Détail par trade
          </h3>
          <div className="max-h-96 overflow-y-auto rounded border border-zinc-800">
            <table className="w-full text-xs font-mono border-collapse">
              <thead className="sticky top-0 bg-zinc-950 z-10">
                <tr className="border-b border-zinc-800">
                  <SortTh label="#" sortKey="idx" current={sort} onSort={toggleSort} />
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Paire</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Ouverture</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Clôture</th>
                  <SortTh label="Gross PnL" sortKey="grossPnl" current={sort} onSort={toggleSort} />
                  <SortTh label="Commission" sortKey="commission" current={sort} onSort={toggleSort} />
                  <SortTh label="Net PnL" sortKey="netPnl" current={sort} onSort={toggleSort} />
                  <SortTh label="Comm %" sortKey="commPct" current={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.idx} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-3 py-1.5 text-zinc-600">{r.idx}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-zinc-200">{r.symbol}</span>
                      <span className={cn('ml-1.5 text-[9px]', r.dir === 'long' ? 'text-emerald-500' : 'text-red-500')}>
                        {r.dir === 'long' ? '▲' : '▼'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-zinc-500">{fmtDatetime(r.openTime)}</td>
                    <td className="px-3 py-1.5 text-zinc-500">{fmtDatetime(r.closeTime)}</td>
                    <td className={cn('px-3 py-1.5', r.grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {r.grossPnl >= 0 ? '+' : ''}${fmt2(r.grossPnl)}
                    </td>
                    <td className="px-3 py-1.5 text-red-400">-${fmt2(Math.abs(r.commission))}</td>
                    <td className={cn('px-3 py-1.5', r.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {r.netPnl >= 0 ? '+' : ''}${fmt2(r.netPnl)}
                    </td>
                    <td className={cn('px-3 py-1.5', r.commPct > 50 ? 'text-red-400' : r.commPct > 20 ? 'text-amber-400' : 'text-zinc-400')}>
                      {r.commPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">
            Comm % = |commission| / |gross PnL|. Cliquer sur les en-têtes pour trier.
          </p>
        </CardContent>
      </Card>

      {/* ── Section 5 — Break-even analysis ─────────────────────────────────── */}
      {breakEven && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Analyse break-even
            </h3>

            {/* Hero statement */}
            <div className="bg-zinc-800/60 rounded-lg p-4 border border-zinc-700">
              <p className="text-xs text-zinc-500 mb-1">Sans commissions, votre PnL serait de</p>
              <p className={cn('text-2xl font-semibold font-mono', breakEven.grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {breakEven.grossPnl >= 0 ? '+' : ''}${fmt2(breakEven.grossPnl)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                soit{' '}
                <span className="text-emerald-400 font-mono">+${fmt2(breakEven.improvement)}</span>
                {' '}de plus{' '}
                {breakEven.improvementPct !== null && (
                  <span className="text-zinc-400 font-mono">
                    ({breakEven.improvementPct > 0 ? '+' : ''}{breakEven.improvementPct.toFixed(1)}% vs net actuel)
                  </span>
                )}
              </p>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-zinc-800/40 rounded p-3">
                <p className="text-[10px] text-zinc-500 mb-0.5">Net PnL actuel</p>
                <p className={cn('text-sm font-mono font-semibold', netPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {netPnl >= 0 ? '+' : ''}${fmt2(netPnl)}
                </p>
              </div>
              <div className="bg-zinc-800/40 rounded p-3">
                <p className="text-[10px] text-zinc-500 mb-0.5">Commissions totales</p>
                <p className="text-sm font-mono font-semibold text-red-400">-${fmt2(Math.abs(totalComm))}</p>
              </div>
              <div className="bg-zinc-800/40 rounded p-3">
                <p className="text-[10px] text-zinc-500 mb-0.5">Comm / heure de trading</p>
                <p className="text-sm font-mono font-semibold text-amber-400">
                  -${fmt2(breakEven.commPerHour)}<span className="text-zinc-600 text-xs">/h</span>
                </p>
              </div>
              <div className="bg-zinc-800/40 rounded p-3">
                <p className="text-[10px] text-zinc-500 mb-0.5">Comm moy. / 100k unités</p>
                <p className="text-sm font-mono font-semibold text-amber-400">
                  -${fmt2(breakEven.avgCommPerLot)}
                  <span className="text-zinc-600 text-xs">/lot</span>
                </p>
              </div>
            </div>

            {/* Gross vs Net visual bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>Gross PnL</span>
                <span className={cn('font-mono', breakEven.grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {breakEven.grossPnl >= 0 ? '+' : ''}${fmt2(breakEven.grossPnl)}
                </span>
              </div>
              <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden">
                {breakEven.grossPnl !== 0 && (
                  <>
                    <div
                      className="absolute top-0 left-0 h-full rounded-full bg-emerald-500/40"
                      style={{ width: '100%' }}
                    />
                    <div
                      className="absolute top-0 left-0 h-full rounded-full"
                      style={{
                        width: `${Math.max(2, (1 - Math.abs(totalComm) / Math.abs(breakEven.grossPnl)) * 100)}%`,
                        background: netPnl >= 0 ? '#10b981' : '#ef4444',
                      }}
                    />
                  </>
                )}
              </div>
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>Net PnL</span>
                <span className={cn('font-mono', netPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {netPnl >= 0 ? '+' : ''}${fmt2(netPnl)}
                  <span className="text-zinc-600 ml-1">({(100 - commDragPct).toFixed(1)}% conservé)</span>
                </span>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

    </div>
  )
}
