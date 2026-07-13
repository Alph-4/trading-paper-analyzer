import { useMemo } from 'react'
import { useConvictionStore } from '@/store/useConvictionStore'
import { buildPairList, computeSignal } from '@/lib/conviction'
import type { TradeSignal } from '@/lib/types'

export function useTradeSignals(): TradeSignal[] {
    const convictions = useConvictionStore((s) => s.convictions)
    const allowedPairs = useConvictionStore((s) => s.allowedPairs)

    const signals = useMemo(() => {
        const pairs = buildPairList(undefined, allowedPairs)
        const out: TradeSignal[] = []

        for (const symbol of pairs) {
            const decomposed = symbol && symbol.length === 6 ? { base: symbol.slice(0, 3), quote: symbol.slice(3, 6) } : null
            if (!decomposed) continue
            const { base, quote } = decomposed
            const baseConv = convictions[base] ?? { currency: base, stance: 'neutral', score: 0, updatedAt: 0 }
            const quoteConv = convictions[quote] ?? { currency: quote, stance: 'neutral', score: 0, updatedAt: 0 }
            out.push(computeSignal(symbol, baseConv, quoteConv))
        }

        out.sort((a, b) => b.strength - a.strength)
        return out
    }, [convictions, allowedPairs])

    return signals
}

export default useTradeSignals
