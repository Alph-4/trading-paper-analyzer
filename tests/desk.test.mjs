import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePriceHistory, riskBudget, parisDay } from '../src/lib/desk.ts'

function history() {
  return Array.from({ length: 230 }, (_, i) => [
    new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10),
    100 + i / 10
  ])
}

test('daily price CSV supports localized semicolon exports, preserves closes and sorts dates', () => {
  const csv = [
    'Date;Close',
    ...history()
      .reverse()
      .map(([date, close]) => `${date};"${String(close).replace('.', ',')}"`)
  ].join('\n')
  const result = parsePriceHistory(csv)
  assert.equal(result.length, 230)
  assert.deepEqual(result[0], { date: '2024-01-01', close: 100 })
  assert.equal(result[229].close, 122.9)
})

test('invalid dates, prices, duplicate days, short files and missing columns fail explicitly', () => {
  const rows = history().map((row) => row.join(','))
  assert.throws(
    () =>
      parsePriceHistory('Date,Close\n' + ['2024-02-30,5', ...rows].join('\n')),
    /Ligne 2/
  )
  assert.throws(
    () =>
      parsePriceHistory('Date,Close\n' + ['2023-12-31,-1', ...rows].join('\n')),
    /invalide/
  )
  assert.throws(
    () => parsePriceHistory('Date,Close\n' + [...rows, rows[0]].join('\n')),
    /Plusieurs/
  )
  assert.throws(() => parsePriceHistory('Date,Close\n2024-01-01,1'), /200/)
  assert.throws(
    () => parsePriceHistory('Date,Open\n' + rows.join('\n')),
    /requises/
  )
})

test('equity CSV uses adjusted close when the provider also includes an unadjusted close', () => {
  const rows = history().map(([date, close]) => `${date},999,${close}`)
  assert.equal(
    parsePriceHistory('Date,Close,Adj Close\n' + rows.join('\n'))[0].close,
    100
  )
})

test('linear risk estimate is account-currency notional, and invalid input never becomes a zero budget', () => {
  assert.deepEqual(riskBudget(10000, 0.5, 1), { budget: 50, notional: 5000 })
  for (const values of [
    [0, 0.5, 1],
    [100, 0, 1],
    [100, 0.5, 0],
    [100, 101, 1],
    [100, 1, 101],
    [NaN, 1, 1],
    [100, 1, Infinity]
  ])
    assert.equal(riskBudget(...values), null)
})

test('journal day uses Paris across UTC midnight and daylight saving', () => {
  assert.equal(parisDay(new Date('2026-11-16T23:30:00Z')), '2026-11-17')
  assert.equal(parisDay(new Date('2026-07-01T22:30:00Z')), '2026-07-02')
})
