import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCSV, parseRawRows, buildEvents, buildTrades, exportCSV } from '../src/lib/parser.ts'
import { mergeRows } from '../src/lib/history.ts'
import { createTradeStore, HISTORY_STORAGE_KEY } from '../src/store/useTradeStore.ts'

const enter = 'Commission for: Enter position for symbol FX:EURUSD at price 1.1 for 100 units'
const close = 'Close long position for symbol FX:EURUSD at price 1.2 for 100 units. Position AVG Price was 1.1'
const exit = `Commission for: ${close}`
const rows = [
  ['2026-11-06 10:00:00', 1000, 999, -1, 'USD', enter],
  ['2026-11-06 11:00:00', 999, 1009, 10, 'USD', close],
  ['2026-11-06 11:00:00', 1009, 1008, -1, 'USD', exit],
  ['2026-11-07 10:00:00', 1008, 1007, -1, 'USD', enter],
  ['2026-11-07 11:00:00', 1007, 987, -20, 'USD', close],
  ['2026-11-07 11:00:00', 987, 986, -1, 'USD', exit],
]
const headers = ['Heure', 'Solde avant', 'Solde après', 'P&L réalisé (valeur)', 'P&L réalisé (devise)', 'Action']
function csv(data = rows, fields = headers, delimiter = ',') {
  return [fields, ...data].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(delimiter)).join('\r\n')
}
function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}
const parsed = () => parseRawRows(csv())

test('current French export reads real balances, results and commissions', () => {
  const { rawRows, trades } = parseCSV(csv())
  assert.equal(rawRows.at(-1).balanceAvant, 1000)
  assert.equal(rawRows[0].balanceApres, 986)
  assert.equal(trades.length, 2)
  assert.deepEqual(trades.map((trade) => trade.netPnl), [8, -22])
  assert.deepEqual(trades.map((trade) => trade.win), [true, false])
})

test('legacy French and English exports produce identical source rows', () => {
  const legacy = ['Heure', 'Balance avant', 'Balance après', 'Pertes et profits réalisés (valeur)', 'Pertes et profits réalisés (devise)', 'Action']
  const english = ['Time', 'Balance before', 'Balance after', 'Realized P&L (value)', 'Realized P&L (currency)', 'Action']
  assert.deepEqual(parseRawRows(csv(rows, legacy)), parsed())
  assert.deepEqual(parseRawRows(csv(rows, english)), parsed())
})

test('BOM, case, whitespace, semicolon and localized decimal amounts are accepted', () => {
  const localized = [['2026-11-06 10:00:00', '1 000,50', '999,25', '-1,25', ' usd ', enter]]
  const result = parseRawRows('\uFEFF' + csv(localized, headers.map((header) => ` ${header.toUpperCase()} `), ';'))
  assert.equal(result[0].balanceAvant, 1000.5)
  assert.equal(result[0].pnl, -1.25)
  assert.equal(result[0].devise, 'USD')
})

test('missing columns, amounts, malformed rows and dates cannot silently become zero', () => {
  assert.throws(() => parseRawRows(csv(rows, headers.map((h) => h === 'Solde avant' ? 'Autre' : h))), /Colonne manquante/)
  for (const value of ['', 'NaN', 'Infinity', '12oops']) {
    assert.throws(() => parseRawRows(csv([[...rows[0].slice(0, 3), value, ...rows[0].slice(4)]])), /montant invalide/)
  }
  assert.throws(() => parseRawRows(csv([['2026-02-30 10:00:00', ...rows[0].slice(1)]])), /date/)
  assert.throws(() => parseRawRows(csv([rows[0].slice(0, 5)])), /mal formé/)
  assert.throws(() => parseRawRows(csv([])), /aucune opération/)
})

test('ordering uses the balance chain for same-second rows, independent of input order', () => {
  assert.deepEqual(parseRawRows(csv([...rows].reverse())), parsed())
  const events = buildEvents(parsed())
  assert.deepEqual(events.map((event) => event.balanceAfter), [999, 1009, 1008, 1007, 987, 986])
})

test('repeated and overlapping imports ignore duplicates, including within a file', () => {
  const memory = memoryStorage()
  const store = createTradeStore(() => memory)
  const first = store.getState().importRows([...parsed(), ...parsed()])
  assert.equal(first.addedRows, 6)
  assert.equal(first.duplicateRows, 6)
  const again = store.getState().importRows(parsed())
  assert.equal(again.addedRows, 0)
  assert.equal(again.duplicateRows, 6)
  assert.equal(store.getState().trades.length, 2)
})

test('separate fills with identical timestamp and action are kept when balances differ', () => {
  const first = parsed()[0]
  const other = { ...first, balanceAvant: 2000, balanceApres: 1999 }
  assert.equal(mergeRows([], [first, other, first]).rawRows.length, 2)
})

