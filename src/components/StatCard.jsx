export default function StatCard({ label, value, sub, color = 'default', size = 'normal' }) {
  const colorMap = {
    default: 'text-zinc-100',
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    accent: 'text-indigo-400',
    warning: 'text-amber-400',
    muted: 'text-zinc-400',
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-1">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className={`font-bold leading-tight ${colorMap[color]} ${size === 'large' ? 'text-3xl' : 'text-xl'}`}>
        {value}
      </p>
      {sub && <p className="text-zinc-500 text-xs">{sub}</p>}
    </div>
  );
}
