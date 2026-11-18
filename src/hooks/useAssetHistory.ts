import { useEffect, useState } from 'react'
import type { PricePoint } from '@/lib/seasonality'

export interface AssetHistory {
  symbol: string
  years: number
  label: string
  source: string
  sourceUrl: string
  asOf: string | null
  points: PricePoint[]
  adjusted: boolean
  note: string
  error?: string
}

export function useAssetHistory(
  symbol: string,
  years: number,
  enabled: boolean
) {
  const [data, setData] = useState<AssetHistory | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!enabled || symbol === 'fx') return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setData(null)
    setError('')
    fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&years=${years}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Historique indisponible (${response.status}).`)
        const result = await response.json()
        if (
          result.symbol !== symbol ||
          result.years !== years ||
          !Array.isArray(result.points)
        )
          throw new Error('Format d’historique invalide.')
        if (active) {
          setData(result)
          setError(result.error ?? '')
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Connexion impossible.')
          setLoading(false)
        }
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [symbol, years, enabled])
  return {
    data: data?.symbol === symbol && data?.years === years ? data : null,
    error,
    loading
  }
}