test('same-second close commissions are matched to the actual close action', () => {
  const secondClose = close.replace('at price 1.2', 'at price 1.3')
  const data = [
    rows[0],
    ['2026-11-06 10:30:00', 999, 998, -1, 'USD', enter],
    ['2026-11-06 11:00:00', 998, 1008, 10, 'USD', close],
    ['2026-11-06 11:00:00', 1008, 1028, 20, 'USD', secondClose],
    ['2026-11-06 11:00:00', 1028, 1026, -2, 'USD', `Commission for: ${secondClose}`],
    ['2026-11-06 11:00:00', 1026, 1025, -1, 'USD', exit],
  ]
  assert.deepEqual(parseCSV(csv(data)).trades.map((trade) => trade.netPnl), [8, 17])
})

test('split exports reconstruct trades in either import order and retain unmatched entries', () => {
  const older = parseRawRows(csv(rows.slice(0, 1)))
  const newer = parseRawRows(csv(rows.slice(1)))
  for (const [first, second] of [[older, newer], [newer, older]]) {
    const memory = memoryStorage()
    const store = createTradeStore(() => memory)
    store.getState().importRows(first)
    store.getState().importRows(second)
    assert.deepEqual(store.getState().rawRows, parsed())
    assert.deepEqual(store.getState().trades, buildTrades(buildEvents(parsed())))
  }
})

test('reload restores actual Date objects and analytics-ready trades from source rows', () => {
  const memory = memoryStorage()
  const store = createTradeStore(() => memory)
  store.getState().importRows(parsed())
  const restored = createTradeStore(() => memory).getState()
  assert.equal(restored.isLoaded, true)
  assert.equal(restored.storageError, null)
  assert.deepEqual(restored.trades, store.getState().trades)
  assert.ok(restored.trades[0].openTime instanceof Date)
  assert.ok(restored.trades[0].closes[0].time instanceof Date)
  assert.deepEqual(Object.keys(JSON.parse(memory.getItem(HISTORY_STORAGE_KEY))), ['version', 'rawRows'])
})

test('CSV backup is lossless and can be imported without duplicating saved trades', () => {
  const restored = parseRawRows(exportCSV(parsed()))
  assert.deepEqual(restored, parsed())
  assert.equal(mergeRows(parsed(), restored).addedRows, 0)
})

test('failed persistence leaves both previous state and saved history unchanged', () => {
  const memory = memoryStorage()
  const store = createTradeStore(() => memory)
  store.getState().importRows(parseRawRows(csv(rows.slice(0, 3))))
  const before = store.getState()
  const saved = memory.getItem(HISTORY_STORAGE_KEY)
  memory.setItem = () => { throw new Error('QuotaExceededError') }
  assert.throws(() => store.getState().importRows(parsed()), /Import annulé/)
  assert.equal(store.getState(), before)
  assert.equal(memory.getItem(HISTORY_STORAGE_KEY), saved)
})

test('corrupt or incompatible archives are reported and never overwritten by import', () => {
  for (const saved of ['{broken', JSON.stringify({ version: 2, rawRows: [] }), JSON.stringify({ version: 1, rawRows: [{}] })]) {
    const memory = memoryStorage()
    memory.setItem(HISTORY_STORAGE_KEY, saved)
    const store = createTradeStore(() => memory)
    assert.ok(store.getState().storageError)
    assert.equal(store.getState().isLoaded, false)
    assert.throws(() => store.getState().importRows(parsed()))
    assert.equal(memory.getItem(HISTORY_STORAGE_KEY), saved)
  }
})

test('unavailable browser storage is reported and cannot claim a successful import', () => {
  const store = createTradeStore(() => { throw new Error('Storage blocked') })
  assert.ok(store.getState().storageError)
  assert.throws(() => store.getState().importRows(parsed()), /Storage blocked/)
  assert.equal(store.getState().isLoaded, false)
})

test('an import from another tab is merged before saving', () => {
  const memory = memoryStorage()
  const first = createTradeStore(() => memory)
  const second = createTradeStore(() => memory)
  first.getState().importRows(parseRawRows(csv(rows.slice(0, 3))))
  second.getState().importRows(parseRawRows(csv(rows.slice(3))))
  assert.deepEqual(second.getState().rawRows, parsed())
})

test('different account currencies cannot be silently combined', () => {
  const memory = memoryStorage()
  const store = createTradeStore(() => memory)
  store.getState().importRows(parsed())
  const before = memory.getItem(HISTORY_STORAGE_KEY)
  assert.throws(() => store.getState().importRows(parsed().map((row) => ({ ...row, devise: 'EUR' }))), /devises/)
  assert.equal(memory.getItem(HISTORY_STORAGE_KEY), before)
})

test('explicit reset removes the saved archive and prevents restoration on reload', () => {
  const memory = memoryStorage()
  const store = createTradeStore(() => memory)
  store.getState().importRows(parsed())
  store.getState().reset()
  assert.equal(memory.getItem(HISTORY_STORAGE_KEY), null)
  assert.equal(store.getState().isLoaded, false)
  assert.deepEqual(createTradeStore(() => memory).getState().trades, [])
})
