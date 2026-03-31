import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';

const GRID = '#27272a';
const AXIS = '#71717a';
const GREEN = '#10b981';
const RED = '#ef4444';

function PnLBar({ data, xKey, title }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <h3 className="text-zinc-300 text-sm font-medium mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
          <YAxis
            tick={{ fill: AXIS, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
                  <p className="text-zinc-300">{label}</p>
                  <p className={payload[0].value >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    PnL: ${payload[0].value.toFixed(2)}
                  </p>
                  <p className="text-zinc-500">{payload[0].payload.count} trades</p>
                </div>
              ) : null
            }
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <ReferenceLine y={0} stroke={AXIS} strokeDasharray="4 2" />
          <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.pnl >= 0 ? GREEN : RED} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function TimeAnalysis({ timeStats }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <PnLBar
        data={timeStats.byHour}
        xKey="label"
        title="PnL par heure de la journée"
      />
      <PnLBar
        data={timeStats.byDay}
        xKey="label"
        title="PnL par jour de la semaine"
      />

      {/* Best/worst hours table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 lg:col-span-2">
        <h3 className="text-zinc-300 text-sm font-medium mb-3">Résumé par heure</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[...timeStats.byHour]
            .sort((a, b) => b.pnl - a.pnl)
            .slice(0, 8)
            .map((h) => (
              <div
                key={h.hour}
                className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2"
              >
                <span className="text-zinc-300 font-mono text-sm">{h.label}</span>
                <span className={`font-mono text-xs ${h.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${h.pnl.toFixed(0)}
                </span>
                <span className="text-zinc-500 text-xs">{h.count}t</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
