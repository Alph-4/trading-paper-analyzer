import { useMemo } from 'react'
import { useTradeStore } from '@/store/useTradeStore'
import { computeStats } from '@/lib/stats'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(v: number, d = 2) {
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtUsd(v: number) {
  return `${v >= 0 ? '+' : '-'}$${fmt(Math.abs(v))}`
}

function pnlClass(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-zinc-400'
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  valueClass?: string
  /** 0–100: renders a thin progress bar below the value */
  progress?: number
}

function KpiCard({ label, value, valueClass, progress }: KpiCardProps) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
        <p className={cn('text-lg font-mono font-semibold leading-tight', valueClass ?? 'text-zinc-100')}>
          {value}
        </p>
        {progress !== undefined && (
          <div className="mt-2 h-1 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const trades = useTradeStore((s) => s.trades)
  const stats = useMemo(() => computeStats(trades), [trades])

  if (trades.length === 0) {
    return <p className="text-zinc-500 text-sm">Aucune donnée chargée.</p>
  }

  const pfStr = stats.profitFactor === Infinity ? '∞' : fmt(stats.profitFactor)
  const rrStr = stats.avgRR === 0 ? '—' : stats.avgRR === Infinity ? '∞' : fmt(stats.avgRR)

  const streakValue = () => {
    if (stats.currentStreak === 0) return '—'
    return stats.currentStreak > 0
      ? `${stats.currentStreak}W`
      : `${Math.abs(stats.currentStreak)}L`
  }
  const streakClass = () => {
    if (stats.currentStreak > 0) return 'text-emerald-400'
    if (stats.currentStreak < 0) return 'text-red-400'
    return 'text-zinc-400'
  }

  return (
    <div className="space-y-6">

      {/* Row 1 — Résumé global */}
      <Section title="Résumé global">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Total Trades"
            value={String(stats.totalTrades)}
          />
          <KpiCard
            label="Net PnL"
            value={fmtUsd(stats.totalNetPnl)}
            valueClass={pnlClass(stats.totalNetPnl)}
          />
          <KpiCard
            label="Win Rate"
            value={`${fmt(stats.winRate, 1)}%`}
            progress={stats.winRate}
          />
          <KpiCard
            label="Profit Factor"
            value={pfStr}
            valueClass={stats.profitFactor >= 1.5 ? 'text-emerald-400' : stats.profitFactor >= 1 ? 'text-zinc-100' : 'text-red-400'}
          />
          <KpiCard
            label="Expectancy"
            value={fmtUsd(stats.expectancy)}
            valueClass={pnlClass(stats.expectancy)}
          />
          <KpiCard
            label="Commissions"
            value={`-$${fmt(Math.abs(stats.totalCommissions))}`}
            valueClass="text-red-400"
          />
        </div>
      </Section>

      {/* Row 2 — Gains & Pertes */}
      <Section title="Gains & Pertes">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Avg Win"
            value={`+$${fmt(stats.avgWin)}`}
            valueClass="text-emerald-400"
          />
          <KpiCard
            label="Avg Loss"
            value={`-$${fmt(Math.abs(stats.avgLoss))}`}
            valueClass="text-red-400"
          />
          <KpiCard
            label="Largest Win"
            value={`+$${fmt(stats.largestWin)}`}
            valueClass="text-emerald-400"
          />
          <KpiCard
            label="Largest Loss"
            value={`-$${fmt(Math.abs(stats.largestLoss))}`}
            valueClass="text-red-400"
          />
        </div>
      </Section>

      {/* Row 3 — Risque */}
      <Section title="Risque">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard
            label="Max Drawdown $"
            value={`-$${fmt(stats.maxDrawdown)}`}
            valueClass="text-red-400"
          />
          <KpiCard
            label="Max Drawdown %"
            value={`${fmt(stats.maxDrawdownPct, 2)}%`}
            valueClass="text-red-400"
          />
          <KpiCard
            label="Avg R:R"
            value={rrStr}
            valueClass={stats.avgRR >= 1 ? 'text-emerald-400' : stats.avgRR > 0 ? 'text-zinc-100' : 'text-zinc-500'}
          />
        </div>
      </Section>

      {/* Row 4 — Séries */}
      <Section title="Séries">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard
            label="Max Win Streak"
            value={`${stats.maxConsecutiveWins}W`}
            valueClass="text-emerald-400"
          />
          <KpiCard
            label="Max Loss Streak"
            value={`${stats.maxConsecutiveLosses}L`}
            valueClass="text-red-400"
          />
          <KpiCard
            label="Current Streak"
            value={streakValue()}
            valueClass={streakClass()}
          />
        </div>
      </Section>

    </div>
  )
}
