import { useLocation } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { useTradeStore } from '@/store/useTradeStore'

const ROUTE_TITLES: Record<string, string> = {
  '/upload': 'Import CSV',
  '/dashboard': 'Dashboard',
  '/equity': 'Equity Curve',
  '/trades': 'Trades',
  '/pairs': 'Par Paire',
  '/sessions': 'Sessions & Temps',
  '/commissions': 'Commissions',
}

export function Header() {
  const location = useLocation()
  const { trades, isLoaded } = useTradeStore()
  const title = ROUTE_TITLES[location.pathname] ?? 'Trading Paper Analyzer'

  return (
    <header className="flex items-center h-14 px-5 border-b border-zinc-800 bg-zinc-950 shrink-0 gap-3">
      <h1 className="text-sm font-semibold text-zinc-100">{title}</h1>
      {isLoaded && (
        <Badge
          variant="outline"
          className="text-emerald-400 border-emerald-800 bg-emerald-950/40 text-xs font-mono"
        >
          {trades.length} trades chargés
        </Badge>
      )}
    </header>
  )
}
