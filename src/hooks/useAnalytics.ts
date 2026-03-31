import { useMemo } from 'react'
import { useTradeStore } from '@/store/useTradeStore'
import { buildEvents } from '@/lib/parser'
import { computeAnalytics } from '@/lib/analytics'
import type { AnalyticsResult } from '@/lib/types'

export function useAnalytics(): AnalyticsResult | null {
  const { trades, rawRows } = useTradeStore()
  return useMemo(() => {
    if (trades.length === 0) return null
    const events = buildEvents(rawRows)
    return computeAnalytics(trades, events)
  }, [trades, rawRows])
}
