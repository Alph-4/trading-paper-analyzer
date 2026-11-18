import { useEffect, useState } from 'react'
import type { PricePoint } from '@/lib/seasonality'

interface Source {
  source: string
  sourceUrl: string
  asOf: string | null
  error?: string
}
export interface MarketData {
  pair: string
  fetchedAt: string
  fx: Source & { points: PricePoint[] }
  yields: Source & {
    points: { tenor: string; yield: number | null; changeBps: number | null }[]
  }
  strength?: Source & {
    points: {
      currency: string
      change1d: number | null
      change5d: number | null
    }[]
  }
  positioning?: Source & {
    points: {
      currency: string
      asOf: string
      long: number
      short: number
      net: number
      changeNet?: number | null
      longPercent?: number | null
    }[]
  }
  watchlist?: Source & {
    points: {
      symbol: string
      label: string
      close: number | null
      changePct: number | null
      asOf: string | null
      sourceUrl: string
      error?: string
    }[]
  }
}

export function useMarketData(pair: string, years: number) {
  const [state, setState] = useState<{
    data: MarketData | null
    loading: boolean
    error: string | null
  }>({ data: null, loading: true, error: null })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState({ data: null, loading: true, error: null })
    fetch(`/api/market?pair=${encodeURIComponent(pair)}&years=${years}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Service marché indisponible (${response.status}).`)
        const payload = await response.json()
        if (
          payload.pair !== pair ||
          !Array.isArray(payload.fx?.points) ||
          !Array.isArray(payload.yields?.points)
        )
          throw new Error(
            'Réponse marché invalide. Le service /api/market doit être actif.'
          )
        if (active) setState({ data: payload, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            data: null,
            loading: false,
            error:
              error instanceof Error ? error.message : 'Connexion impossible.'
          })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [pair, years, revision])
  return { ...state, refresh: () => setRevision((v) => v + 1) }
}
