import type { ReactNode } from 'react'
import { ArrowUpRight, CircleAlert } from 'lucide-react'
import { formatNumber, formatPercent } from '@/lib/desk'

export const fieldClass =
  'w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
export const actionClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-50'
export const tone = (value: number | null | undefined) =>
  value == null || value === 0
    ? 'text-zinc-400'
    : value > 0
      ? 'text-emerald-400'
      : 'text-rose-400'
export const chartStyle = {
  background: '#111114',
  border: '1px solid #303036',
  borderRadius: 10,
  color: '#e4e4e7',
  fontSize: 12
}
export { formatNumber as num, formatPercent as pct }

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = ''
}: {
  title: string
  eyebrow?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/45 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div>
          {eyebrow && (
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[.16em] text-zinc-500">
              {eyebrow}
            </p>
          )}
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        </div>
        {action}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  )
}
export function SourceLine({
  source,
  sourceUrl,
  asOf
}: {
  source: string
  sourceUrl: string
  asOf?: string | null
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
      <a
        className="inline-flex items-center gap-1 hover:text-zinc-300"
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        {source}
        <ArrowUpRight size={11} />
      </a>
      <span>·</span>
      <span>
        {asOf ? `Observé le ${asOf.slice(0, 10)}` : 'Date indisponible'}
      </span>
    </div>
  )
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-800 p-5 text-center text-xs leading-relaxed text-zinc-500">
      <CircleAlert size={20} className="text-zinc-600" />
      {children}
    </div>
  )
}
export function Metric({
  label,
  value,
  detail,
  valueClass = ''
}: {
  label: string
  value: string
  detail: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-4">
      <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p
        className={`font-mono text-xl sm:text-2xl font-medium tracking-tight ${valueClass || 'text-zinc-100'}`}
      >
        {value}
      </p>
      <p className="mt-2 text-[11px] text-zinc-500">{detail}</p>
    </div>
  )
}
