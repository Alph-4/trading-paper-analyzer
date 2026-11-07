import type { RawRow } from './types'

/** Balances distinguish separate fills even when timestamp, symbol and amount match. */
export function rowKey(row: RawRow): string {
  return JSON.stringify([row.heure, row.balanceAvant, row.balanceApres, row.pnl, row.devise, row.action])
}

/** Newest first, following the balance ledger for operations in the same second. */
export function sortRawRows(rows: RawRow[]): RawRow[] {
  const groups = new Map<string, RawRow[]>()
  for (const row of rows) {
    const group = groups.get(row.heure) ?? []
    group.push(row)
    groups.set(row.heure, group)
  }
  const chronological: RawRow[] = []
  for (const [, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    // Deterministic tie breaking also makes import order irrelevant.
    const pending = new Set([...group].sort((a, b) => rowKey(a).localeCompare(rowKey(b))))
    while (pending.size > 0) {
      let row = [...pending].find((candidate) => ![...pending].some((other) =>
        other !== candidate && other.balanceApres === candidate.balanceAvant)) ?? pending.values().next().value!
      while (pending.has(row)) {
        pending.delete(row)
        chronological.push(row)
        const next = [...pending].find((candidate) => candidate.balanceAvant === row.balanceApres)
        if (!next) break
        row = next
      }
    }
  }
  return chronological.reverse()
}

export function mergeRows(existing: RawRow[], incoming: RawRow[]): {
  rawRows: RawRow[]
  addedRows: number
  duplicateRows: number
} {
  const unique = new Map(existing.map((row) => [rowKey(row), row]))
  let addedRows = 0
  for (const row of incoming) {
    const key = rowKey(row)
    if (unique.has(key)) continue
    unique.set(key, row)
    addedRows++
  }
  const rawRows = sortRawRows([...unique.values()])
  if (new Set(rawRows.map((row) => row.devise)).size > 1) {
    throw new Error('Les devises de compte sont différentes. La fusion a été annulée.')
  }
  return { rawRows, addedRows, duplicateRows: incoming.length - addedRows }
}
