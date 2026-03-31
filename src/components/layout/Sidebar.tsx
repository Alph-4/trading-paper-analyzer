import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Upload,
  LayoutDashboard,
  TrendingUp,
  List,
  BarChart2,
  Clock,
  TrendingDown,
  DollarSign,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTradeStore } from '@/store/useTradeStore'

const NAV_ITEMS = [
  { to: '/upload', icon: Upload, label: 'Import CSV' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/equity', icon: TrendingUp, label: 'Equity Curve' },
  { to: '/trades', icon: List, label: 'Trades' },
  { to: '/pairs', icon: BarChart2, label: 'Par Paire' },
  { to: '/sessions', icon: Clock, label: 'Sessions & Temps' },
  { to: '/commissions', icon: DollarSign, label: 'Commissions' },
  { to: '/drawdown', icon: TrendingDown, label: 'Drawdown' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const isLoaded = useTradeStore((s) => s.isLoaded)
  const location = useLocation()

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-zinc-950 border-r border-zinc-800 transition-[width] duration-200 shrink-0',
        collapsed ? 'w-14' : 'w-52'
      )}
    >
      {/* Logo / brand */}
      <div className="flex items-center h-14 px-3 border-b border-zinc-800 overflow-hidden">
        <TrendingUp className="text-emerald-400 shrink-0" size={20} />
        {!collapsed && (
          <span className="ml-2 text-sm font-semibold text-zinc-100 truncate">
            Paper Trader
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
          const disabled = to !== '/upload' && !isLoaded
          const isActive = location.pathname === to

          if (disabled) {
            return (
              <div
                key={to}
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 mx-1 rounded-md text-zinc-600 cursor-not-allowed select-none',
                  collapsed && 'justify-center'
                )}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="text-sm truncate">{label}</span>}
              </div>
            )
          }

          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 mx-1 rounded-md text-sm transition-colors',
                collapsed && 'justify-center',
                isActive
                  ? 'bg-zinc-800 text-emerald-400'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              )}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center h-10 border-t border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  )
}
