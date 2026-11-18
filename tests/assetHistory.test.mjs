import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildHistoryUrl,
  getAssetHistory,
  historyHttpHandler,
  parseAssetHistory,
  parseHistoryQuery
} from '../server/assetHistory.mjs'

function history({
  ticker = '^GSPC',
  dates = ['2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18'],
  closes = [100, 105, 110, 115],
  adjusted = [90, 94.5, 99, 103.5]
} = {}) {
  return {
    chart: {
      result: [
        {
          meta: { symbol: ticker, currency: 'USD' },
          timestamp: dates.map((date) => Date.parse(date) / 1000),
          indicators: {
            quote: [{ close: closes }],
            ...(adjusted ? { adjclose: [{ adjclose: adjusted }] } : {})
          }
        }
      ]
    }
  }
}

test('history whitelist rejects arbitrary symbols, urls, object keys and excessive periods', () => {
  assert.deepEqual(
    parseHistoryQuery(new URLSearchParams('symbol=gold&years=20')),
    { symbol: 'GOLD', years: 20 }
  )
  for (const query of [
    'symbol=EURUSD',
    'symbol=BTC-USD',
    'symbol=toString',
    'symbol=__proto__',
    'symbol=https://example.com',
    'symbol=GOLD&years=100',
    'years=0'
  ])
    assert.throws(() => parseHistoryQuery(new URLSearchParams(query)))
})

test('history requests contain full closed years plus a previous-December buffer and only the whitelisted upstream ticker', () => {
  const url = buildHistoryUrl('GOLD', 10, new Date('2026-11-17T13:00:00Z'))
  assert.equal(url.origin, 'https://query1.finance.yahoo.com')
  assert.equal(decodeURIComponent(url.pathname).split('/').at(-1), 'GC=F')
  assert.equal(
    new Date(Number(url.searchParams.get('period1')) * 1000).toISOString(),
    '2015-12-25T00:00:00.000Z'
  )
  assert.equal(
    new Date(Number(url.searchParams.get('period2')) * 1000).toISOString(),
    '2026-11-18T00:00:00.000Z'
  )
  assert.equal(url.searchParams.get('interval'), '1d')
  assert.equal(url.searchParams.get('includeAdjustedClose'), 'true')
})

test('adjusted close takes precedence, daily today/future bars are excluded', () => {
  const result = parseAssetHistory(history(), 'SPX', '2026-11-17')
  assert.equal(result.adjusted, true)
  assert.equal(result.adjustment, 'provider-adjusted-close')
  assert.equal(result.asOf, '2026-11-16')
  assert.deepEqual(result.points, [
    { date: '2026-11-13', close: 90 },
    { date: '2026-11-16', close: 94.5 }
  ])
})

test('missing adjusted values stay absent instead of mixing raw and adjusted observations', () => {
  const result = parseAssetHistory(
    history({
      dates: ['2026-11-12', '2026-11-13', '2026-11-16'],
      closes: [100, 102, 105],
      adjusted: [90, null, 94.5]
    }),
    'SPX',
    '2026-11-17'
  )
  assert.deepEqual(result.points, [
    { date: '2026-11-12', close: 90 },
    { date: '2026-11-16', close: 94.5 }
  ])
})

test('raw fallback is explicit and futures warnings preserve roll/spot limitations', () => {
  const result = parseAssetHistory(
    history({ ticker: 'GC=F', adjusted: null }),
    'GOLD',
    '2026-11-17'
  )
  assert.equal(result.adjusted, false)
  assert.equal(result.adjustment, 'raw-close')
  assert.match(result.note, /roll/)
  assert.match(result.note, /XAU\/USD spot/)
})

test('malformed responses, wrong tickers and all-invalid observations fail safely', () => {
  assert.throws(() =>
    parseAssetHistory(
      { chart: { error: { code: 'blocked' } } },
      'SPX',
      '2026-11-17'
    )
  )
  assert.throws(() =>
    parseAssetHistory(history({ ticker: '^NDX' }), 'SPX', '2026-11-17')
  )
  assert.throws(() =>
    parseAssetHistory(
      history({
        adjusted: [null, false, NaN, -1],
        closes: [null, false, NaN, -1]
      }),
      'SPX',
      '2026-11-17'
    )
  )
})

test('network failure is empty and retryable; a successful result is cached', async () => {
  const options = {
    now: new Date('2026-11-17T13:00:00Z'),
    useCache: false,
    fetchImpl: async () => {
      throw new Error('offline')
    }
  }
  const failed = await getAssetHistory({ symbol: 'SPX', years: 10 }, options)
  assert.equal(failed.asOf, null)
  assert.deepEqual(failed.points, [])
  assert.match(failed.error, /CSV/)
  let calls = 0
  const working = {
    now: options.now,
    fetchImpl: async () => {
      calls++
      return { ok: true, text: async () => JSON.stringify(history()) }
    }
  }
  const first = await getAssetHistory({ symbol: 'SPX', years: 10 }, working)
  const second = await getAssetHistory({ symbol: 'SPX', years: 10 }, working)
  assert.equal(first.asOf, '2026-11-16')
  assert.deepEqual(first, second)
  assert.equal(calls, 1)
})

test('HTTP history rejects writes and invalid parameters without touching upstream', async () => {
  const response = () => ({
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value
    },
    end(body) {
      this.body = JSON.parse(body)
    }
  })
  const invalid = response()
  await historyHttpHandler(
    { method: 'GET', url: '/api/history?symbol=BTC' },
    invalid
  )
  assert.equal(invalid.statusCode, 400)
  const write = response()
  await historyHttpHandler({ method: 'POST', url: '/api/history' }, write)
  assert.equal(write.statusCode, 405)
  assert.equal(write.headers.Allow, 'GET')
})
