import { useState } from 'react';
import { format } from 'date-fns';

function Badge({ children, positive }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${positive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
      }`}>
      {children}
    </span>
  );
}

const COLS = [
  { key: 'index', label: '#', className: 'text-zinc-500 w-10' },
  { key: 'time', label: 'Heure', className: 'text-zinc-300' },
  { key: 'symbol', label: 'Symbole', className: 'text-zinc-200 font-mono' },
  { key: 'direction', label: 'Dir.', className: '' },
  { key: 'units', label: 'Taille', className: 'text-zinc-400 font-mono text-right' },
  { key: 'avgEntryPrice', label: 'Entrée', className: 'text-zinc-400 font-mono text-right' },
  { key: 'exitPrice', label: 'Sortie', className: 'text-zinc-400 font-mono text-right' },
  { key: 'grossPnl', label: 'PnL brut', className: 'font-mono text-right' },
  { key: 'commission', label: 'Comm.', className: 'text-red-400/80 font-mono text-right' },
  { key: 'netPnl', label: 'PnL net', className: 'font-mono text-right font-bold' },
];

export default function TradeTable({ trades }) {
  const [sortKey, setSortKey] = useState('index');
  const [sortDir, setSortDir] = useState('asc');

  const sorted = [...trades].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va;
    return sortDir === 'asc'
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const fmtPnl = (v) => {
    if (v == null) return '—';
    return `${v >= 0 ? '+' : ''}$${v.toFixed(2)}`;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
      <table className="w-full text-xs min-w-[760px]">
        <thead>
          <tr className="border-b border-zinc-800">
            {COLS.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="px-3 py-3 text-left text-zinc-500 font-medium uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors select-none"
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 text-indigo-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => (
            <tr
              key={t.index}
              className={`border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors ${i % 2 === 0 ? '' : 'bg-zinc-950/20'}`}
            >
              <td className="px-3 py-2.5 text-zinc-600">{t.index + 1}</td>
              <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">
                {format(t.time, 'dd/MM HH:mm')}
              </td>
              <td className="px-3 py-2.5 text-zinc-200 font-mono">{t.symbol}</td>
              <td className="px-3 py-2.5">
                <Badge positive={t.direction === 'long'}>{t.direction}</Badge>
              </td>
              <td className="px-3 py-2.5 text-zinc-400 font-mono text-right">
                {t.units != null ? t.units.toLocaleString() : '—'}
              </td>
              <td className="px-3 py-2.5 text-zinc-400 font-mono text-right">
                {t.avgEntryPrice ?? '—'}
              </td>
              <td className="px-3 py-2.5 text-zinc-400 font-mono text-right">
                {t.exitPrice ?? '—'}
              </td>
              <td className={`px-3 py-2.5 font-mono text-right ${t.grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPnl(t.grossPnl)}
              </td>
              <td className="px-3 py-2.5 text-red-400/70 font-mono text-right">
                ${t.commission.toFixed(2)}
              </td>
              <td className={`px-3 py-2.5 font-mono text-right font-semibold ${t.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPnl(t.netPnl)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-700 bg-zinc-800/30">
            <td colSpan={7} className="px-3 py-2.5 text-zinc-400 font-medium text-xs">
              Total ({trades.length} trades)
            </td>
            <td className={`px-3 py-2.5 font-mono font-bold text-right ${trades.reduce((s, t) => s + t.grossPnl, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPnl(trades.reduce((s, t) => s + t.grossPnl, 0))}
            </td>
            <td className="px-3 py-2.5 text-red-400/70 font-mono text-right">
              ${Math.abs(trades.reduce((s, t) => s + t.commission, 0)).toFixed(2)}
            </td>
            <td className={`px-3 py-2.5 font-mono font-bold text-right ${trades.reduce((s, t) => s + t.netPnl, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPnl(trades.reduce((s, t) => s + t.netPnl, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
