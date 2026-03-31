import { useEffect, useRef, useMemo, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useTradeStore } from '@/store/useTradeStore'
import type { RawRow, Trade } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toTs(d: Date): UTCTimestamp {
  return Math.floor(d.getTime() / 1000) as UTCTimestamp
}

function fmtDatetime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('fr-FR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

type DirFilter = 'all' | 'long' | 'short'

interface EquityPoint { time: UTCTimestamp; value: number }
interface HistPoint { time: UTCTimestamp; value: number; color: string }

// ── Data builders ─────────────────────────────────────────────────────────────

/** Balance series from rawRows (actual account balance, one point per event). */
function buildRawEquityData(rawRows: RawRow[]): EquityPoint[] {
  const sorted = [...rawRows]
    .map((r) => {
      const t = new Date(r.heure.replace(' ', 'T'))
      return { time: toTs(t), value: r.balanceApres }
    })
    .filter((p) => !isNaN(p.time))
    .sort((a, b) => a.time - b.time)

  // Deduplicate: same-second rows → keep last value
  const result: EquityPoint[] = []
  for (const p of sorted) {
    if (result.length > 0 && result[result.length - 1].time === p.time) {
      result[result.length - 1].value = p.value
    } else {
      result.push({ ...p })
    }
  }
  return result
}

/** Cumulative equity from a filtered trade list, starting at startBalance. */
function buildTradeEquityData(trades: Trade[], startBalance: number): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime())
  if (sorted.length === 0) return []

  let balance = startBalance
  const result: EquityPoint[] = [
    // Anchor point just before first trade
    { time: (toTs(sorted[0].closeTime) - 60) as UTCTimestamp, value: startBalance },
  ]
  for (const t of sorted) {
    balance += t.netPnl
    const ts = toTs(t.closeTime)
    if (result[result.length - 1].time >= ts) {
      result[result.length - 1].value = balance // merge same-second trades
    } else {
      result.push({ time: ts, value: balance })
    }
  }
  return result
}

/** Drawdown series (0 or negative) from an equity curve. */
function buildDrawdownData(equity: EquityPoint[], startBalance: number): EquityPoint[] {
  let peak = startBalance
  return equity.map((p) => {
    if (p.value > peak) peak = p.value
    return { time: p.time, value: peak > 0 ? p.value - peak : 0 }
  })
}

/** One bar per trade with green/red color. Strictly monotonic timestamps. */
function buildHistogramData(trades: Trade[]): HistPoint[] {
  const sorted = [...trades].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime())
  const result: HistPoint[] = []
  for (const t of sorted) {
    let ts = toTs(t.closeTime)
    if (result.length > 0 && result[result.length - 1].time >= ts) {
      ts = (result[result.length - 1].time + 1) as UTCTimestamp
    }
    result.push({ time: ts, value: t.netPnl, color: t.win ? '#10b981a0' : '#ef4444a0' })
  }
  return result
}

// ── Chart theme ───────────────────────────────────────────────────────────────

