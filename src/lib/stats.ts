import type { Trade } from './types'

// ── Sub-result types ──────────────────────────────────────────────────────────

export interface SymbolStats {
  totalTrades: number
  wins: number
  losses: number
  winRate: number        // 0–1
  netPnl: number
  totalCommissions: number
  avgNetPnl: number
  bestTrade: number      // max netPnl
  worstTrade: number     // min netPnl
}

export interface DirectionStats {
  totalTrades: number
  wins: number
  winRate: number        // 0–1
  netPnl: number
}

export interface SessionStats {
  totalTrades: number
  wins: number
  winRate: number        // 0–1
  netPnl: number
  avgNetPnl: number
}

export interface HourStats {
  totalTrades: number
  wins: number
  winRate: number        // 0–1
  netPnl: number
}

export interface DayStats {
  totalTrades: number
  wins: number
  winRate: number        // 0–1
  netPnl: number
}

export interface StatsResult {
  // ── General ─────────────────────────────────────────────────────────────────
  totalTrades: number
  totalWins: number
  totalLosses: number
  winRate: number        // 0–100 %
  lossRate: number       // 0–100 %
  totalGrossPnl: number
  totalCommissions: number
  totalNetPnl: number
  profitFactor: number   // sumGrossWins / |sumGrossLosses|
  expectancy: number     // average netPnl per trade
  largestWin: number     // max netPnl (positive)
  largestLoss: number    // min netPnl (negative)
  avgWin: number         // avg netPnl of winners (positive)
  avgLoss: number        // avg netPnl of losers (negative)
  avgRR: number          // avgWin / |avgLoss|

  // ── Streaks ─────────────────────────────────────────────────────────────────
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
  currentStreak: number  // >0 = win streak, <0 = loss streak

  // ── Duration ────────────────────────────────────────────────────────────────
  avgDurationMs: number
  minDurationMs: number
  maxDurationMs: number
  avgDurationWins: number
  avgDurationLosses: number

  // ── Drawdown (on cumulative netPnl equity curve) ─────────────────────────────
  maxDrawdown: number       // USD, positive
  maxDrawdownPct: number    // %, positive
  maxDrawdownStart: Date
  maxDrawdownEnd: Date
  currentDrawdown: number   // USD, positive

  // ── Breakdowns ───────────────────────────────────────────────────────────────
  bySymbol: Record<string, SymbolStats>
  byDirection: { long: DirectionStats; short: DirectionStats }
  bySession: { Asia: SessionStats; London: SessionStats; 'New York': SessionStats }
  byHour: Record<number, HourStats>   // key = hour 0–23 (local time)
  byDay: Record<number, DayStats>     // key = 0=Mon … 6=Sun
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length
}

function sessionOf(d: Date): 'Asia' | 'London' | 'New York' | null {
  const h = d.getUTCHours()
  if (h < 8) return 'Asia'
  if (h < 13) return 'London'
  if (h < 22) return 'New York'
  return null
}

// ── Main function ─────────────────────────────────────────────────────────────

