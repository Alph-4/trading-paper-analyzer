import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

const CHART_COLORS = {
  balance: '#6366f1',
  drawdown: '#ef4444',
  grid: '#27272a',
  axis: '#71717a',
  tooltip_bg: '#18181b',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-400 mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.name === 'Drawdown' ? `${p.value.toFixed(2)}%` : `$${Number(p.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </p>
      ))}
    </div>
  );
}

export default function BalanceCurve({ balanceSeries }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Balance */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-zinc-300 text-sm font-medium mb-4">Equity Curve</h3>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={balanceSeries} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fill: CHART_COLORS.axis, fontSize: 10 }}
              interval="preserveStartEnd"
              tickLine={false}
            />
            <YAxis
              tick={{ fill: CHART_COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              dataKey="balance"
              name="Balance"
              stroke={CHART_COLORS.balance}
              dot={false}
              strokeWidth={2}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Drawdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-zinc-300 text-sm font-medium mb-4">Drawdown (%)</h3>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={balanceSeries} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fill: CHART_COLORS.axis, fontSize: 10 }}
              interval="preserveStartEnd"
              tickLine={false}
            />
            <YAxis
              tick={{ fill: CHART_COLORS.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke={CHART_COLORS.grid} />
            <Area
              dataKey="drawdown"
              name="Drawdown"
              stroke={CHART_COLORS.drawdown}
              fill={CHART_COLORS.drawdown}
              fillOpacity={0.2}
              strokeWidth={1.5}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
