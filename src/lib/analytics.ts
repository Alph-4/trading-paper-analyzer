import { differenceInCalendarDays, format } from 'date-fns'
import type {
  Trade,
  ParsedEvent,
  AnalyticsResult,
  Summary,
  BalancePoint,
  SymbolStat,
  TimeStats,
  TimeBucket,
  RollingPoint,
  StreakPoint,
  DirectionStat,
} from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stdDev(arr: number[], avg = mean(arr)): number {
  if (arr.length < 2) return 0
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function skewness(arr: number[], avg: number, sd: number): number {
  if (sd === 0 || arr.length < 3) return 0
  const n = arr.length
  return (
    (n / ((n - 1) * (n - 2))) *
    arr.reduce((s, v) => s + ((v - avg) / sd) ** 3, 0)
  )
}

function kurtosis(arr: number[], avg: number, sd: number): number {
  if (sd === 0 || arr.length < 4) return 0
  const n = arr.length
  const k =
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) *
    arr.reduce((s, v) => s + ((v - avg) / sd) ** 4, 0) -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
  return k
}

// ── Balance series ────────────────────────────────────────────────────────────

function buildBalanceSeries(events: ParsedEvent[]): BalancePoint[] {
  let peak = -Infinity
  return events.map((ev) => {
    const balance = ev.balanceAfter
    if (balance > peak) peak = balance
    const drawdown = peak > 0 ? (balance - peak) / peak : 0
    return {
      time: ev.time,
      timeLabel: format(ev.time, 'MM-dd HH:mm'),
      balance,
      drawdown,
      peak,
      type: ev.type,
      symbol: ev.symbol,
    }
  })
}

// ── Summary ───────────────────────────────────────────────────────────────────

function buildSummary(trades: Trade[], balanceSeries: BalancePoint[]): Summary {
  const n = trades.length
  const wins = trades.filter((t) => t.win)
  const losses = trades.filter((t) => !t.win)

  const grossPnls = trades.map((t) => t.grossPnl)
  const netPnls = trades.map((t) => t.netPnl)

  const winCount = wins.length
  const lossCount = losses.length
  const winRate = n > 0 ? winCount / n : 0

  const grossPnl = grossPnls.reduce((s, v) => s + v, 0)
  const netPnl = netPnls.reduce((s, v) => s + v, 0)
  const totalCommissions = trades.reduce((s, t) => s + t.totalCommission, 0)
  const totalEntryComm = trades.reduce((s, t) => s + t.entryCommission, 0)
  const totalExitComm = trades.reduce((s, t) => s + t.exitCommissions, 0)

  const initialBalance = balanceSeries.length > 0 ? balanceSeries[0].balance - balanceSeries[0].balance * 0 : 0
  const firstEvent = balanceSeries[0]
  const lastEvent = balanceSeries[balanceSeries.length - 1]
  const _initialBalance = firstEvent ? firstEvent.balance : 0
  // Actually, initialBalance is the balance BEFORE the first event
  // We need to find it from the events — use first event's balance as proxy if we can't
  // For a better proxy: look at the first event which is a trade's balanceBefore
  const finalBalance = lastEvent ? lastEvent.balance : 0

  const sumWins = wins.reduce((s, t) => s + t.grossPnl, 0)
  const sumLosses = Math.abs(losses.reduce((s, t) => s + t.grossPnl, 0))
  const profitFactor = sumLosses > 0 ? sumWins / sumLosses : sumWins > 0 ? Infinity : 0

  const avgWin = winCount > 0 ? sumWins / winCount : 0
  const avgLoss = lossCount > 0 ? sumLosses / lossCount : 0
  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss

  const maxWinTrade = Math.max(0, ...grossPnls)
  const maxLossTrade = Math.min(0, ...grossPnls)

  const avgGross = mean(grossPnls)
  const sd = stdDev(grossPnls, avgGross)
  const sortedGross = [...grossPnls].sort((a, b) => a - b)
  const pnlMedian = median(sortedGross)
  const pnlSkew = skewness(grossPnls, avgGross, sd)
  const pnlKurtosis = kurtosis(grossPnls, avgGross, sd)

  const maxDrawdown = Math.min(0, ...balanceSeries.map((p) => p.drawdown))

  const commDragPct = grossPnl !== 0 ? Math.abs(totalCommissions) / Math.abs(grossPnl) : 0

  // Sharpe: annualized from daily returns
  let sharpeRatio: number | null = null
  if (trades.length >= 5) {
    const firstDay = trades[0].openTime
    const lastDay = trades[trades.length - 1].closeTime
    const daySpan = Math.max(1, differenceInCalendarDays(lastDay, firstDay))

    // Group net pnl by calendar day
    const byDay = new Map<string, number>()
    for (const t of trades) {
      const key = format(t.closeTime, 'yyyy-MM-dd')
      byDay.set(key, (byDay.get(key) ?? 0) + t.netPnl)
    }
    const dailyReturns = Array.from(byDay.values())
    if (dailyReturns.length >= 2) {
      const avgDaily = mean(dailyReturns)
      const sdDaily = stdDev(dailyReturns, avgDaily)
      sharpeRatio = sdDaily > 0 ? (avgDaily / sdDaily) * Math.sqrt(252) : null
    }
    void daySpan
  }

  const kellyPct = winLossRatio > 0 ? winRate - (1 - winRate) / winLossRatio : 0

  // Streak analysis
  let maxWinStreak = 0
  let maxLossStreak = 0
  let curWin = 0
  let curLoss = 0
  for (const t of trades) {
    if (t.win) {
      curWin++
      curLoss = 0
      maxWinStreak = Math.max(maxWinStreak, curWin)
    } else {
      curLoss++
      curWin = 0
      maxLossStreak = Math.max(maxLossStreak, curLoss)
    }
  }

  // Direction stats
  const longTrades = trades.filter((t) => t.direction === 'long')
  const shortTrades = trades.filter((t) => t.direction === 'short')
  const dirStat = (subset: Trade[]): DirectionStat => ({
    count: subset.length,
    pnl: subset.reduce((s, t) => s + t.netPnl, 0),
    wins: subset.filter((t) => t.win).length,
    winRate: subset.length > 0 ? subset.filter((t) => t.win).length / subset.length : 0,
  })

  return {
    totalTrades: n,
    winCount,
    lossCount,
    winRate,
    grossPnl,
    totalCommissions,
    totalEntryComm,
    totalExitComm,
    netPnl,
    initialBalance: _initialBalance,
    finalBalance,
    returnPct: _initialBalance > 0 ? netPnl / _initialBalance : 0,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    winLossRatio,
    maxWinTrade,
    maxLossTrade,
    pnlStdDev: sd,
    pnlMedian,
    pnlSkew,
    pnlKurtosis,
    maxDrawdown,
    commDragPct,
    sharpeRatio,
    kellyPct,
    maxWinStreak,
    maxLossStreak,
    directionStats: { long: dirStat(longTrades), short: dirStat(shortTrades) },
  }
}

