import Papa from 'papaparse'
import type { RawRow, ParsedEvent, EventType, Trade, TradeClose } from './types'
import { sortRawRows } from './history.ts'

// ── Regex patterns ─────────────────────────────────────────────────────────

const SYMBOL_RE = /symbol\s+([\w:]+)/i
const DIR_RE = /Close\s+(long|short)\s+position/i
const AT_PRICE_RE = /at price\s+([\d.]+)/i
// "for N units" — stop before ".Position" so we don't accidentally catch "for"
// in "Commission for:" (that's fine too since it requires digits)
const UNITS_RE = /for\s+([\d.]+)\s+units/i
const AVG_PRICE_RE = /AVG Price was\s+([\d.]+)/i

function sym(action: string): string {
  const m = action.match(SYMBOL_RE)
  return m ? m[1].replace('FX:', '') : 'UNKNOWN'
}

function dir(action: string): 'long' | 'short' | undefined {
  const m = action.match(DIR_RE)
  return m ? (m[1].toLowerCase() as 'long' | 'short') : undefined
}

function price(action: string): number | undefined {
  const m = action.match(AT_PRICE_RE)
  return m ? parseFloat(m[1]) : undefined
}

function units(action: string): number | undefined {
  const m = action.match(UNITS_RE)
  return m ? parseFloat(m[1]) : undefined
}

function avgPrice(action: string): number | undefined {
  const m = action.match(AVG_PRICE_RE)
  return m ? parseFloat(m[1]) : undefined
}

// ── parseRawRows ───────────────────────────────────────────────────────────

/**
 * Accept current and legacy TradingView headers and normalize newest-first.
 */
export function parseRawRows(csvText: string): RawRow[] {
  const result = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  })

  const aliases = {
    heure: ['Heure', 'Time'],
    balanceAvant: ['Solde avant', 'Balance avant', 'Balance before'],
    balanceApres: ['Solde après', 'Balance après', 'Balance after'],
    pnl: ['P&L réalisé (valeur)', 'Pertes et profits réalisés (valeur)', 'Realized P&L (value)', 'Realized PnL (value)'],
    devise: ['P&L réalisé (devise)', 'Pertes et profits réalisés (devise)', 'Realized P&L (currency)', 'Realized PnL (currency)'],
    action: ['Action'],
  }
  const fields = result.meta.fields ?? []
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => {
    const header = names.map(normalizeHeader).find((name) => fields.includes(name))
    if (!header) throw new Error(`Colonne manquante : ${names[0]}. Importez l’historique des soldes TradingView.`)
    return [key, header]
  })) as Record<keyof RawRow, string>

  if (result.errors.length > 0) {
    throw new Error('CSV mal formé : vérifiez les colonnes et les guillemets du fichier.')
  }
  if (result.data.length === 0) throw new Error('Le fichier ne contient aucune opération.')

  const rows = result.data.map((row, index): RawRow => {
    const heure = row[columns.heure]?.trim().replace('T', ' ') ?? ''
    const action = row[columns.action]?.trim().replace(/\s+/g, ' ') ?? ''
    const devise = row[columns.devise]?.trim().toUpperCase() ?? ''
    if (!isValidTimestamp(heure) || !action || !devise) {
      throw new Error(`Ligne ${index + 2} : date, action ou devise invalide.`)
    }
    return {
      heure,
      balanceAvant: parseNumber(row[columns.balanceAvant], index + 2),
      balanceApres: parseNumber(row[columns.balanceApres], index + 2),
      pnl: parseNumber(row[columns.pnl], index + 2),
      devise,
      action,
    }
  })
  if (new Set(rows.map((row) => row.devise)).size > 1) {
    throw new Error('Cet historique contient plusieurs devises de compte et ne peut pas être fusionné.')
  }
  return sortRawRows(rows)
}

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toLowerCase()
}

function parseNumber(value: string | undefined, line: number): number {
  const normalized = (value ?? '').trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized) || !Number.isFinite(Number(normalized))) {
    throw new Error(`Ligne ${line} : montant invalide ou manquant. Aucune donnée n’a été importée.`)
  }
  return Number(normalized)
}

export function isValidTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return false
  const date = new Date(value.replace(' ', 'T'))
  if (!Number.isFinite(date.getTime())) return false
  const [year, month, day, hour, minute, second] = value.split(/[- :]/).map(Number)
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day
    && date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second
}

/** CSV backup uses the same format as the import, including full numeric precision. */
export function exportCSV(rows: RawRow[]): string {
  return '\uFEFF' + Papa.unparse({
    fields: ['Heure', 'Solde avant', 'Solde après', 'P&L réalisé (valeur)', 'P&L réalisé (devise)', 'Action'],
    data: sortRawRows(rows).map((row) => [row.heure, row.balanceAvant, row.balanceApres, row.pnl, row.devise, row.action]),
  })
}

// ── buildEvents ────────────────────────────────────────────────────────────

/**
 * Convert raw rows to typed, enriched events.
 * Input rows are newest-first; output is sorted oldest-first.
 */
export function buildEvents(rawRows: RawRow[]): ParsedEvent[] {
  // Restore chronological ledger order, including rows in the same second.
  return sortRawRows(rawRows)
    .reverse()
    .map((row): ParsedEvent | null => {
      const { action } = row

      const isCommission = action.startsWith('Commission for:')
      const isEntryComm = isCommission && action.includes('Enter position')
      const isExitComm = isCommission && !isEntryComm // "Commission for: Close ..."

      const type: EventType =
        isEntryComm ? 'entryCommission' : isExitComm ? 'exitCommission' : 'trade'

      // Parse timestamp — "2026-03-31 01:58:24" (local, no tz in the export)
      const time = new Date(row.heure.replace(' ', 'T'))
      if (isNaN(time.getTime())) return null

      return {
        time,
        type,
        symbol: sym(action),
        pnl: row.pnl,
        balanceBefore: row.balanceAvant,
        balanceAfter: row.balanceApres,
        direction: dir(action),
        price: price(action),
        avgEntryPrice: avgPrice(action),
        units: units(action),
        action,
      }
    })
    .filter((e): e is ParsedEvent => e !== null)
}

