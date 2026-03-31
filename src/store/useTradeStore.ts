import { create } from 'zustand'
import type { RawRow, Trade } from '@/lib/types'

interface TradeStore {
  rawRows: RawRow[]
  trades: Trade[]
  isLoaded: boolean
  setData: (rawRows: RawRow[], trades: Trade[]) => void
  reset: () => void
}

export const useTradeStore = create<TradeStore>()((set) => ({
  rawRows: [],
  trades: [],
  isLoaded: false,
  setData: (rawRows, trades) => set({ rawRows, trades, isLoaded: true }),
  reset: () => set({ rawRows: [], trades: [], isLoaded: false }),
}))
