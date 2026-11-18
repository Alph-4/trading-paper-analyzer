import { useLocation } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { useTradeStore } from '@/store/useTradeStore'

const ROUTE_TITLES: Record<string, string> = {
  '/desk': 'Workspace / Marchés',
  '/upload': 'Import CSV',
  '/dashboard': 'Dashboard',
  '/equity': 'Equity Curve',
  '/trades': 'Trades',
  '/pairs': 'Par Paire',
  '/sessions': 'Sessions & Temps',
  '/commissions': 'Commissions',
  '/convictions': 'Convictions',
  '/drawdown': 'Drawdown',
}

export function Header() {
  const location = useLocation()
  const trades = useTradeStore((state) => state.trades)
  const isLoaded = useTradeStore((state) => state.isLoaded)
  const title = ROUTE_TITLES[location.pathname] ?? 'Trading Paper Analyzer'

  return (
    <header className="flex items-center h-14 px-3 sm:px-5 border-b border-zinc-800 bg-zinc-950 shrink-0 gap-3">
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      {isLoaded && location.pathname !== '/desk' && (
        <Badge
          variant="outline"
          className="text-emerald-400 border-emerald-800 bg-emerald-950/40 text-xs font-mono"
        >
          {trades.length} trades enregistrés
        </Badge>
      )}
      {location.pathname === '/desk' && <span className="ml-auto font-mono text-[10px] text-zinc-600">FX / INDICES / OR</span>}
    </header>
  )
}
