import { useState } from 'react';
import { BarChart2, Clock, Activity, Shield, List, RefreshCcw } from 'lucide-react';
import StatCard from './StatCard.jsx';
import BalanceCurve from './BalanceCurve.jsx';
import PnLChart from './PnLChart.jsx';
import SymbolStats from './SymbolStats.jsx';
import TimeAnalysis from './TimeAnalysis.jsx';
import RiskPanel from './RiskPanel.jsx';
import TradeTable from './TradeTable.jsx';

const TABS = [
  { id: 'overview', label: 'Vue générale', icon: BarChart2 },
  { id: 'trades', label: 'Trades', icon: List },
  { id: 'symbols', label: 'Symboles', icon: Activity },
  { id: 'time', label: 'Temps', icon: Clock },
  { id: 'risk', label: 'Risques', icon: Shield },
];

function fmt$(v) {
  return `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Dashboard({ data, onReset }) {
  const [tab, setTab] = useState('overview');
  const { summary, trades, balanceSeries, symbolStats, timeStats, rollingMetrics, streakSeries } = data;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-200 font-semibold text-sm">Trading Analyzer</span>
            <span className="text-zinc-600 text-xs hidden sm:block">
              {summary.totalTrades} trades · {new Date(balanceSeries[0]?.time).toLocaleDateString('fr-FR')} → {new Date(balanceSeries[balanceSeries.length - 1]?.time).toLocaleDateString('fr-FR')}
            </span>
          </div>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Nouveau fichier
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors
                ${tab === id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* Top metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                label="Balance initiale"
                value={fmt$(summary.initialBalance)}
                color="muted"
              />
              <StatCard
                label="Balance finale"
                value={fmt$(summary.finalBalance)}
                color="default"
              />
              <StatCard
                label="PnL net"
                value={`${summary.netPnl >= 0 ? '+' : ''}${fmt$(summary.netPnl)}`}
                sub={`${summary.returnPct >= 0 ? '+' : ''}${summary.returnPct.toFixed(2)}% return`}
                color={summary.netPnl >= 0 ? 'positive' : 'negative'}
                size="large"
              />
              <StatCard
                label="Win Rate"
                value={`${summary.winRate.toFixed(1)}%`}
                sub={`${summary.winCount}W / ${summary.lossCount}L`}
                color={summary.winRate >= 55 ? 'positive' : summary.winRate >= 45 ? 'warning' : 'negative'}
              />
              <StatCard
                label="Profit Factor"
                value={summary.profitFactor === Infinity ? '∞' : summary.profitFactor.toFixed(2)}
                color={summary.profitFactor >= 1.5 ? 'positive' : summary.profitFactor >= 1 ? 'warning' : 'negative'}
              />
              <StatCard
                label="Max Drawdown"
                value={`${summary.maxDrawdown.toFixed(2)}%`}
                color={Math.abs(summary.maxDrawdown) < 5 ? 'positive' : Math.abs(summary.maxDrawdown) < 15 ? 'warning' : 'negative'}
              />
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="PnL brut" value={`${summary.grossPnl >= 0 ? '+' : ''}${fmt$(summary.grossPnl)}`} color={summary.grossPnl >= 0 ? 'positive' : 'negative'} />
              <StatCard label="Commissions" value={`-${fmt$(Math.abs(summary.totalCommissions))}`} sub={`${summary.commDragPct.toFixed(1)}% drag`} color="negative" />
              <StatCard label="Expectancy" value={`$${summary.expectancy.toFixed(2)}`} sub="Avg expected PnL" color={summary.expectancy >= 0 ? 'positive' : 'negative'} />
              <StatCard label="Trades" value={summary.totalTrades} sub={`${summary.winCount} winners · ${summary.lossCount} losers`} color="accent" />
            </div>

            {/* Charts */}
            <BalanceCurve balanceSeries={balanceSeries} />
          </div>
        )}

        {/* ── Trades ── */}
        {tab === 'trades' && (
          <div className="space-y-4">
            <PnLChart trades={trades} />
            <TradeTable trades={trades} />
          </div>
        )}

        {/* ── Symbols ── */}
        {tab === 'symbols' && (
          <SymbolStats symbolStats={symbolStats} />
        )}

        {/* ── Time ── */}
        {tab === 'time' && (
          <TimeAnalysis timeStats={timeStats} />
        )}

        {/* ── Risk ── */}
        {tab === 'risk' && (
          <RiskPanel
            summary={summary}
            rollingMetrics={rollingMetrics}
            streakSeries={streakSeries}
          />
        )}
      </main>
    </div>
  );
}