// ── buildTrades ─────────────────────────────────────────────────────────────

interface OpenPosition {
  symbol: string
  entryTime: Date
  entryPrice: number
  totalUnits: number
  remainingUnits: number
  entryCommission: number
  direction?: 'long' | 'short'
  closes: TradeClose[]
}

function weightedAvgExit(closes: TradeClose[]): number {
  const total = closes.reduce((s, c) => s + c.units, 0)
  if (total === 0) return 0
  return closes.reduce((s, c) => s + c.exitPrice * c.units, 0) / total
}

/**
 * Assemble a chronological event stream into complete round-trip trades.
 *
 * Rules:
 * - An `entryCommission` event opens a position slot (FIFO per symbol).
 * - A `trade` (close) event consumes units from open slots, oldest first.
 * - When a slot's remaining units reach 0 (±0.5 unit tolerance), the trade
 *   is complete and emitted.
 * - Exit commissions are matched to their close events by (symbol, timestamp).
 */
export function buildTrades(events: ParsedEvent[]): Trade[] {
  // Index exit commissions by "symbol_timestampMs" for O(1) lookup
  const exitCommByKey = new Map<string, Array<{ pnl: number; idx: number; action: string }>>()
  events.forEach((ev, idx) => {
    if (ev.type !== 'exitCommission') return
    const key = `${ev.symbol}_${ev.time.getTime()}`
    const arr = exitCommByKey.get(key) ?? []
    arr.push({ pnl: ev.pnl, idx, action: ev.action.replace(/^Commission for:\s*/i, '') })
    exitCommByKey.set(key, arr)
  })

  const openPositions = new Map<string, OpenPosition[]>() // symbol → FIFO queue
  const completedTrades: Trade[] = []
  const usedCommIdx = new Set<number>()

  for (const event of events) {
    // ── Open a new position ──────────────────────────────────────────────
    if (event.type === 'entryCommission') {
      const queue = openPositions.get(event.symbol) ?? []
      queue.push({
        symbol: event.symbol,
        entryTime: event.time,
        entryPrice: event.price ?? 0,
        totalUnits: event.units ?? 0,
        remainingUnits: event.units ?? 0,
        entryCommission: event.pnl, // negative
        closes: [],
      })
      openPositions.set(event.symbol, queue)
      continue
    }

    if (event.type !== 'trade') continue

    // ── Resolve exit commission for this close ───────────────────────────
    const commKey = `${event.symbol}_${event.time.getTime()}`
    const candidates = exitCommByKey.get(commKey) ?? []
    const commMatch = candidates.find((c) => !usedCommIdx.has(c.idx) && c.action === event.action)
    const exitCommissionTotal = commMatch?.pnl ?? 0
    if (commMatch) usedCommIdx.add(commMatch.idx)

    const closeUnits = event.units ?? 0
    if (closeUnits === 0) continue

    // ── Assign close units to open positions (FIFO) ─────────────────────
    let remaining = closeUnits
    const queue = openPositions.get(event.symbol) ?? []

    while (remaining > 0.001 && queue.length > 0) {
      const open = queue[0]

      // Direction is on the close row (not the entry commission row)
      if (event.direction && !open.direction) {
        open.direction = event.direction
      }

      const assigned = Math.min(remaining, open.remainingUnits)
      remaining -= assigned
      open.remainingUnits -= assigned

      // Split PnL and commission proportionally to assigned units
      const ratio = assigned / closeUnits
      open.closes.push({
        time: event.time,
        exitPrice: event.price ?? 0,
        units: assigned,
        grossPnl: event.pnl * ratio,
        exitCommission: exitCommissionTotal * ratio,
        netPnl: (event.pnl + exitCommissionTotal) * ratio,
      })

      // Position fully closed (allow ±0.5 unit floating-point slack)
      if (open.remainingUnits < 0.5) {
        const grossPnl = open.closes.reduce((s, c) => s + c.grossPnl, 0)
        const exitCommissions = open.closes.reduce((s, c) => s + c.exitCommission, 0)
        const totalCommission = open.entryCommission + exitCommissions

        completedTrades.push({
          id: `${open.symbol}_${open.entryTime.getTime()}_${completedTrades.length}`,
          symbol: open.symbol,
          direction: open.direction ?? 'long',
          openTime: open.entryTime,
          closeTime: open.closes[open.closes.length - 1].time,
          entryPrice: open.entryPrice,
          avgExitPrice: weightedAvgExit(open.closes),
          totalUnits: open.totalUnits,
          grossPnl,
          entryCommission: open.entryCommission,
          exitCommissions,
          totalCommission,
          netPnl: grossPnl + totalCommission,
          win: grossPnl > 0,
          closes: open.closes,
        })

        queue.shift()
      }
    }

    if (queue.length === 0) openPositions.delete(event.symbol)
    else openPositions.set(event.symbol, queue)
  }

  return completedTrades
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Full pipeline: CSV text → { rawRows, trades }.
 * This is the function to call from the upload handler.
 */
export function parseCSV(csvText: string): {
  rawRows: RawRow[]
  trades: Trade[]
} {
  const rawRows = parseRawRows(csvText)
  const events = buildEvents(rawRows)
  const trades = buildTrades(events)
  return { rawRows, trades }
}