export function computeStats(trades: Trade[]): StatsResult {
  const sorted = [...trades].sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime())
  const n = sorted.length

  // ── General ─────────────────────────────────────────────────────────────────

  const winners = sorted.filter((t) => t.win)
  const losers = sorted.filter((t) => !t.win)
  const totalWins = winners.length
  const totalLosses = losers.length
  const winRate = n > 0 ? (totalWins / n) * 100 : 0
  const lossRate = n > 0 ? (totalLosses / n) * 100 : 0

  const totalGrossPnl = sorted.reduce((s, t) => s + t.grossPnl, 0)
  const totalCommissions = sorted.reduce((s, t) => s + t.totalCommission, 0)
  const totalNetPnl = sorted.reduce((s, t) => s + t.netPnl, 0)

  const sumGrossWins = winners.reduce((s, t) => s + t.grossPnl, 0)
  const sumGrossLosses = Math.abs(losers.reduce((s, t) => s + t.grossPnl, 0))
  const profitFactor = sumGrossLosses > 0 ? sumGrossWins / sumGrossLosses
    : sumGrossWins > 0 ? Infinity : 0

  const largestWin = totalWins > 0 ? Math.max(...winners.map((t) => t.netPnl)) : 0
  const largestLoss = totalLosses > 0 ? Math.min(...losers.map((t) => t.netPnl)) : 0
  const avgWin = totalWins > 0 ? avg(winners.map((t) => t.netPnl)) : 0
  const avgLoss = totalLosses > 0 ? avg(losers.map((t) => t.netPnl)) : 0   // negative
  const avgRR = avgLoss < 0 ? avgWin / Math.abs(avgLoss) : 0
  const expectancy = n > 0 ? totalNetPnl / n : 0

  // ── Streaks ─────────────────────────────────────────────────────────────────

  let maxConsecutiveWins = 0
  let maxConsecutiveLosses = 0
  let curW = 0
  let curL = 0
  for (const t of sorted) {
    if (t.win) {
      curW++; curL = 0
      if (curW > maxConsecutiveWins) maxConsecutiveWins = curW
    } else {
      curL++; curW = 0
      if (curL > maxConsecutiveLosses) maxConsecutiveLosses = curL
    }
  }

  let currentStreak = 0
  if (n > 0) {
    const lastWin = sorted[n - 1].win
    for (let i = n - 1; i >= 0; i--) {
      if (sorted[i].win !== lastWin) break
      currentStreak += lastWin ? 1 : -1
    }
  }

  // ── Duration ─────────────────────────────────────────────────────────────────

  const durations = sorted.map((t) => t.closeTime.getTime() - t.openTime.getTime())
  const winDurations = winners.map((t) => t.closeTime.getTime() - t.openTime.getTime())
  const lossDurations = losers.map((t) => t.closeTime.getTime() - t.openTime.getTime())

  const avgDurationMs = avg(durations)
  const minDurationMs = durations.length > 0 ? Math.min(...durations) : 0
  const maxDurationMs = durations.length > 0 ? Math.max(...durations) : 0
  const avgDurationWins = avg(winDurations)
  const avgDurationLosses = avg(lossDurations)

  // ── Drawdown (cumulative netPnl equity curve) ─────────────────────────────────

  const fallback = sorted[0]?.closeTime ?? new Date(0)
  let equity = 0
  let peak = 0
  let peakDate = fallback
  let maxDrawdown = 0
  let maxDrawdownPct = 0
  let maxDrawdownStart = fallback
  let maxDrawdownEnd = fallback

  for (const t of sorted) {
    equity += t.netPnl
    if (equity > peak) {
      peak = equity
      peakDate = t.closeTime
    }
    const dd = peak - equity
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0
    if (dd > maxDrawdown) {
      maxDrawdown = dd
      maxDrawdownPct = ddPct
      maxDrawdownStart = peakDate
      maxDrawdownEnd = t.closeTime
    }
  }
  const currentDrawdown = Math.max(0, peak - equity)

  // ── By symbol ─────────────────────────────────────────────────────────────────

  const symMap = new Map<string, Trade[]>()
  for (const t of sorted) {
    const arr = symMap.get(t.symbol) ?? []
    arr.push(t)
    symMap.set(t.symbol, arr)
  }
  const bySymbol: Record<string, SymbolStats> = {}
  for (const [sym, ts] of symMap) {
    const sw = ts.filter((t) => t.win).length
    const np = ts.reduce((s, t) => s + t.netPnl, 0)
    bySymbol[sym] = {
      totalTrades: ts.length,
      wins: sw,
      losses: ts.length - sw,
      winRate: ts.length > 0 ? sw / ts.length : 0,
      netPnl: np,
      totalCommissions: ts.reduce((s, t) => s + t.totalCommission, 0),
      avgNetPnl: ts.length > 0 ? np / ts.length : 0,
      bestTrade: Math.max(...ts.map((t) => t.netPnl)),
      worstTrade: Math.min(...ts.map((t) => t.netPnl)),
    }
  }

  // ── By direction ──────────────────────────────────────────────────────────────

  const buildDir = (subset: Trade[]): DirectionStats => ({
    totalTrades: subset.length,
    wins: subset.filter((t) => t.win).length,
    winRate: subset.length > 0 ? subset.filter((t) => t.win).length / subset.length : 0,
    netPnl: subset.reduce((s, t) => s + t.netPnl, 0),
  })
  const byDirection = {
    long: buildDir(sorted.filter((t) => t.direction === 'long')),
    short: buildDir(sorted.filter((t) => t.direction === 'short')),
  }

  // ── By session (openTime UTC) ─────────────────────────────────────────────────

  const sessAcc = {
    Asia: { totalTrades: 0, wins: 0, netPnl: 0 },
    London: { totalTrades: 0, wins: 0, netPnl: 0 },
    'New York': { totalTrades: 0, wins: 0, netPnl: 0 },
  }
  for (const t of sorted) {
    const s = sessionOf(t.openTime)
    if (!s) continue
    sessAcc[s].totalTrades++
    if (t.win) sessAcc[s].wins++
    sessAcc[s].netPnl += t.netPnl
  }
  const bySession: StatsResult['bySession'] = {
    Asia: {
      ...sessAcc.Asia,
      winRate: sessAcc.Asia.totalTrades > 0 ? sessAcc.Asia.wins / sessAcc.Asia.totalTrades : 0,
      avgNetPnl: sessAcc.Asia.totalTrades > 0 ? sessAcc.Asia.netPnl / sessAcc.Asia.totalTrades : 0,
    },
    London: {
      ...sessAcc.London,
      winRate: sessAcc.London.totalTrades > 0 ? sessAcc.London.wins / sessAcc.London.totalTrades : 0,
      avgNetPnl: sessAcc.London.totalTrades > 0 ? sessAcc.London.netPnl / sessAcc.London.totalTrades : 0,
    },
    'New York': {
      ...sessAcc['New York'],
      winRate: sessAcc['New York'].totalTrades > 0 ? sessAcc['New York'].wins / sessAcc['New York'].totalTrades : 0,
      avgNetPnl: sessAcc['New York'].totalTrades > 0 ? sessAcc['New York'].netPnl / sessAcc['New York'].totalTrades : 0,
    },
  }

  // ── By hour (openTime local, 0–23) ───────────────────────────────────────────

  const hourAcc = new Map<number, { totalTrades: number; wins: number; netPnl: number }>()
  for (const t of sorted) {
    const h = t.openTime.getHours()
    const b = hourAcc.get(h) ?? { totalTrades: 0, wins: 0, netPnl: 0 }
    b.totalTrades++
    if (t.win) b.wins++
    b.netPnl += t.netPnl
    hourAcc.set(h, b)
  }
  const byHour: Record<number, HourStats> = {}
  for (const [h, b] of hourAcc) {
    byHour[h] = { ...b, winRate: b.totalTrades > 0 ? b.wins / b.totalTrades : 0 }
  }

  // ── By day of week (0=Mon…6=Sun, closeTime local) ────────────────────────────

  const dayAcc = new Map<number, { totalTrades: number; wins: number; netPnl: number }>()
  for (const t of sorted) {
    const iso = (t.closeTime.getDay() + 6) % 7  // JS Sun=0 → iso 6, Mon=1 → iso 0
    const b = dayAcc.get(iso) ?? { totalTrades: 0, wins: 0, netPnl: 0 }
    b.totalTrades++
    if (t.win) b.wins++
    b.netPnl += t.netPnl
    dayAcc.set(iso, b)
  }
  const byDay: Record<number, DayStats> = {}
  for (const [d, b] of dayAcc) {
    byDay[d] = { ...b, winRate: b.totalTrades > 0 ? b.wins / b.totalTrades : 0 }
  }

  // ── Result ────────────────────────────────────────────────────────────────────

  return {
    totalTrades: n,
    totalWins,
    totalLosses,
    winRate,
    lossRate,
    totalGrossPnl,
    totalCommissions,
    totalNetPnl,
    profitFactor,
    expectancy,
    largestWin,
    largestLoss,
    avgWin,
    avgLoss,
    avgRR,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    currentStreak,
    avgDurationMs,
    minDurationMs,
    maxDurationMs,
    avgDurationWins,
    avgDurationLosses,
    maxDrawdown,
    maxDrawdownPct,
    maxDrawdownStart,
    maxDrawdownEnd,
    currentDrawdown,
    bySymbol,
    byDirection,
    bySession,
    byHour,
    byDay,
  }
}
