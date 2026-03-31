import { useState, useMemo, useRef, useEffect } from 'react'
import { useTradeStore } from '@/store/useTradeStore'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown, Download, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Trade } from '@/lib/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey =
  | 'symbol' | 'direction' | 'openTime' | 'closeTime' | 'durationMs'
  | 'entryPrice' | 'avgExitPrice' | 'totalUnits' | 'grossPnl'
  | 'totalCommission' | 'netPnl' | 'closes'

type DirFilter = 'all' | 'long' | 'short'
type ResultFilter = 'all' | 'win' | 'loss'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number, d = 2) {
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtDuration(ms: number): string {
  if (ms < 60_000) return '< 1m'
  const totalMins = Math.floor(ms / 60_000)
  const days = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins = totalMins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function exportCSV(rows: Trade[]) {
  const headers = [
    '#', 'Symbol', 'Direction', 'Entry Date', 'Exit Date', 'Duration (min)',
    'Entry Price', 'Exit Price', 'Units', 'Gross PnL', 'Commission', 'Net PnL', 'Closes',
  ]
  const data = rows.map((t, i) => [
    i + 1,
    t.symbol,
    t.direction,
    format(t.openTime, 'yyyy-MM-dd HH:mm:ss'),
    format(t.closeTime, 'yyyy-MM-dd HH:mm:ss'),
    Math.round((t.closeTime.getTime() - t.openTime.getTime()) / 60_000),
    t.entryPrice.toFixed(5),
    t.avgExitPrice.toFixed(5),
    t.totalUnits.toFixed(2),
    t.grossPnl.toFixed(2),
    t.totalCommission.toFixed(2),
    t.netPnl.toFixed(2),
    t.closes.length,
  ])
  const csv = [headers, ...data].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'trades_export.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SortHeader({
  col, current, dir, onClick, children,
}: {
  col: SortKey; current: SortKey; dir: 'asc' | 'desc'
  onClick: (c: SortKey) => void; children: React.ReactNode
}) {
  const active = col === current
  return (
    <th
      onClick={() => onClick(col)}
      className="px-3 py-2 text-left text-xs font-medium text-zinc-500 cursor-pointer select-none hover:text-zinc-300 whitespace-nowrap"
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active
          ? dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
          : <ChevronDown size={12} className="opacity-0" />}
      </span>
    </th>
  )
}

