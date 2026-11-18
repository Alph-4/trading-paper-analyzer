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
  Compass,
  ChevronLeft,
  ChevronRight,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTradeStore } from '@/store/useTradeStore'

const NAV_ITEMS = [
  { to: '/desk', icon: Activity, label: 'Trading desk', requiresData: false },
  { to: '/upload', icon: Upload, label: 'Import CSV', requiresData: false },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', requiresData: true },
  { to: '/equity', icon: TrendingUp, label: 'Equity Curve', requiresData: true },
  { to: '/trades', icon: List, label: 'Trades', requiresData: true },
  { to: '/pairs', icon: BarChart2, label: 'Par Paire', requiresData: true },
  { to: '/convictions', icon: Compass, label: 'Convictions', requiresData: false },
  { to: '/sessions', icon: Clock, label: 'Sessions & Temps', requiresData: true },
  { to: '/commissions', icon: DollarSign, label: 'Commissions', requiresData: true },
  { to: '/drawdown', icon: TrendingDown, label: 'Drawdown', requiresData: true },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const isLoaded = useTradeStore((s) => s.isLoaded)
  const location = useLocation()

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-zinc-950 border-r border-zinc-800 transition-[width] duration-200 shrink-0',
        collapsed ? 'w-14' : 'w-14 md:w-52'
      )}
    >
      {/* Logo / brand */}
      <div className="flex items-center h-14 px-3 border-b border-zinc-800 overflow-hidden">
        <TrendingUp className="text-emerald-400 shrink-0" size={20} />
        {!collapsed && (
          <span className="ml-2 hidden text-sm font-semibold text-zinc-100 truncate md:inline">
            Paper Trader
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => {
          const { to, icon: Icon, label, requiresData } = item
          const needsData = requiresData === undefined ? true : requiresData
          const disabled = needsData && !isLoaded
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
                {!collapsed && <span className="hidden text-sm truncate md:inline">{label}</span>}
              </div>
            )
          }

          return (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              title={label}
              className={cn(
                'flex items-center gap-3 px-3 py-2 mx-1 rounded-md text-sm transition-colors',
                collapsed && 'justify-center',
                isActive
                  ? 'bg-zinc-800 text-emerald-400'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              )}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="hidden truncate md:inline">{label}</span>}
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
