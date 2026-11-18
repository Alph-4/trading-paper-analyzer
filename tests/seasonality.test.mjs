import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildSeasonality,
  analyzeWindow,
  screenSeasonalWindows
} from '../src/lib/seasonality.ts'

const now = new Date('2026-11-17T12:00:00Z')
const DAY = 86_400_000
function dailyYear(year, price = (_, index) => 100 + index / 10) {
  const result = []
  let index = 0
  for (
    let time = Date.UTC(year, 0, 1);
    time < Date.UTC(year + 1, 0, 1);
    time += DAY
  ) {
    const date = new Date(time)
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue
    result.push({
      date: date.toISOString().slice(0, 10),
      close: price(date, index++)
    })
  }
  return result
}

test('historical sample excludes current, future, incomplete and gapped years', () => {
  const full = dailyYear(2025)
  const partial = dailyYear(2024).filter(({ date }) => date < '2024-10-01')
  const gap = dailyYear(2023).filter(
    ({ date }) => date < '2023-06-01' || date > '2023-06-20'
  )
  const result = buildSeasonality(
    [...dailyYear(2026), ...full, ...partial, ...gap, ...dailyYear(2027)],
    4,
    now
  )
  assert.deepEqual(result.years, [2025])
  assert.ok(result.excludedYears.includes(2024))
  assert.ok(result.excludedYears.includes(2023))
  assert.equal(result.curve.length, 365)
  assert.ok(result.curve.every(({ samples }) => samples === 1))
  assert.ok(result.latestYear.at(-1).monthDay <= '11-17')
  assert.equal(result.asOf, '2026-11-17')
})

test('curve is normalized and leap years align by calendar date', () => {
  const result = buildSeasonality(
    [...dailyYear(2024, () => 100), ...dailyYear(2025, () => 200)],
    2,
    now
  )
  assert.equal(result.curve.length, 365)
  assert.equal(
    result.curve.find(({ monthDay }) => monthDay === '02-29'),
    undefined
  )
  assert.equal(
    result.curve.find(({ monthDay }) => monthDay === '03-01').day,
    60
  )
  assert.ok(
    result.curve.every(
      ({ mean, median, samples }) => mean === 0 && median === 0 && samples === 2
    )
  )
})

test('monthly returns use previous month close rather than dropping its first move', () => {
  const points = dailyYear(2025, (date) =>
    date.getUTCMonth() === 0 ? 100 : 110
  )
  const result = buildSeasonality(points, 1, now)
  assert.equal(result.monthly[0].mean, null)
  assert.equal(result.heatmap[0].months[0], null)
  assert.ok(Math.abs(result.monthly[1].mean - 10) < 1e-10)
  assert.equal(result.monthly[1].winRate, 100)
  const priorClose = { date: '2024-12-31', close: 80 }
  assert.equal(
    buildSeasonality([priorClose, ...points], 1, now).monthly[0].mean,
    25
  )
})

test('window rolls weekend boundaries forward and inverts a short at fixed notional', () => {
  const points = dailyYear(2025)
  const options = {
    startMonthDay: '03-01',
    durationDays: 7,
    direction: 'long',
    lookbackYears: 1
  }
  const long = analyzeWindow(points, options, now)
  const short = analyzeWindow(points, { ...options, direction: 'short' }, now)
  assert.equal(long.samples, 1)
  assert.equal(long.observations[0].entryDate, '2025-03-03')
  assert.equal(long.observations[0].exitDate, '2025-03-10')
  assert.ok(long.mean > 0)
  assert.equal(short.mean, -long.mean)
  assert.equal(long.winRate, 100)
  assert.equal(short.winRate, 0)
  assert.equal(long.maxDrawdown, 0)
  assert.ok(short.maxDrawdown > 0)
})

test('cross-year windows require fully observed years and never use current-year prices', () => {
  const result = analyzeWindow(
    [...dailyYear(2024), ...dailyYear(2025), ...dailyYear(2026)],
    {
      startMonthDay: '12-15',
      durationDays: 30,
      direction: 'long',
      lookbackYears: 2
    },
    now
  )
  assert.equal(result.samples, 1)
  assert.equal(result.observations[0].year, 2024)
  assert.equal(result.observations[0].exitDate, '2025-01-14')
})

test('February 29 window maps to February 28 in non-leap years', () => {
  const result = analyzeWindow(
    [...dailyYear(2024), ...dailyYear(2025)],
    {
      startMonthDay: '02-29',
      durationDays: 7,
      direction: 'long',
      lookbackYears: 2
    },
    now
  )
  assert.deepEqual(
    result.observations.map(({ entryDate }) => entryDate),
    ['2024-02-29', '2025-02-28']
  )
})

test('invalid and duplicate observations cannot create false years or overweight samples', () => {
  const year = dailyYear(2025)
  const result = buildSeasonality(
    [
      ...year,
      ...year,
      { date: '2025-02-30', close: 1 },
      { date: '2025-07-01', close: NaN },
      { date: '2025-12-30', close: -1 }
    ],
    1,
    now
  )
  assert.equal(result.coverage[0].points, year.length)
  assert.equal(result.curve[0].samples, 1)
})

test('empty sample has unavailable statistics and screener sorts descriptive outcomes', () => {
  const options = {
    startMonthDay: '11-17',
    durationDays: 30,
    direction: 'long'
  }
  const empty = analyzeWindow([], options, now)
  assert.equal(empty.samples, 0)
  assert.equal(empty.mean, null)
  assert.equal(empty.winRate, null)
  assert.equal(empty.maxDrawdown, null)
  assert.deepEqual(buildSeasonality([], 10, now).curve, [])
  const screen = screenSeasonalWindows(
    dailyYear(2025),
    { startMonthDay: '06-01', durations: [7, 30], lookbackYears: 1 },
    now
  )
  assert.equal(screen.length, 4)
  assert.ok(screen[0].mean > screen[1].mean)
  assert.equal(screen[0].direction, 'long')
  assert.equal(screen.at(-1).direction, 'short')
})

test('invalid window options fail explicitly and lookback is capped at twenty years', () => {
  for (const options of [
    { startMonthDay: '02-30', durationDays: 7, direction: 'long' },
    { startMonthDay: '06-01', durationDays: 0, direction: 'long' },
    { startMonthDay: '06-01', durationDays: 181, direction: 'long' },
    { startMonthDay: '06-01', durationDays: 7, direction: 'buy' }
  ])
    assert.throws(() => analyzeWindow([], options, now), RangeError)
  assert.equal(buildSeasonality([], 100, now).coverage.length, 20)
})
