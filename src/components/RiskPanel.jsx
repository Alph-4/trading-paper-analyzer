import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell
} from 'recharts';
import StatCard from './StatCard.jsx';

const GRID = '#27272a';
const AXIS = '#71717a';
const GREEN = '#10b981';
const RED = '#ef4444';

function fmt2(v) {
  return v != null ? v.toFixed(2) : '—';
}

function pct(v) {
  return v != null ? `${v.toFixed(1)}%` : '—';
}

export default function RiskPanel({ summary, rollingMetrics, streakSeries }) {
  const {
    profitFactor, expectancy, maxDrawdown, sharpeRatio, kellyPct,
    winLossRatio, pnlStdDev, pnlSkew, pnlKurtosis, pnlMedian,
    commDragPct, totalCommissions, totalEntryComm, totalExitComm,
    maxWinStreak, maxLossStreak, directionStats,
  } = summary;

  return (
    <div className="space-y-4">
      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          label="Profit Factor"
          value={profitFactor === Infinity ? '∞' : fmt2(profitFactor)}
          sub={profitFactor >= 2 ? 'Excellent' : profitFactor >= 1.5 ? 'Good' : profitFactor >= 1 ? 'Breakeven' : 'Unprofitable'}
          color={profitFactor >= 1.5 ? 'positive' : profitFactor >= 1 ? 'warning' : 'negative'}
        />
        <StatCard
          label="Expectancy / trade"
          value={`$${fmt2(expectancy)}`}
          sub="Expected PnL per trade"
          color={expectancy >= 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Max Drawdown"
          value={`${maxDrawdown.toFixed(2)}%`}
          sub="Peak-to-trough"
          color={Math.abs(maxDrawdown) < 5 ? 'positive' : Math.abs(maxDrawdown) < 15 ? 'warning' : 'negative'}
        />
        <StatCard
          label="Sharpe Ratio (ann.)"
          value={sharpeRatio != null ? fmt2(sharpeRatio) : 'N/A'}
          sub={sharpeRatio != null ? (sharpeRatio > 2 ? 'Excellent' : sharpeRatio > 1 ? 'Good' : 'Weak') : 'Insufficient data'}
          color={sharpeRatio != null ? (sharpeRatio > 1 ? 'positive' : 'warning') : 'muted'}
        />
        <StatCard
          label="Kelly Criterion"
          value={pct(kellyPct)}
          sub="Optimal bet fraction"
          color={kellyPct > 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Win/Loss Ratio"
          value={fmt2(winLossRatio)}
          sub="Avg win / |Avg loss|"
          color={winLossRatio >= 1 ? 'positive' : 'warning'}
        />
        <StatCard
          label="PnL Std Dev"
          value={`$${fmt2(pnlStdDev)}`}
          sub="Volatility per trade"
          color="default"
        />
        <StatCard
          label="PnL Median"
          value={`$${fmt2(pnlMedian)}`}
          sub="50th percentile"
          color={pnlMedian >= 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Skewness"
          value={fmt2(pnlSkew)}
          sub={pnlSkew > 0 ? 'More large winners' : 'More large losers'}
          color={pnlSkew > 0 ? 'positive' : 'warning'}
        />
        <StatCard
          label="Excess Kurtosis"
          value={fmt2(pnlKurtosis)}
          sub={pnlKurtosis > 0 ? 'Heavy tails (fat tails)' : 'Light tails'}
          color="default"
        />
        <StatCard
          label="Commission Drag"
          value={`${commDragPct.toFixed(1)}%`}
          sub={`$${Math.abs(totalCommissions).toFixed(2)} total`}
          color={commDragPct > 30 ? 'negative' : commDragPct > 15 ? 'warning' : 'positive'}
        />
        <StatCard
          label="Max Win Streak"
          value={maxWinStreak}
          sub={`Consecutive wins`}
          color="positive"
        />
        <StatCard
          label="Max Loss Streak"
          value={maxLossStreak}
          sub={`Consecutive losses`}
          color="negative"
        />
      </div>

      {/* Direction breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Long</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-zinc-400 text-xs">Trades</p>
              <p className="text-zinc-100 text-lg font-bold">{directionStats.long.count}</p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs">Win Rate</p>
              <p className={`text-lg font-bold ${directionStats.long.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                {directionStats.long.winRate.toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs">PnL</p>
              <p className={`text-lg font-bold ${directionStats.long.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${directionStats.long.pnl.toFixed(0)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Short</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-zinc-400 text-xs">Trades</p>
              <p className="text-zinc-100 text-lg font-bold">{directionStats.short.count}</p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs">Win Rate</p>
              <p className={`text-lg font-bold ${directionStats.short.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                {directionStats.short.winRate.toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs">PnL</p>
              <p className={`text-lg font-bold ${directionStats.short.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${directionStats.short.pnl.toFixed(0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Commission breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-zinc-300 text-sm font-medium mb-3">Commission breakdown</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
            <p className="text-zinc-400 text-xs mb-1">Entry fees</p>
            <p className="text-red-400 font-mono font-bold">${Math.abs(totalEntryComm).toFixed(2)}</p>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
            <p className="text-zinc-400 text-xs mb-1">Exit fees</p>
            <p className="text-red-400 font-mono font-bold">${Math.abs(totalExitComm).toFixed(2)}</p>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
            <p className="text-zinc-400 text-xs mb-1">Total commissions</p>
            <p className="text-red-400 font-mono font-bold">${Math.abs(totalCommissions).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Rolling win rate chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-zinc-300 text-sm font-medium mb-1">
          Rolling Win Rate (5 trades)
        </h3>
        <p className="text-zinc-500 text-xs mb-4">Trend of win rate over the last 5 trades at each point</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={rollingMetrics} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="index" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} label={{ value: 'Trade #', fill: AXIS, fontSize: 10, position: 'insideRight', offset: -5 }} />
            <YAxis
              tick={{ fill: AXIS, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              domain={[0, 100]}
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs">
                    <p className="text-zinc-300">Trade #{label}</p>
                    <p className="text-indigo-400">Win Rate: {payload[0].value.toFixed(0)}%</p>
                  </div>
                ) : null
              }
            />
            <ReferenceLine y={50} stroke="#52525b" strokeDasharray="4 2" />
            <Line
              dataKey="rolling_winRate"
              name="Win Rate"
              stroke="#6366f1"
              dot={{ fill: '#6366f1', r: 3 }}
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
