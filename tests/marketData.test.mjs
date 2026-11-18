import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getMarketData,
  marketHttpHandler,
  parseFxRates,
  parseMarketQuery,
  parsePositioning,
  parseStrength,
  parseTreasuryXml,
  parseWatchQuote
} from '../server/marketData.mjs'

test('market query only accepts supported currencies, distinct pairs and bounded history', () => {
  assert.deepEqual(
    parseMarketQuery(new URLSearchParams('pair=eur%2Fusd&years=20')),
    { pair: 'EURUSD', years: 20 }
  )
  for (const query of [
    'pair=EURUSD&years=100',
    'pair=USDUSD',
    'pair=http://example.com',
    'pair=XAUUSD',
    'years=0'
  ]) {
    assert.throws(() => parseMarketQuery(new URLSearchParams(query)))
  }
})

test('FX parser sorts, deduplicates, rejects invalid dates/quotes and ignores future data', () => {
  const row = (date, rate, base = 'EUR', quote = 'USD') => ({
    date,
    rate,
    base,
    quote
  })
  assert.deepEqual(
    parseFxRates(
      [
        row('2026-11-16', 1.1),
        row('2026-11-13', 1.09),
        row('2026-11-16', 1.11),
        row('2026-11-18', 1.2),
        row('2026-02-30', 1),
        row('2026-11-12', null),
        row('2026-11-11', -2),
        row('2026-11-10', 1.2, 'GBP')
      ],
      'EUR',
      'USD',
      '2026-11-17'
    ),
    [
      { date: '2026-11-13', close: 1.09 },
      { date: '2026-11-16', close: 1.11 }
    ]
  )
  assert.throws(() =>
    parseFxRates({ error: 'blocked' }, 'EUR', 'USD', '2026-11-17')
  )
})

test('Treasury daily change is in basis points and unavailable maturities remain null', () => {
  const entry = (date, two, ten) =>
    `<entry><d:NEW_DATE m:type="Edm.DateTime">${date}T00:00:00</d:NEW_DATE><d:BC_2YEAR m:type="Edm.Double">${two}</d:BC_2YEAR><d:BC_10YEAR m:type="Edm.Double">${ten}</d:BC_10YEAR><d:BC_30YEAR m:null="true" /></entry>`
  const result = parseTreasuryXml(
    `<feed>${entry('2026-11-16', 4.83, 5.12)}${entry('2026-11-13', 4.8, 5.15)}${entry('2026-11-18', 6, 6)}</feed>`,
    '2026-11-17'
  )
  assert.equal(result.asOf, '2026-11-16')
  assert.equal(result.previousAsOf, '2026-11-13')
  assert.deepEqual(
    result.points.find((point) => point.tenor === '2Y'),
    { tenor: '2Y', yield: 4.83, changeBps: 3 }
  )
  assert.deepEqual(
    result.points.find((point) => point.tenor === '10Y'),
    { tenor: '10Y', yield: 5.12, changeBps: -3 }
  )
  assert.deepEqual(
    result.points.find((point) => point.tenor === '30Y'),
    { tenor: '30Y', yield: null, changeBps: null }
  )
  assert.throws(() => parseTreasuryXml('<html>blocked</html>', '2026-11-17'))
})

test('COT selects latest futures-only observation per currency and excludes spreading from directional percent', () => {
  const row = (date, long, short, type = 'FutOnly') => ({
    report_date_as_yyyy_mm_dd: date,
    cftc_contract_market_code: '099741',
    contract_market_name: 'EURO FX',
    lev_money_positions_long: long,
    lev_money_positions_short: short,
    change_in_lev_money_long: '15',
    change_in_lev_money_short: '-5',
    open_interest_all: '200',
    futonly_or_combined: type
  })
  const result = parsePositioning(
    [
      row('2026-11-03', '10', '50'),
      row('2026-11-10', '75', '25'),
      row('2026-11-17', '100', '0', 'Combined')
    ],
    '2026-11-17'
  )
  assert.equal(result.points.length, 1)
  assert.equal(result.points[0].currency, 'EUR')
  assert.equal(result.points[0].asOf, '2026-11-10')
  assert.equal(result.points[0].net, 50)
  assert.equal(result.points[0].longPercent, 75)
  assert.equal(result.points[0].changeNet, 20)
})

test('strength correctly inverts USD-base rates and aligns all currencies to common observations', () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    base: 'USD',
    quote: 'EUR',
    date: `2026-11-${String(10 + index).padStart(2, '0')}`,
    rate: 1 / (1 + index / 100)
  }))
  const result = parseStrength(rows, '2026-11-17')
  assert.equal(result.benchmark, 'USD')
  assert.equal(result.weekAsOf, '2026-11-10')
  assert.ok(
    Math.abs(
      result.points.find((point) => point.currency === 'EUR').change5d - 5
    ) < 1e-10
  )
  assert.equal(
    result.points.find((point) => point.currency === 'JPY').change5d,
    null
  )
  assert.equal(
    result.points.find((point) => point.currency === 'USD').change5d,
    0
  )
})

test('watchlist uses consecutive daily closes, ignores unfinished today bar and whole-range previous close', () => {
  const quote = {
    chart: {
      result: [
        {
          meta: { currency: 'USD', chartPreviousClose: 10 },
          timestamp: ['2026-11-13', '2026-11-16', '2026-11-17'].map(
            (date) => Date.parse(date) / 1000
          ),
          indicators: { quote: [{ close: [100, 105, 150] }] }
        }
      ]
    }
  }
  const point = parseWatchQuote(
    quote,
    { symbol: '^GSPC', label: 'S&P 500', kind: 'index' },
    '2026-11-17'
  )
  assert.equal(point.close, 105)
  assert.equal(point.asOf, '2026-11-16')
  assert.ok(Math.abs(point.changePct - 5) < 1e-10)
})

test('all upstream failures produce explicit empty sections rather than fabricated observations', async () => {
  let requests = 0
  const result = await getMarketData(
    { pair: 'GBPJPY', years: 5 },
    {
      now: new Date('2026-11-17T12:00:00Z'),
      useCache: false,
      fetchImpl: async () => {
        requests++
        throw new Error('Network unavailable')
      }
    }
  )
  assert.equal(result.pair, 'GBPJPY')
  for (const key of ['fx', 'yields', 'positioning', 'strength']) {
    assert.equal(result[key].asOf, null)
    assert.equal(result[key].points.length, 0)
    assert.ok(result[key].error)
  }
  assert.equal(result.watchlist.points.length, 6)
  assert.ok(
    result.watchlist.points.every(
      (point) => point.close === null && point.error
    )
  )
  assert.equal(requests, 10)
})

test('HTTP adapter rejects write methods and invalid requests before fetching', async () => {
  function response() {
    return {
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value
      },
      end(body) {
        this.body = JSON.parse(body)
      }
    }
  }
  const method = response()
  await marketHttpHandler({ method: 'POST', url: '/api/market' }, method)
  assert.equal(method.statusCode, 405)
  assert.equal(method.headers.Allow, 'GET')
  const invalid = response()
  await marketHttpHandler(
    { method: 'GET', url: '/api/market?pair=BTCUSD' },
    invalid
  )
  assert.equal(invalid.statusCode, 400)
})
