import { format, getHours, getDay } from 'date-fns';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mean(arr) {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function median(arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function skewness(arr) {
  if (arr.length < 3) return 0;
  const m = mean(arr);
  const s = stddev(arr);
  if (s === 0) return 0;
  return arr.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0) / arr.length;
}

function excessKurtosis(arr) {
  if (arr.length < 4) return 0;
  const m = mean(arr);
  const s = stddev(arr);
  if (s === 0) return 0;
  return arr.reduce((acc, v) => acc + ((v - m) / s) ** 4, 0) / arr.length - 3;
}

// ─── Trade Enrichment ────────────────────────────────────────────────────────

/**
 * Match each "trade" row with its "exitCommission" row.
 * They share the same timestamp and symbol.
 */
function buildEnrichedTrades(sortedRows) {
  const trades = [];
  const usedCommIndices = new Set();

  sortedRows.forEach((row, i) => {
    if (row.type !== 'trade') return;

    // Find matching exit commission (same symbol, close within 2 seconds)
    const commIdx = sortedRows.findIndex(
      (r, j) =>
        !usedCommIndices.has(j) &&
        r.type === 'exitCommission' &&
        r.symbol === row.symbol &&
        Math.abs(r.time - row.time) <= 2000
    );

    const commission = commIdx >= 0 ? sortedRows[commIdx].pnl : 0;
    if (commIdx >= 0) usedCommIndices.add(commIdx);

    trades.push({
      index: trades.length,
      time: row.time,
      symbol: row.symbol,
      direction: row.direction ?? 'unknown',
      exitPrice: row.exitPrice,
      avgEntryPrice: row.avgEntryPrice,
      units: row.units,
      grossPnl: row.pnl,
      commission,
      netPnl: row.pnl + commission,
      win: row.pnl > 0,
    });
  });

  return trades;
}

// ─── Balance & Drawdown Series ────────────────────────────────────────────────

function buildBalanceSeries(sortedRows) {
  const series = [];
  let peak = -Infinity;

  sortedRows.forEach((row) => {
    const bal = row.balanceAfter;
    if (bal > peak) peak = bal;
    const dd = peak > 0 ? ((peak - bal) / peak) * 100 : 0;

    series.push({
      time: row.time,
      timeLabel: format(row.time, 'dd/MM HH:mm'),
      balance: bal,
      drawdown: -dd,
      peak,
      type: row.type,
      symbol: row.symbol,
    });
  });

  return series;
}

// ─── Symbol Stats ────────────────────────────────────────────────────────────

function buildSymbolStats(trades) {
  const map = {};

  trades.forEach((t) => {
    if (!map[t.symbol]) {
      map[t.symbol] = {
        symbol: t.symbol,
        trades: [],
        wins: 0,
        losses: 0,
        grossPnl: 0,
        netPnl: 0,
        commissions: 0,
        pnlValues: [],
      };
    }
    const s = map[t.symbol];
    s.trades.push(t);
    s.grossPnl += t.grossPnl;
    s.netPnl += t.netPnl;
    s.commissions += t.commission;
    s.pnlValues.push(t.grossPnl);
    if (t.grossPnl > 0) s.wins++;
    else s.losses++;
  });

  return Object.values(map).map((s) => ({
    ...s,
    count: s.trades.length,
    winRate: s.trades.length > 0 ? (s.wins / s.trades.length) * 100 : 0,
    avgPnl: mean(s.pnlValues),
    bestTrade: Math.max(...s.pnlValues),
    worstTrade: Math.min(...s.pnlValues),
  }));
}

// ─── Time Analysis ────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildTimeStats(trades) {
  const hourMap = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${h.toString().padStart(2, '0')}h`,
    count: 0,
    pnl: 0,
    wins: 0,
  }));

  const dayMap = Array.from({ length: 7 }, (_, d) => ({
    day: d,
    label: DAY_NAMES[d],
    count: 0,
    pnl: 0,
    wins: 0,
  }));

  trades.forEach((t) => {
    const h = getHours(t.time);
    const d = getDay(t.time);
    hourMap[h].count++;
    hourMap[h].pnl += t.grossPnl;
    if (t.win) hourMap[h].wins++;
    dayMap[d].count++;
    dayMap[d].pnl += t.grossPnl;
    if (t.win) dayMap[d].wins++;
  });

  return {
    byHour: hourMap.filter((h) => h.count > 0),
    byDay: dayMap.filter((d) => d.count > 0),
  };
}

// ─── Streak Analysis ────────────────────────────────────────────────────────

function buildStreaks(trades) {
  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  const streakSeries = trades.map((t) => {
    if (t.win) {
      curWin++;
      curLoss = 0;
      if (curWin > maxWin) maxWin = curWin;
    } else {
      curLoss++;
      curWin = 0;
      if (curLoss > maxLoss) maxLoss = curLoss;
    }
    return {
      index: t.index + 1,
      winStreak: curWin,
      lossStreak: -curLoss,
      symbol: t.symbol,
      pnl: t.grossPnl,
    };
  });

  return { maxWinStreak: maxWin, maxLossStreak: maxLoss, streakSeries };
}

// ─── Rolling Metrics ────────────────────────────────────────────────────────

function buildRollingMetrics(trades, window = 5) {
  return trades.map((t, i) => {
    const slice = trades.slice(Math.max(0, i - window + 1), i + 1);
    const wins = slice.filter((s) => s.win).length;
    const pnlSum = slice.reduce((s, x) => s + x.grossPnl, 0);
    return {
      index: i + 1,
      timeLabel: format(t.time, 'dd/MM'),
      rolling_winRate: (wins / slice.length) * 100,
      rolling_pnl: pnlSum,
      symbol: t.symbol,
    };
  });
}

// ─── Daily Equity for Sharpe ────────────────────────────────────────────────

function computeDailyReturns(sortedRows) {
  const dayMap = {};
  sortedRows.forEach((r) => {
    const key = format(r.time, 'yyyy-MM-dd');
    dayMap[key] = r.balanceAfter;
  });

  const days = Object.keys(dayMap).sort();
  const returns = [];
  for (let i = 1; i < days.length; i++) {
    const prev = dayMap[days[i - 1]];
    const curr = dayMap[days[i]];
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  return returns;
}

// ─── Main Analyzer ───────────────────────────────────────────────────────────

/**
 * Master function — takes parsed rows, returns full analytics object.
 */
export function analyze(sortedRows) {
  const trades = buildEnrichedTrades(sortedRows);
  const balanceSeries = buildBalanceSeries(sortedRows);

  // ── Core sums ──
  const winners = trades.filter((t) => t.grossPnl > 0);
  const losers = trades.filter((t) => t.grossPnl <= 0);
  const totalTrades = trades.length;
  const winCount = winners.length;
  const lossCount = losers.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  const grossPnl = trades.reduce((s, t) => s + t.grossPnl, 0);
  const totalExitComm = trades.reduce((s, t) => s + t.commission, 0);
  const totalEntryComm = sortedRows
    .filter((r) => r.type === 'entryCommission')
    .reduce((s, r) => s + r.pnl, 0);
  const totalCommissions = totalExitComm + totalEntryComm;
  const netPnl = grossPnl + totalCommissions;

  const initialBalance = sortedRows[0]?.balanceBefore ?? 0;
  const finalBalance = sortedRows[sortedRows.length - 1]?.balanceAfter ?? 0;
  const returnPct = initialBalance > 0 ? ((finalBalance - initialBalance) / initialBalance) * 100 : 0;

  const pnlValues = trades.map((t) => t.grossPnl);
  const winValues = winners.map((t) => t.grossPnl);
  const lossValues = losers.map((t) => t.grossPnl);

  const avgWin = mean(winValues);
  const avgLoss = mean(lossValues);
  const sumWins = winValues.reduce((s, v) => s + v, 0);
  const sumLosses = Math.abs(lossValues.reduce((s, v) => s + v, 0));
  const profitFactor = sumLosses > 0 ? sumWins / sumLosses : sumWins > 0 ? Infinity : 0;
  const expectancy = (winRate / 100) * avgWin + (1 - winRate / 100) * avgLoss;
  const winLossRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

  const kellyPct = winRate > 0 && winLossRatio > 0
    ? (winRate / 100 - (1 - winRate / 100) / winLossRatio) * 100
    : 0;

  const maxWinTrade = winValues.length > 0 ? Math.max(...winValues) : 0;
  const maxLossTrade = lossValues.length > 0 ? Math.min(...lossValues) : 0;
  const pnlStdDev = stddev(pnlValues);
  const pnlMedian = median(pnlValues);
  const pnlSkew = skewness(pnlValues);
  const pnlKurtosis = excessKurtosis(pnlValues);

  // ── Drawdown ──
  const drawdownValues = balanceSeries.map((b) => b.drawdown);
  const maxDrawdown = drawdownValues.length > 0 ? Math.min(...drawdownValues) : 0;

  // ── Commission drag ──
  const commDragPct = grossPnl !== 0 ? (Math.abs(totalCommissions) / Math.abs(grossPnl)) * 100 : 0;

  // ── Daily Sharpe ──
  const dailyReturns = computeDailyReturns(sortedRows);
  const sharpeRatio =
    dailyReturns.length >= 2
      ? (mean(dailyReturns) / stddev(dailyReturns)) * Math.sqrt(252)
      : null;

  // ── Direction breakdown ──
  const longTrades = trades.filter((t) => t.direction === 'long');
  const shortTrades = trades.filter((t) => t.direction === 'short');
  const directionStats = {
    long: {
      count: longTrades.length,
      pnl: longTrades.reduce((s, t) => s + t.grossPnl, 0),
      wins: longTrades.filter((t) => t.win).length,
      winRate: longTrades.length > 0 ? (longTrades.filter((t) => t.win).length / longTrades.length) * 100 : 0,
    },
    short: {
      count: shortTrades.length,
      pnl: shortTrades.reduce((s, t) => s + t.grossPnl, 0),
      wins: shortTrades.filter((t) => t.win).length,
      winRate: shortTrades.length > 0 ? (shortTrades.filter((t) => t.win).length / shortTrades.length) * 100 : 0,
    },
  };

  const symbolStats = buildSymbolStats(trades);
  const timeStats = buildTimeStats(trades);
  const { maxWinStreak, maxLossStreak, streakSeries } = buildStreaks(trades);
  const rollingMetrics = buildRollingMetrics(trades, 5);

  // ── Summary for overview cards ──
  const summary = {
    totalTrades,
    winCount,
    lossCount,
    winRate,
    grossPnl,
    totalCommissions,
    totalEntryComm,
    totalExitComm,
    netPnl,
    initialBalance,
    finalBalance,
    returnPct,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    winLossRatio,
    maxWinTrade,
    maxLossTrade,
    pnlStdDev,
    pnlMedian,
    pnlSkew,
    pnlKurtosis,
    maxDrawdown,
    commDragPct,
    sharpeRatio,
    kellyPct,
    maxWinStreak,
    maxLossStreak,
    directionStats,
  };

  return {
    summary,
    trades,
    balanceSeries,
    symbolStats,
    timeStats,
    streakSeries,
    rollingMetrics,
  };
}
