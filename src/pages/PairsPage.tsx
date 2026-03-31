import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'
import { useAnalytics } from '@/hooks/useAnalytics'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

function fmt(v: number, d = 2) {
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function PairsPage() {
  const analytics = useAnalytics()
  if (!analytics) return <p className="text-zinc-500 text-sm">Aucune donnée chargée.</p>

  const { symbolStats } = analytics

  return (
    <div className="space-y-5">
      {/* Net PnL bar chart per symbol */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Net PnL par paire</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={symbolStats} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="symbol" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} />
              <YAxis
                tickFormatter={(v) => `$${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(0)}`}
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={55}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
                formatter={(v) => [`$${fmt(v as number)}`, 'Net PnL']}
              />
              <Bar dataKey="netPnl" radius={[3, 3, 0, 0]}>
                {symbolStats.map((entry) => (
                  <Cell key={entry.symbol} fill={entry.netPnl >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Win rate bar chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Win Rate par paire</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={symbolStats} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="symbol" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                domain={[0, 1]}
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
                formatter={(v) => [`${((v as number) * 100).toFixed(1)}%`, 'Win Rate']}
              />
              <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
                {symbolStats.map((entry) => (
                  <Cell key={entry.symbol} fill={entry.winRate >= 0.5 ? '#6366f1' : '#f59e0b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800">
                <tr>
                  {['Paire', 'Trades', 'W / L', 'Win Rate', 'Gross PnL', 'Commissions', 'Net PnL', 'Avg PnL', 'Best', 'Worst'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-zinc-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbolStats.map((s) => (
                  <tr key={s.symbol} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-3 py-2 font-mono text-zinc-200 font-medium">{s.symbol}</td>
                    <td className="px-3 py-2 text-zinc-400 font-mono">{s.count}</td>
                    <td className="px-3 py-2 font-mono">
                      <span className="text-emerald-400">{s.wins}</span>
                      <span className="text-zinc-600"> / </span>
                      <span className="text-red-400">{s.losses}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn('text-xs font-mono', s.winRate >= 0.5 ? 'border-emerald-800 text-emerald-400' : 'border-amber-900 text-amber-400')}
                      >
                        {(s.winRate * 100).toFixed(1)}%
                      </Badge>
                    </td>
                    <td className={cn('px-3 py-2 font-mono', s.grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {s.grossPnl >= 0 ? '+' : ''}${fmt(s.grossPnl)}
                    </td>
                    <td className="px-3 py-2 font-mono text-red-400/70 text-xs">{fmt(s.commissions)}</td>
                    <td className={cn('px-3 py-2 font-mono font-semibold', s.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {s.netPnl >= 0 ? '+' : ''}${fmt(s.netPnl)}
                    </td>
                    <td className={cn('px-3 py-2 font-mono', s.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {s.avgPnl >= 0 ? '+' : ''}${fmt(s.avgPnl)}
                    </td>
                    <td className="px-3 py-2 font-mono text-emerald-400">+${fmt(s.bestTrade)}</td>
                    <td className="px-3 py-2 font-mono text-red-400">${fmt(s.worstTrade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