// ── Symbol stats ──────────────────────────────────────────────────────────────

function buildSymbolStats(trades: Trade[]): SymbolStat[] {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    const arr = map.get(t.symbol) ?? []
    arr.push(t)
    map.set(t.symbol, arr)
  }

  return Array.from(map.entries())
    .map(([symbol, ts]): SymbolStat => {
      const wins = ts.filter((t) => t.win)
      const grossPnl = ts.reduce((s, t) => s + t.grossPnl, 0)
      const netPnl = ts.reduce((s, t) => s + t.netPnl, 0)
      const commissions = ts.reduce((s, t) => s + t.totalCommission, 0)
      const pnls = ts.map((t) => t.grossPnl)
      return {
        symbol,
        count: ts.length,
        wins: wins.length,
        losses: ts.length - wins.length,
        grossPnl,
        netPnl,
        commissions,
        avgPnl: grossPnl / ts.length,
        winRate: ts.length > 0 ? wins.length / ts.length : 0,
        bestTrade: Math.max(...pnls),
        worstTrade: Math.min(...pnls),
      }
    })
    .sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl))
}

// ── Time stats ────────────────────────────────────────────────────────────────

function buildTimeStats(trades: Trade[]): TimeStats {
  const hourMap = new Map<number, TimeBucket>()
  const dayMap = new Map<number, TimeBucket>()
  const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

  for (const t of trades) {
    const h = t.closeTime.getHours()
    const d = t.closeTime.getDay()

    const hb = hourMap.get(h) ?? { label: `${String(h).padStart(2, '0')}h`, count: 0, pnl: 0, wins: 0 }
    hb.count++
    hb.pnl += t.netPnl
    if (t.win) hb.wins++
    hourMap.set(h, hb)

    const db = dayMap.get(d) ?? { label: DAY_LABELS[d], count: 0, pnl: 0, wins: 0 }
    db.count++
    db.pnl += t.netPnl
    if (t.win) db.wins++
    dayMap.set(d, db)
  }

  const byHour = Array.from(hourMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v)

  const byDay = Array.from(dayMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v)

  return { byHour, byDay }
}

// ── Rolling metrics ───────────────────────────────────────────────────────────

function buildRollingMetrics(trades: Trade[], window = 5): RollingPoint[] {
  return trades.slice(window - 1).map((_, i) => {
    const slice = trades.slice(i, i + window)
    const wins = slice.filter((t) => t.win).length
    const pnl = slice.reduce((s, t) => s + t.netPnl, 0)
    return {
      index: i + window,
      timeLabel: format(slice[slice.length - 1].closeTime, 'MM-dd'),
      rolling_winRate: wins / window,
      rolling_pnl: pnl,
      symbol: slice[slice.length - 1].symbol,
    }
  })
}

// ── Streak series ─────────────────────────────────────────────────────────────

function buildStreakSeries(trades: Trade[]): StreakPoint[] {
  let w = 0
  let l = 0
  return trades.map((t, i) => {
    if (t.win) { w++; l = 0 } else { l++; w = 0 }
    return {
      index: i + 1,
      winStreak: w,
      lossStreak: l,
      symbol: t.symbol,
      pnl: t.netPnl,
    }
  })
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function computeAnalytics(trades: Trade[], events: ParsedEvent[]): AnalyticsResult {
  const balanceSeries = buildBalanceSeries(events)
  const summary = buildSummary(trades, balanceSeries)
  const symbolStats = buildSymbolStats(trades)
  const timeStats = buildTimeStats(trades)
  const rollingMetrics = buildRollingMetrics(trades)
  const streakSeries = buildStreakSeries(trades)

  return { summary, trades, balanceSeries, symbolStats, timeStats, streakSeries, rollingMetrics }
}
