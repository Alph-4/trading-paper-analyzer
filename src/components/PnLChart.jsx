import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';

const GRID = '#27272a';
const AXIS = '#71717a';
const GREEN = '#10b981';
const RED = '#ef4444';

function TooltipTrade({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-300 font-medium mb-1">Trade #{d.index + 1} — {d.symbol}</p>
      <p className="text-zinc-400">{d.direction} · {d.timeLabel}</p>
      <p className={d.grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
        Gross PnL: ${d.grossPnl.toFixed(2)}
      </p>
      <p className="text-zinc-500">Commission: ${d.commission.toFixed(2)}</p>
      <p className={d.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
        Net PnL: ${d.netPnl.toFixed(2)}
      </p>
      {d.units && <p className="text-zinc-500">{d.units.toLocaleString()} units @ {d.exitPrice}</p>}
    </div>
  );
}

function TooltipDist({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-300">Range: {label}</p>
      <p className="text-indigo-400">Count: {payload[0].value}</p>
    </div>
  );
}

function buildDistribution(trades) {
  if (trades.length === 0) return [];
  const vals = trades.map((t) => t.grossPnl);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const binCount = Math.min(10, trades.length);
  const step = (max - min) / binCount || 1;

  const bins = Array.from({ length: binCount }, (_, i) => ({
    label: `${(min + i * step).toFixed(0)}`,
    count: 0,
    positive: min + i * step >= 0,
  }));

  vals.forEach((v) => {
    const idx = Math.min(Math.floor((v - min) / step), binCount - 1);
    bins[idx].count++;
  });

  return bins;
}

export default function PnLChart({ trades }) {
  const chartData = trades.map((t) => ({
    ...t,
    timeLabel: t.time.toLocaleDateString('fr-FR'),
  }));

  const distData = buildDistribution(trades);

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* PnL per trade */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-zinc-300 text-sm font-medium mb-4">PnL par trade (brut)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="symbol"
              tick={{ fill: AXIS, fontSize: 9 }}
              tickLine={false}
              angle={-40}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fill: AXIS, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
            />
            <Tooltip content={<TooltipTrade />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <ReferenceLine y={0} stroke={AXIS} strokeDasharray="4 2" />
            <Bar dataKey="grossPnl" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.grossPnl >= 0 ? GREEN : RED} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Distribution histogram */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-zinc-300 text-sm font-medium mb-4">Distribution des PnL</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={distData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: AXIS, fontSize: 9 }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: AXIS, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<TooltipDist />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {distData.map((entry, i) => (
                <Cell key={i} fill={entry.positive ? GREEN : RED} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