function MultiSelect({
  symbols, value, onChange,
}: {
  symbols: string[]; value: Set<string>; onChange: (v: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label =
    value.size === 0 ? 'Toutes les paires' :
      value.size === 1 ? [...value][0] :
        `${value.size} paires`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-8 px-3 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-300
          hover:text-zinc-100 flex items-center gap-2 min-w-[160px] justify-between"
      >
        <span>{label}</span>
        {value.size > 0
          ? <X size={12} onClick={(e) => { e.stopPropagation(); onChange(new Set()) }} />
          : <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-zinc-900 border border-zinc-800
          rounded shadow-xl min-w-[160px] py-1 max-h-64 overflow-y-auto">
          {symbols.map((s) => {
            const checked = value.has(s)
            return (
              <button
                key={s}
                onClick={() => {
                  const next = new Set(value)
                  if (checked) next.delete(s); else next.add(s)
                  onChange(next)
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-xs text-left font-mono flex items-center gap-2 transition-colors',
                  checked
                    ? 'text-zinc-100 bg-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
                )}
              >
                <span className={cn(
                  'w-3.5 h-3.5 border rounded-sm flex-shrink-0 flex items-center justify-center text-[9px] leading-none',
                  checked ? 'border-indigo-500 bg-indigo-600/30 text-indigo-400' : 'border-zinc-600',
                )}>
                  {checked && '✓'}
                </span>
                {s}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DIR_BTNS: { value: DirFilter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
]
const RESULT_BTNS: { value: ResultFilter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'win', label: 'Win' },
  { value: 'loss', label: 'Loss' },
]

export default function TradesPage() {
  const trades = useTradeStore((s) => s.trades)

  const [sortKey, setSortKey] = useState<SortKey>('closeTime')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [symFilter, setSymFilter] = useState<Set<string>>(new Set())
  const [dirFilter, setDirFilter] = useState<DirFilter>('all')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const symbols = useMemo(
    () => Array.from(new Set(trades.map((t) => t.symbol))).sort(),
    [trades],
  )

  const handleSort = (col: SortKey) => {
    if (col === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(col); setSortDir('desc') }
    setPage(1)
  }

  const filteredSorted = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : -Infinity
    const toTs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity

    const filtered = trades.filter((t) => {
      if (symFilter.size > 0 && !symFilter.has(t.symbol)) return false
      if (dirFilter !== 'all' && t.direction !== dirFilter) return false
      if (resultFilter === 'win' && !t.win) return false
      if (resultFilter === 'loss' && t.win) return false
      const ct = t.closeTime.getTime()
      if (ct < fromTs || ct > toTs) return false
      return true
    })

    return filtered.sort((a, b) => {
      // String sorts
      if (sortKey === 'symbol') {
        const cmp = a.symbol.localeCompare(b.symbol)
        return sortDir === 'asc' ? cmp : -cmp
      }
      if (sortKey === 'direction') {
        const cmp = a.direction.localeCompare(b.direction)
        return sortDir === 'asc' ? cmp : -cmp
      }
      // Numeric sorts
      let av: number, bv: number
      switch (sortKey) {
        case 'openTime': av = a.openTime.getTime(); bv = b.openTime.getTime(); break
        case 'closeTime': av = a.closeTime.getTime(); bv = b.closeTime.getTime(); break
        case 'durationMs': av = a.closeTime.getTime() - a.openTime.getTime()
          bv = b.closeTime.getTime() - b.openTime.getTime(); break
        case 'entryPrice': av = a.entryPrice; bv = b.entryPrice; break
        case 'avgExitPrice': av = a.avgExitPrice; bv = b.avgExitPrice; break
        case 'totalUnits': av = a.totalUnits; bv = b.totalUnits; break
        case 'grossPnl': av = a.grossPnl; bv = b.grossPnl; break
        case 'totalCommission': av = a.totalCommission; bv = b.totalCommission; break
        case 'netPnl': av = a.netPnl; bv = b.netPnl; break
        case 'closes': av = a.closes.length; bv = b.closes.length; break
        default: av = 0; bv = 0
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [trades, symFilter, dirFilter, resultFilter, dateFrom, dateTo, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))
  const paginated = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Summary stats (filtered)
  const filtWins = filteredSorted.filter((t) => t.win).length
  const filtNetPnl = filteredSorted.reduce((s, t) => s + t.netPnl, 0)
  const filtWinRate = filteredSorted.length > 0 ? (filtWins / filteredSorted.length) * 100 : 0

  if (trades.length === 0) {
    return <p className="text-zinc-500 text-sm">Aucune donnée chargée.</p>
  }

  return (
    <div className="space-y-4">

      {/* ── Summary cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Trades filtrés</p>
            <p className="text-lg font-mono font-semibold text-zinc-100">
              {filteredSorted.length}
              <span className="text-xs text-zinc-600 ml-2">
                {filtWins}W / {filteredSorted.length - filtWins}L
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Net PnL filtré</p>
            <p className={cn(
              'text-lg font-mono font-semibold',
              filtNetPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
            )}>
              {filtNetPnl >= 0 ? '+' : ''}${fmt(filtNetPnl)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Win Rate filtré</p>
            <p className={cn(
              'text-lg font-mono font-semibold',
              filtWinRate >= 50 ? 'text-emerald-400' : 'text-zinc-400',
            )}>
              {fmt(filtWinRate, 1)}%
            </p>
            <div className="mt-2 h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, filtWinRate)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Symbol multi-select */}
        <MultiSelect
          symbols={symbols}
          value={symFilter}
          onChange={(v) => { setSymFilter(v); setPage(1) }}
        />

        {/* Direction toggle */}
        <div className="flex items-center rounded-md border border-zinc-800 overflow-hidden">
          {DIR_BTNS.map((b) => (
            <button
              key={b.value}
              onClick={() => { setDirFilter(b.value); setPage(1) }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors select-none',
                dirFilter === b.value
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300',
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Result toggle */}
        <div className="flex items-center rounded-md border border-zinc-800 overflow-hidden">
          {RESULT_BTNS.map((b) => (
            <button
              key={b.value}
              onClick={() => { setResultFilter(b.value); setPage(1) }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors select-none',
                resultFilter === b.value
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300',
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
          className="h-8 px-2 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-300 [color-scheme:dark]"
        />
        <span className="text-zinc-600 text-xs">→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
          className="h-8 px-2 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-300 [color-scheme:dark]"
        />

        {/* Export */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs border-zinc-800 text-zinc-400 hover:text-zinc-200 ml-auto"
          onClick={() => exportCSV(filteredSorted)}
        >
          <Download size={12} className="mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-600 w-10">#</th>
                  <SortHeader col="symbol" current={sortKey} dir={sortDir} onClick={handleSort}>Symbol</SortHeader>
                  <SortHeader col="direction" current={sortKey} dir={sortDir} onClick={handleSort}>Dir.</SortHeader>
                  <SortHeader col="openTime" current={sortKey} dir={sortDir} onClick={handleSort}>Entry Date</SortHeader>
                  <SortHeader col="closeTime" current={sortKey} dir={sortDir} onClick={handleSort}>Exit Date</SortHeader>
                  <SortHeader col="durationMs" current={sortKey} dir={sortDir} onClick={handleSort}>Duration</SortHeader>
                  <SortHeader col="entryPrice" current={sortKey} dir={sortDir} onClick={handleSort}>Entry Price</SortHeader>
                  <SortHeader col="avgExitPrice" current={sortKey} dir={sortDir} onClick={handleSort}>Exit Price</SortHeader>
                  <SortHeader col="totalUnits" current={sortKey} dir={sortDir} onClick={handleSort}>Units</SortHeader>
                  <SortHeader col="grossPnl" current={sortKey} dir={sortDir} onClick={handleSort}>Gross PnL</SortHeader>
                  <SortHeader col="totalCommission" current={sortKey} dir={sortDir} onClick={handleSort}>Comm.</SortHeader>
                  <SortHeader col="netPnl" current={sortKey} dir={sortDir} onClick={handleSort}>Net PnL</SortHeader>
                  <SortHeader col="closes" current={sortKey} dir={sortDir} onClick={handleSort}>Closes</SortHeader>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-8 text-center text-zinc-600 text-xs">
                      Aucun trade ne correspond aux filtres.
                    </td>
                  </tr>
                ) : paginated.map((t, i) => {
                  const rowNum = (page - 1) * PAGE_SIZE + i + 1
                  const durationMs = t.closeTime.getTime() - t.openTime.getTime()
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                    >
                      {/* # */}
                      <td className="px-3 py-2 text-zinc-700 font-mono text-xs">{rowNum}</td>

                      {/* Symbol */}
                      <td className="px-3 py-2 font-mono text-zinc-200 font-medium">{t.symbol}</td>

                      {/* Direction badge — blue / orange */}
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs font-medium',
                            t.direction === 'long'
                              ? 'border-blue-800 text-blue-400 bg-blue-950/30'
                              : 'border-orange-800 text-orange-400 bg-orange-950/30',
                          )}
                        >
                          {t.direction === 'long' ? 'Long' : 'Short'}
                        </Badge>
                      </td>

                      {/* Entry Date */}
                      <td className="px-3 py-2 text-zinc-400 font-mono text-xs whitespace-nowrap">
                        {format(t.openTime, 'dd/MM/yy HH:mm')}
                      </td>

                      {/* Exit Date */}
                      <td className="px-3 py-2 text-zinc-400 font-mono text-xs whitespace-nowrap">
                        {format(t.closeTime, 'dd/MM/yy HH:mm')}
                      </td>

                      {/* Duration */}
                      <td className="px-3 py-2 text-zinc-400 font-mono text-xs whitespace-nowrap">
                        {fmtDuration(durationMs)}
                      </td>

                      {/* Entry Price */}
                      <td className="px-3 py-2 font-mono text-zinc-300 text-xs">
                        {fmt(t.entryPrice, 5)}
                      </td>

                      {/* Exit Price */}
                      <td className="px-3 py-2 font-mono text-zinc-300 text-xs">
                        {fmt(t.avgExitPrice, 5)}
                      </td>

                      {/* Units */}
                      <td className="px-3 py-2 font-mono text-zinc-300 text-xs">
                        {fmt(t.totalUnits, 2)}
                      </td>

                      {/* Gross PnL */}
                      <td className="px-3 py-2 font-mono text-xs">
                        <span className={t.grossPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {t.grossPnl >= 0 ? '+' : ''}${fmt(t.grossPnl)}
                        </span>
                      </td>

                      {/* Commission */}
                      <td className="px-3 py-2 font-mono text-xs text-red-400/70">
                        ${fmt(t.totalCommission)}
                      </td>

                      {/* Net PnL — colored background */}
                      <td className={cn(
                        'px-3 py-2 font-mono text-xs font-semibold',
                        t.win
                          ? 'bg-emerald-950/50 text-emerald-400'
                          : 'bg-red-950/50 text-red-400',
                      )}>
                        {t.netPnl >= 0 ? '+' : ''}${fmt(t.netPnl)}
                      </td>

                      {/* Closes badge */}
                      <td className="px-3 py-2">
                        {t.closes.length > 1 ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-indigo-800 text-indigo-400 bg-indigo-950/20"
                          >
                            {t.closes.length}
                          </Badge>
                        ) : (
                          <span className="text-xs text-zinc-600 font-mono">1</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ──────────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
              <span className="text-xs text-zinc-600">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredSorted.length)}{' '}
                sur {filteredSorted.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-7 w-7 flex items-center justify-center rounded border border-zinc-800
                    text-zinc-400 hover:text-zinc-200 hover:border-zinc-600
                    disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-zinc-400 font-mono min-w-[60px] text-center">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-7 w-7 flex items-center justify-center rounded border border-zinc-800
                    text-zinc-400 hover:text-zinc-200 hover:border-zinc-600
                    disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