function makeChartOptions(height: number) {
  return {
    height,
    layout: {
      background: { type: ColorType.Solid, color: '#09090b' },
      textColor: '#71717a',
    },
    grid: {
      vertLines: { color: '#18181b' },
      horzLines: { color: '#18181b' },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#27272a' },
    timeScale: { borderColor: '#27272a', timeVisible: true, secondsVisible: false },
  }
}

// ── Legend state types ────────────────────────────────────────────────────────

interface EquityLegend { datetime: string; balance: number; change: number }
interface DdLegend { datetime: string; value: number }
interface HistLegend { datetime: string; pnl: number }

// ── Component ─────────────────────────────────────────────────────────────────

export default function EquityPage() {
  const rawRows = useTradeStore((s) => s.rawRows)
  const trades = useTradeStore((s) => s.trades)

  const [dirFilter, setDirFilter] = useState<DirFilter>('all')
  const [symFilter, setSymFilter] = useState('all')
  const [equityLegend, setEquityLegend] = useState<EquityLegend | null>(null)
  const [ddLegend, setDdLegend] = useState<DdLegend | null>(null)
  const [histLegend, setHistLegend] = useState<HistLegend | null>(null)

  // DOM containers
  const equityContainerRef = useRef<HTMLDivElement>(null)
  const ddContainerRef = useRef<HTMLDivElement>(null)
  const histContainerRef = useRef<HTMLDivElement>(null)

  // Chart/series instances — stable refs, never change after mount
  const equityChartRef = useRef<IChartApi | null>(null)
  const ddChartRef = useRef<IChartApi | null>(null)
  const histChartRef = useRef<IChartApi | null>(null)
  const equitySeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null)
  const ddSeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const histSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  // Prevents infinite loops when syncing time scales
  const isSyncing = useRef(false)
  // Kept in a ref so crosshair callbacks always read the latest value
  const startBalRef = useRef(0)

  // ── Derived data ──────────────────────────────────────────────────────────

  const symbols = useMemo(
    () => Array.from(new Set(trades.map((t) => t.symbol))).sort(),
    [trades],
  )

  const filteredTrades = useMemo(
    () => trades.filter((t) => {
      if (dirFilter !== 'all' && t.direction !== dirFilter) return false
      if (symFilter !== 'all' && t.symbol !== symFilter) return false
      return true
    }),
    [trades, dirFilter, symFilter],
  )

  const initialBalance = useMemo(
    () => (rawRows.length > 0 ? rawRows[rawRows.length - 1].balanceAvant : 0),
    [rawRows],
  )

  const chartData = useMemo(() => {
    const isFiltered = dirFilter !== 'all' || symFilter !== 'all'
    const startBal = isFiltered ? 0 : initialBalance

    const equityData = isFiltered
      ? buildTradeEquityData(filteredTrades, startBal)
      : buildRawEquityData(rawRows)
    const drawdownData = buildDrawdownData(equityData, startBal)
    const histData = buildHistogramData(filteredTrades)

    return { equityData, drawdownData, histData, startBal }
  }, [filteredTrades, dirFilter, symFilter, rawRows, initialBalance])

  // ── Create charts once on mount ───────────────────────────────────────────

  useEffect(() => {
    const ec = equityContainerRef.current
    const dc = ddContainerRef.current
    const hc = histContainerRef.current
    if (!ec || !dc || !hc) return

    // === Equity (baseline series: green above start, red below) ===
    const equityChart = createChart(ec, { ...makeChartOptions(400), width: ec.clientWidth })
    const equitySeries = equityChart.addBaselineSeries({
      baseValue: { type: 'price', price: 0 },  // updated by data effect
      topLineColor: '#10b981',
      topFillColor1: '#10b98128',
      topFillColor2: '#10b98108',
      bottomLineColor: '#ef4444',
      bottomFillColor1: '#ef444408',
      bottomFillColor2: '#ef444428',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    equityChartRef.current = equityChart
    equitySeriesRef.current = equitySeries

    // === Drawdown (area, always ≤ 0, red) ===
    const ddChart = createChart(dc, { ...makeChartOptions(200), width: dc.clientWidth })
    const ddSeries = ddChart.addAreaSeries({
      topColor: '#ef444430',
      bottomColor: '#ef444408',
      lineColor: '#ef4444',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    ddChartRef.current = ddChart
    ddSeriesRef.current = ddSeries

    // === Histogram (net PnL per trade) ===
    const histChart = createChart(hc, { ...makeChartOptions(200), width: hc.clientWidth })
    const histSeries = histChart.addHistogramSeries({
      color: '#10b981',
      base: 0,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      priceLineVisible: false,
    })
    histChartRef.current = histChart
    histSeriesRef.current = histSeries

    // === Time-scale sync (all 3 charts) ===
    const bindSync = (src: IChartApi, targets: IChartApi[]) => {
      src.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncing.current || !range) return
        isSyncing.current = true
        targets.forEach((t) => t.timeScale().setVisibleLogicalRange(range))
        isSyncing.current = false
      })
    }
    bindSync(equityChart, [ddChart, histChart])
    bindSync(ddChart, [equityChart, histChart])
    bindSync(histChart, [equityChart, ddChart])

    // === Crosshair sync: equity ↔ drawdown ===
    equityChart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        ddChart.clearCrosshairPosition()
        setEquityLegend(null)
        return
      }
      ddChart.setCrosshairPosition(0, param.time, ddSeries)
      const dp = param.seriesData.get(equitySeries) as { value: number } | undefined
      if (dp !== undefined) {
        const ts = param.time as number
        setEquityLegend({
          datetime: fmtDatetime(ts),
          balance: dp.value,
          change: dp.value - startBalRef.current,
        })
      }
    })

    ddChart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        equityChart.clearCrosshairPosition()
        setDdLegend(null)
        return
      }
      equityChart.setCrosshairPosition(0, param.time, equitySeries)
      const dp = param.seriesData.get(ddSeries) as { value: number } | undefined
      if (dp !== undefined) {
        setDdLegend({ datetime: fmtDatetime(param.time as number), value: dp.value })
      }
    })

    histChart.subscribeCrosshairMove((param) => {
      if (!param.time) { setHistLegend(null); return }
      const dp = param.seriesData.get(histSeries) as { value: number } | undefined
      if (dp !== undefined) {
        setHistLegend({ datetime: fmtDatetime(param.time as number), pnl: dp.value })
      }
    })

    // === ResizeObservers ===
    const roE = new ResizeObserver(([e]) => equityChart.applyOptions({ width: e.contentRect.width }))
    const roD = new ResizeObserver(([e]) => ddChart.applyOptions({ width: e.contentRect.width }))
    const roH = new ResizeObserver(([e]) => histChart.applyOptions({ width: e.contentRect.width }))
    roE.observe(ec); roD.observe(dc); roH.observe(hc)

    return () => {
      roE.disconnect(); roD.disconnect(); roH.disconnect()
      equityChart.remove(); ddChart.remove(); histChart.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update series data when filter or raw data changes ───────────────────

  useEffect(() => {
    const eS = equitySeriesRef.current
    const dS = ddSeriesRef.current
    const hS = histSeriesRef.current
    if (!eS || !dS || !hS) return

    const { equityData, drawdownData, histData, startBal } = chartData
    startBalRef.current = startBal

    eS.applyOptions({ baseValue: { type: 'price', price: startBal } })

    if (equityData.length > 0) eS.setData(equityData)
    if (drawdownData.length > 0) dS.setData(drawdownData)
    if (histData.length > 0) hS.setData(histData)

    equityChartRef.current?.timeScale().fitContent()
    ddChartRef.current?.timeScale().fitContent()
    histChartRef.current?.timeScale().fitContent()
  }, [chartData])

  // ── Guards ────────────────────────────────────────────────────────────────

  if (rawRows.length === 0) {
    return <p className="text-zinc-500 text-sm">Aucune donnée chargée.</p>
  }

  const DIR_BTNS: { value: DirFilter; label: string }[] = [
    { value: 'all', label: 'Tout' },
    { value: 'long', label: 'Long only' },
    { value: 'short', label: 'Short only' },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Direction toggle group */}
        <div className="flex items-center rounded-md border border-zinc-800 overflow-hidden">
          {DIR_BTNS.map((b) => (
            <button
              key={b.value}
              onClick={() => setDirFilter(b.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors select-none',
                dirFilter === b.value
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300',
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Symbol dropdown */}
        <Select value={symFilter} onValueChange={setSymFilter}>
          <SelectTrigger className="h-8 w-40 text-xs bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectValue placeholder="Paire…" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectItem value="all" className="text-xs">Toutes les paires</SelectItem>
            {symbols.map((s) => (
              <SelectItem key={s} value={s} className="text-xs font-mono">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-zinc-600 font-mono">
          {filteredTrades.length} trade{filteredTrades.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Equity curve ─────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4 pb-2">
          <div className="flex items-baseline gap-4 mb-2">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Equity Curve
            </h3>
            {equityLegend ? (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-zinc-500">{equityLegend.datetime}</span>
                <span className="text-zinc-200">${fmt2(equityLegend.balance)}</span>
                <span className={equityLegend.change >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {equityLegend.change >= 0 ? '+' : ''}${fmt2(equityLegend.change)}
                </span>
              </div>
            ) : (
              <span className="text-xs text-zinc-600 font-mono">
                Début&nbsp;${fmt2(initialBalance)}
              </span>
            )}
          </div>
          <div ref={equityContainerRef} />
        </CardContent>
      </Card>

      {/* ── Drawdown ─────────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4 pb-2">
          <div className="flex items-baseline gap-4 mb-2">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Drawdown
            </h3>
            {ddLegend ? (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-zinc-500">{ddLegend.datetime}</span>
                <span className="text-red-400">${fmt2(ddLegend.value)}</span>
              </div>
            ) : (
              <span className="text-xs text-zinc-600">Peak-to-trough en USD</span>
            )}
          </div>
          <div ref={ddContainerRef} />
        </CardContent>
      </Card>

      {/* ── PnL per trade histogram ───────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4 pb-2">
          <div className="flex items-baseline gap-4 mb-2">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              PnL par Trade
            </h3>
            {histLegend ? (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-zinc-500">{histLegend.datetime}</span>
                <span className={histLegend.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {histLegend.pnl >= 0 ? '+' : ''}${fmt2(histLegend.pnl)}
                </span>
              </div>
            ) : (
              <span className="text-xs text-zinc-600">
                Net PnL — <span className="text-emerald-600">vert win</span>{' / '}
                <span className="text-red-600">rouge loss</span>
              </span>
            )}
          </div>
          <div ref={histContainerRef} />
        </CardContent>
      </Card>

    </div>
  )
}
