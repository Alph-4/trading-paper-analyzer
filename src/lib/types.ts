// Raw row as parsed directly from the CSV (French headers)
export interface RawRow {
  heure: string
  balanceAvant: number
  balanceApres: number
  pnl: number
  devise: string
  action: string
}

// ── Events ────────────────────────────────────────────────────────────────────

export type EventType = 'entryCommission' | 'trade' | 'exitCommission'

/** One row enriched with typed, extracted data */
export interface ParsedEvent {
  time: Date
  type: EventType
  symbol: string
  pnl: number
  balanceBefore: number
  balanceAfter: number
  direction?: 'long' | 'short'
  /** Entry price (enter events) or exit price (close events) */
  price?: number
  avgEntryPrice?: number
  units?: number
  action: string
}

// ── Trades ────────────────────────────────────────────────────────────────────

/** A single partial or full close of a position */
export interface TradeClose {
  time: Date
  exitPrice: number
  units: number
  grossPnl: number
  exitCommission: number
  netPnl: number
}

/**
 * One complete round-trip trade.
 * A trade may span multiple enters (adds) and multiple closes (partials).
 */
export interface Trade {
  id: string
  symbol: string
  direction: 'long' | 'short'
  openTime: Date
  closeTime: Date
  /** Weighted-average entry price across all enter events */
  entryPrice: number
  /** Weighted-average exit price across all close events */
  avgExitPrice: number
  totalUnits: number
  grossPnl: number
  entryCommission: number
  exitCommissions: number
  totalCommission: number
  netPnl: number
  win: boolean
  closes: TradeClose[]
}

// ── Analytics result types ─────────────────────────────────────────────────────

export interface BalancePoint {
  time: Date
  timeLabel: string
  balance: number
  drawdown: number
  peak: number
  type: EventType
  symbol: string
}

export interface SymbolStat {
  symbol: string
  count: number
  wins: number
  losses: number
  grossPnl: number
  netPnl: number
  commissions: number
  avgPnl: number
  winRate: number
  bestTrade: number
  worstTrade: number
}

export interface TimeBucket {
  label: string
  count: number
  pnl: number
  wins: number
}

export interface TimeStats {
  byHour: TimeBucket[]
  byDay: TimeBucket[]
}

export interface RollingPoint {
  index: number
  timeLabel: string
  rolling_winRate: number
  rolling_pnl: number
  symbol: string
}

export interface StreakPoint {
  index: number
  winStreak: number
  lossStreak: number
  symbol: string
  pnl: number
}

export interface DirectionStat {
  count: number
  pnl: number
  wins: number
  winRate: number
}

export interface Summary {
  totalTrades: number
  winCount: number
  lossCount: number
  winRate: number
  grossPnl: number
  totalCommissions: number
  totalEntryComm: number
  totalExitComm: number
  netPnl: number
  initialBalance: number
  finalBalance: number
  returnPct: number
  profitFactor: number
  expectancy: number
  avgWin: number
  avgLoss: number
  winLossRatio: number
  maxWinTrade: number
  maxLossTrade: number
  pnlStdDev: number
  pnlMedian: number
  pnlSkew: number
  pnlKurtosis: number
  maxDrawdown: number
  commDragPct: number
  sharpeRatio: number | null
  kellyPct: number
  maxWinStreak: number
  maxLossStreak: number
  directionStats: { long: DirectionStat; short: DirectionStat }
}

export interface AnalyticsResult {
  summary: Summary
  trades: Trade[]
  balanceSeries: BalancePoint[]
  symbolStats: SymbolStat[]
  timeStats: TimeStats
  streakSeries: StreakPoint[]
  rollingMetrics: RollingPoint[]
}
