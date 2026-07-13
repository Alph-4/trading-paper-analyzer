import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CurrencyConviction, ConvictionStance } from '@/lib/types'

const DEFAULT_CURRENCIES = [
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'CHF',
    'AUD',
    'CAD',
    'NZD',
]

interface ConvictionStore {
    convictions: Record<string, CurrencyConviction>
    setConviction: (currency: string, stance: ConvictionStance, score: number) => void
    setMany: (items: CurrencyConviction[]) => void
    resetAll: () => void
    // Allowed FX pairs (canonical 6-letter forms like EURUSD)
    allowedPairs: string[]
    setPairs: (pairs: string[]) => void
    addPair: (pair: string) => void
    removePair: (pair: string) => void
    resetPairs: () => void
}

function makeDefault() {
    const obj: Record<string, CurrencyConviction> = {}
    const ts = Date.now()
    for (const c of DEFAULT_CURRENCIES) {
        obj[c] = { currency: c, stance: 'neutral', score: 0, updatedAt: ts }
    }
    return obj
}

const DEFAULT_PAIRS = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD',
    'EURGBP', 'GBPCHF', 'EURJPY', 'GBPJPY', 'CADJPY', 'AUDJPY', 'NZDJPY',
    'EURCHF', 'CADCHF', 'AUDCHF', 'NZDCHF', 'EURCAD', 'GBPCAD', 'AUDCAD',
    'EURAUD', 'GBPAUD', 'EURNZD', 'GBPNZD', 'AUDNZD', 'NZDCAD'
]

export const useConvictionStore = create<ConvictionStore>()(
    persist(
        (set, get) => ({
            convictions: makeDefault(),
            allowedPairs: DEFAULT_PAIRS,
            setConviction: (currency, stance, score) =>
                set((state) => ({
                    convictions: {
                        ...state.convictions,
                        [currency]: { currency, stance, score, updatedAt: Date.now() },
                    },
                })),
            setMany: (items) =>
                set((state) => {
                    const copy = { ...state.convictions }
                    for (const it of items) {
                        copy[it.currency] = { ...it, updatedAt: Date.now() }
                    }
                    return { convictions: copy }
                }),
            resetAll: () => set({ convictions: makeDefault() }),
            setPairs: (pairs: string[]) =>
                set(() => {
                    const cleaned = Array.from(
                        new Set(
                            pairs
                                .map((p) => String(p).toUpperCase().replace(/[^A-Z]/g, ''))
                                .filter((p) => p.length === 6)
                        )
                    )
                    return { allowedPairs: cleaned }
                }),
            addPair: (pair: string) =>
                set((state) => {
                    const cleaned = String(pair).toUpperCase().replace(/[^A-Z]/g, '')
                    if (cleaned.length !== 6) return { allowedPairs: state.allowedPairs }
                    if (state.allowedPairs.includes(cleaned)) return { allowedPairs: state.allowedPairs }
                    return { allowedPairs: [...state.allowedPairs, cleaned] }
                }),
            removePair: (pair: string) =>
                set((state) => ({ allowedPairs: state.allowedPairs.filter((p) => p !== pair) })),
            resetPairs: () => set({ allowedPairs: DEFAULT_PAIRS }),
        }),
        {
            name: 'convictions-storage',
            // versioning could be added here if shape changes later
        }
    )
)

export const DEFAULT_CURRENCIES_LIST = DEFAULT_CURRENCIES

export const DEFAULT_PAIR_LIST = DEFAULT_PAIRS

export default useConvictionStore
