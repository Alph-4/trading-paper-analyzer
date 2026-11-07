import { create } from 'zustand'
import type { RawRow, Trade } from '@/lib/types'
import { buildEvents, buildTrades, isValidTimestamp } from '../lib/parser.ts'
import { mergeRows } from '../lib/history.ts'

export const HISTORY_STORAGE_KEY = 'trading-paper-history'
const HISTORY_VERSION = 1

interface ImportResult {
  rawRows: RawRow[]
  trades: Trade[]
  addedRows: number
  duplicateRows: number
}

interface TradeStore {
  rawRows: RawRow[]
  trades: Trade[]
  isLoaded: boolean
  storageError: string | null
  importRows: (rows: RawRow[]) => ImportResult
  reset: () => void
}

function readHistory(storage: Storage): RawRow[] {
  const saved = storage.getItem(HISTORY_STORAGE_KEY)
  if (!saved) return []
  const data = JSON.parse(saved)
  if (data?.version !== HISTORY_VERSION || !Array.isArray(data.rawRows)
    || !data.rawRows.every((row: RawRow) => row && typeof row.heure === 'string' && isValidTimestamp(row.heure)
      && [row.balanceAvant, row.balanceApres, row.pnl].every(Number.isFinite)
      && typeof row.action === 'string' && row.action.trim() && typeof row.devise === 'string' && row.devise.trim())) {
    throw new Error('Historique sauvegardé illisible. Il a été conservé sans modification.')
  }
  return mergeRows([], data.rawRows).rawRows
}

/** Only source rows are persisted. Dates and trades are rebuilt on every reload. */
export function createTradeStore(getStorage: () => Storage = () => globalThis.localStorage) {
  let rawRows: RawRow[] = []
  let storageError: string | null = null
  try {
    rawRows = readHistory(getStorage())
  } catch {
    storageError = 'Impossible de relire l’historique local. Il reste intact ; vérifiez le stockage du navigateur.'
  }

  return create<TradeStore>()((set, get) => ({
    rawRows,
    trades: buildTrades(buildEvents(rawRows)),
    isLoaded: rawRows.length > 0,
    storageError,
    importRows: (incoming) => {
      // Re-read before merging so an import in another tab is also preserved.
      const storage = getStorage()
      const current = mergeRows(readHistory(storage), get().rawRows).rawRows
      const merged = mergeRows(current, incoming)
      const trades = buildTrades(buildEvents(merged.rawRows))
      try {
        storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: HISTORY_VERSION, rawRows: merged.rawRows }))
      } catch {
        throw new Error('Sauvegarde locale impossible (stockage plein ou bloqué). Import annulé ; l’historique précédent est conservé.')
      }
      set({ rawRows: merged.rawRows, trades, isLoaded: merged.rawRows.length > 0, storageError: null })
      return { ...merged, trades }
    },
    reset: () => {
      // Do not claim deletion if the browser refused it.
      getStorage().removeItem(HISTORY_STORAGE_KEY)
      set({ rawRows: [], trades: [], isLoaded: false, storageError: null })
    },
  }))
}

export const useTradeStore = createTradeStore()
