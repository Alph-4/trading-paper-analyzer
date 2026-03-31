import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';

const GRID = '#27272a';
const AXIS = '#71717a';
const GREEN = '#10b981';
const RED = '#ef4444';

function fmt(v) {
  return `$${v.toFixed(2)}`;
}

function TooltipSymbol({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-200 font-medium mb-1">{d.symbol}</p>
      <p className={d.grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>PnL brut: {fmt(d.grossPnl)}</p>
      <p className={d.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>PnL net: {fmt(d.netPnl)}</p>
      <p className="text-zinc-400">{d.count} trades · {d.winRate.toFixed(0)}% win rate</p>
    </div>
  );
}

export default function SymbolStats({ symbolStats }) {
  const sorted = [...symbolStats].sort((a, b) => b.grossPnl - a.grossPnl);

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Bar chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-zinc-300 text-sm font-medium mb-4">PnL brut par symbole</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 4 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: AXIS, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
            />
            <YAxis
              dataKey="symbol"
              type="category"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <Tooltip content={<TooltipSymbol />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <ReferenceLine x={0} stroke={AXIS} strokeDasharray="4 2" />
            <Bar dataKey="grossPnl" radius={[0, 2, 2, 0]}>
              {sorted.map((entry, i) => (
                <Cell key={i} fill={entry.grossPnl >= 0 ? GREEN : RED} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              {['Symbole', 'Trades', 'Wins', 'Win%', 'Gross PnL', 'Commissions', 'Net PnL', 'Avg Trade', 'Best', 'Worst'].map((h) => (
                <th key={h} className="px-3 py-3 text-zinc-500 font-medium uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.symbol} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${i % 2 === 0 ? '' : 'bg-zinc-950/30'}`}>
                <td className="px-3 py-2.5 text-zinc-200 font-mono font-semibold">{s.symbol}</td>
                <td className="px-3 py-2.5 text-zinc-400">{s.count}</td>
                <td className="px-3 py-2.5 text-zinc-400">{s.wins}/{s.losses}</td>
                <td className="px-3 py-2.5">
                  <span className={s.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}>
                    {s.winRate.toFixed(0)}%
                  </span>
                </td>
                <td className={`px-3 py-2.5 font-mono ${s.grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(s.grossPnl)}
                </td>
                <td className="px-3 py-2.5 text-red-400/80 font-mono">{fmt(s.commissions)}</td>
                <td className={`px-3 py-2.5 font-mono ${s.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(s.netPnl)}
                </td>
                <td className={`px-3 py-2.5 font-mono ${s.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(s.avgPnl)}
                </td>
                <td className="px-3 py-2.5 text-emerald-400 font-mono">{fmt(s.bestTrade)}</td>
                <td className="px-3 py-2.5 text-red-400 font-mono">{fmt(s.worstTrade)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
