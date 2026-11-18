// Public daily/weekly data only. Never treat these observations as executable quotes.
const ECB_API = 'https://api.frankfurter.dev/v2/providers/ecb/rates'
const TREASURY_API =
  'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml'
const CFTC_API = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json'
const WATCHLIST = [
  { symbol: '^GSPC', label: 'S&P 500', kind: 'index' },
  { symbol: '^NDX', label: 'Nasdaq 100', kind: 'index' },
  { symbol: '^VIX', label: 'VIX', kind: 'volatility-index' },
  { symbol: 'GC=F', label: 'Or · futures COMEX', kind: 'futures' },
  { symbol: 'CL=F', label: 'Pétrole WTI · futures', kind: 'futures' },
  { symbol: 'DX-Y.NYB', label: 'Dollar Index (DXY)', kind: 'index' }
]
export const CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'NZD'
]
const CONTRACTS = {
  '099741': 'EUR',
  '096742': 'GBP',
  '097741': 'JPY',
  '092741': 'CHF',
  '090741': 'CAD',
  232741: 'AUD',
  112741: 'NZD'
}
const TENORS = [
  ['1M', 'BC_1MONTH'],
  ['3M', 'BC_3MONTH'],
  ['6M', 'BC_6MONTH'],
  ['1Y', 'BC_1YEAR'],
  ['2Y', 'BC_2YEAR'],
  ['5Y', 'BC_5YEAR'],
  ['10Y', 'BC_10YEAR'],
  ['30Y', 'BC_30YEAR']
]
const cache = new Map()
const pending = new Map()
const TTL = 30 * 60 * 1000
const DAY = 86400000

export function parseMarketQuery(searchParams) {
  const pair = (searchParams.get('pair') || 'EURUSD')
    .toUpperCase()
    .replace('/', '')
  const years = Number(searchParams.get('years') || 10)
  if (
    !/^[A-Z]{6}$/.test(pair) ||
    !CURRENCIES.includes(pair.slice(0, 3)) ||
    !CURRENCIES.includes(pair.slice(3)) ||
    pair.slice(0, 3) === pair.slice(3)
  ) {
    throw new Error(
      'Paire invalide. Utiliser deux devises différentes parmi EUR, USD, GBP, JPY, CHF, CAD, AUD, NZD.'
    )
  }
  if (![5, 10, 15, 20].includes(years))
    throw new Error('Historique invalide : choisir 5, 10, 15 ou 20 ans.')
  return { pair, years }
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(18000),
    headers: { Accept: 'application/json, application/xml, text/xml;q=0.9' }
  })
  if (!response.ok)
    throw new Error(`Source indisponible (HTTP ${response.status}).`)
  const length = Number(response.headers?.get?.('content-length') || 0)
  if (length > 8_000_000) throw new Error('Réponse source trop volumineuse.')
  const text = await response.text()
  if (text.length > 8_000_000)
    throw new Error('Réponse source trop volumineuse.')
  return text
}

async function cached(key, loader, nowMs) {
  const hit = cache.get(key)
  if (hit && hit.expires > nowMs) return hit.value
  if (pending.has(key)) return pending.get(key)
  const promise = loader()
    .then((value) => {
      // Bounded process cache: arbitrary public query strings cannot grow it forever.
      if (cache.size >= 256) cache.delete(cache.keys().next().value)
      cache.set(key, { value, expires: nowMs + TTL })
      return value
    })
    .finally(() => pending.delete(key))
  pending.set(key, promise)
  return promise
}

function finiteNumber(value) {
  if (value == null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  )
}

export function parseFxRates(rows, base, quote, today) {
  if (!Array.isArray(rows)) throw new Error('Format BCE inattendu.')
  const points = new Map()
  for (const row of rows) {
    const close = finiteNumber(row.rate)
    if (
      row.base === base &&
      row.quote === quote &&
      validDate(row.date) &&
      row.date <= today &&
      close !== null &&
      close > 0
    )
      points.set(row.date, { date: row.date, close })
  }
  const sorted = [...points.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  if (sorted.length < 2)
    throw new Error('Historique BCE insuffisant ou invalide.')
  return sorted
}

export function parseTreasuryXml(xml, today) {
  if (!xml.includes('<feed') || !xml.includes('<entry>'))
    throw new Error('Format Treasury inattendu.')
  const rows = []
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = match[1]
    const date = entry
      .match(/<d:NEW_DATE\b[^>]*>([^<]+)<\/d:NEW_DATE>/)?.[1]
      ?.slice(0, 10)
    if (!validDate(date) || date > today) continue
    const points = TENORS.map(([tenor, key]) => {
      const raw = entry.match(
        new RegExp(`<d:${key}\\b[^>]*>([^<]*)<\\/d:${key}>`)
      )?.[1]
      return { tenor, yield: finiteNumber(raw) }
    })
    if (points.some((point) => point.yield !== null))
      rows.push({ date, points })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  if (!rows.length) throw new Error('Aucune observation Treasury valide.')
  const latest = rows.at(-1)
  const previous = rows.at(-2)
  return {
    asOf: latest.date,
    previousAsOf: previous?.date ?? null,
    points: latest.points.map((point) => {
      const previousYield = previous?.points.find(
        (item) => item.tenor === point.tenor
      )?.yield
      return {
        ...point,
        changeBps:
          point.yield !== null && previousYield != null
            ? Math.round((point.yield - previousYield) * 10000) / 100
            : null
      }
    }),
    history: rows
      .slice(-65)
      .map((row) => ({
        date: row.date,
        ...Object.fromEntries(
          row.points.map((point) => [point.tenor, point.yield])
        )
      }))
  }
}

export function parsePositioning(rows, today) {
  if (!Array.isArray(rows)) throw new Error('Format CFTC inattendu.')
  const points = new Map()
  for (const row of [...rows].sort((a, b) =>
    String(b.report_date_as_yyyy_mm_dd).localeCompare(
      String(a.report_date_as_yyyy_mm_dd)
    )
  )) {
    const currency = CONTRACTS[row.cftc_contract_market_code]
    const asOf = row.report_date_as_yyyy_mm_dd?.slice(0, 10)
    const long = finiteNumber(row.lev_money_positions_long)
    const short = finiteNumber(row.lev_money_positions_short)
    const openInterest = finiteNumber(row.open_interest_all)
    if (
      !currency ||
      points.has(currency) ||
      !validDate(asOf) ||
      asOf > today ||
      row.futonly_or_combined !== 'FutOnly' ||
      long === null ||
      short === null ||
      long < 0 ||
      short < 0
    )
      continue
    const changeLong = finiteNumber(row.change_in_lev_money_long)
    const changeShort = finiteNumber(row.change_in_lev_money_short)
    points.set(currency, {
      currency,
      asOf,
      contract: row.contract_market_name,
      long,
      short,
      net: long - short,
      openInterest,
      longPercent: long + short > 0 ? (100 * long) / (long + short) : null,
      changeNet:
        changeLong !== null && changeShort !== null
          ? changeLong - changeShort
          : null
    })
  }
  if (!points.size)
    throw new Error('Aucune observation CFTC valide pour les devises suivies.')
  return {
    asOf: [...points.values()]
      .map((point) => point.asOf)
      .sort()
      .at(-1),
    points: [...points.values()]
  }
}

export function parseStrength(rows, today) {
  if (!Array.isArray(rows)) throw new Error('Format BCE inattendu.')
  const dates = [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.base === 'USD' && validDate(row.date) && row.date <= today
        )
        .map((row) => row.date)
    )
  ].sort()
  if (dates.length < 6)
    throw new Error('Historique BCE insuffisant pour la force relative.')
  const asOf = dates.at(-1)
  const previousAsOf = dates.at(-2)
  const weekAsOf = dates.at(-6)
  const rate = (currency, date) =>
    finiteNumber(
      rows.find(
        (row) =>
          row.base === 'USD' && row.quote === currency && row.date === date
      )?.rate
    )
  const points = CURRENCIES.map((currency) => {
    if (currency === 'USD') return { currency, change1d: 0, change5d: 0 }
    const latest = rate(currency, asOf)
    const previous = rate(currency, previousAsOf)
    const week = rate(currency, weekAsOf)
    // USD/currency falls when this currency strengthens against USD.
    return {
      currency,
      change1d:
        latest > 0 && previous > 0 ? (previous / latest - 1) * 100 : null,
      change5d: latest > 0 && week > 0 ? (week / latest - 1) * 100 : null
    }
  })
  return { asOf, previousAsOf, weekAsOf, benchmark: 'USD', points }
}

export function parseWatchQuote(data, instrument, today) {
  const result = data?.chart?.result?.[0]
  if (
    data?.chart?.error ||
    !result ||
    !Array.isArray(result.timestamp) ||
    !Array.isArray(result.indicators?.quote?.[0]?.close)
  )
    throw new Error('Format Yahoo Finance inattendu.')
  const prices = result.indicators.quote[0].close
  const points = result.timestamp
    .flatMap((timestamp, index) => {
      const close = finiteNumber(prices[index])
      const date = Number.isFinite(timestamp)
        ? new Date(timestamp * 1000).toISOString().slice(0, 10)
        : ''
      // Ignore today's unfinished daily bar. Never use meta.chartPreviousClose:
      // for a monthly range that is the close preceding the whole range.
      return validDate(date) && date < today && close !== null && close > 0
        ? [{ date, close }]
        : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  if (points.length < 2)
    throw new Error('Historique Yahoo Finance insuffisant.')
  const latest = points.at(-1)
  const previous = points.at(-2)
  return {
    ...instrument,
    close: latest.close,
    asOf: latest.date,
    previousAsOf: previous.date,
    changePct: (latest.close / previous.close - 1) * 100,
    currency: result.meta?.currency || null,
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(instrument.symbol)}/`
  }
}

const FX_META = {
  source: 'BCE via Frankfurter',
  sourceUrl: 'https://frankfurter.dev/',
  frequency: 'daily',
  note: 'Taux de référence quotidiens BCE, sans cotation intraday ni spread.'
}
const YIELD_META = {
  source: 'U.S. Treasury',
  sourceUrl: 'https://home.treasury.gov/treasury-daily-interest-rate-xml-feed',
  frequency: 'daily',
  note: 'Courbe de taux par du Trésor américain ; variation vs observation précédente, en points de base.'
}
const COT_META = {
  source: 'CFTC · TFF Futures Only',
  sourceUrl:
    'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm',
  frequency: 'weekly',
  note: 'Leveraged Funds sur futures de devises contre USD. Positions du mardi, publication généralement le vendredi ; ne mesure pas le sentiment des particuliers. Long % = long / (long + short), hors spreading.'
}
const WATCH_META = {
  source: 'Yahoo Finance',
  sourceUrl: 'https://finance.yahoo.com/',
  frequency: 'daily',
  note: 'Dernières observations journalières antérieures à aujourd’hui (UTC), variation vs observation précédente. Flux public non contractuel, susceptible de blocage ou de révision. Futures or et pétrole : contrats continus non ajustés, différents des prix spot.'
}

async function section(metadata, loader) {
  try {
    return { ...metadata, ...(await loader()) }
  } catch (error) {
    return {
      ...metadata,
      asOf: null,
      points: [],
      error:
        error?.name === 'TimeoutError' || error?.name === 'AbortError'
          ? 'La source a dépassé le délai de réponse. Réessayer ultérieurement.'
          : 'Données momentanément indisponibles. Réessayer ultérieurement.'
    }
  }
}

export async function getMarketData(
  { pair = 'EURUSD', years = 10 } = {},
  { fetchImpl = fetch, now = new Date(), useCache = true } = {}
) {
  // Validate again for callers that do not use the HTTP adapter.
  const query = parseMarketQuery(
    new URLSearchParams({ pair, years: String(years) })
  )
  pair = query.pair
  years = query.years
  const today = now.toISOString().slice(0, 10)
  const year = now.getUTCFullYear()
  const load = (key, loader) =>
    useCache ? cached(`${key}:${today}`, loader, now.getTime()) : loader()
  const json = async (url) => JSON.parse(await fetchText(url, fetchImpl))
  const [fx, yields, positioning, strength, watchlist] = await Promise.all([
    section(FX_META, () =>
      load(`fx:${pair}:${years}`, async () => {
        const url = new URL(ECB_API)
        url.search = new URLSearchParams({
          base: pair.slice(0, 3),
          quotes: pair.slice(3),
          from: `${year - years}-01-01`,
          to: today
        }).toString()
        const points = parseFxRates(
          await json(url),
          pair.slice(0, 3),
          pair.slice(3),
          today
        )
        return { asOf: points.at(-1).date, points }
      })
    ),
    section(YIELD_META, () =>
      load('yields', async () => {
        const url = new URL(TREASURY_API)
        url.search = new URLSearchParams({
          data: 'daily_treasury_yield_curve',
          field_tdr_date_value: String(year)
        }).toString()
        let xml = await fetchText(url, fetchImpl)
        // Early January needs the previous year to calculate a real day-on-day move.
        if (now.getUTCMonth() === 0) {
          url.searchParams.set('field_tdr_date_value', String(year - 1))
          xml = `<feed>${xml}${await fetchText(url, fetchImpl)}</feed>`
        }
        return parseTreasuryXml(xml, today)
      })
    ),
    section(COT_META, () =>
      load('cot', async () => {
        const url = new URL(CFTC_API)
        url.search = new URLSearchParams({
          $select:
            'contract_market_name,cftc_contract_market_code,report_date_as_yyyy_mm_dd,lev_money_positions_long,lev_money_positions_short,change_in_lev_money_long,change_in_lev_money_short,open_interest_all,futonly_or_combined',
          $where: `cftc_contract_market_code in (${Object.keys(CONTRACTS)
            .map((code) => `'${code}'`)
            .join(
              ','
            )}) AND report_date_as_yyyy_mm_dd >= '${new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10)}T00:00:00'`,
          $order: 'report_date_as_yyyy_mm_dd DESC',
          $limit: '100'
        }).toString()
        return parsePositioning(await json(url), today)
      })
    ),
    section(
      {
        ...FX_META,
        note: 'Variation des devises contre USD, sur 1 et 5 observations BCE. USD = référence 0 %, pas un indice pondéré.'
      },
      () =>
        load('strength', async () => {
          const url = new URL(ECB_API)
          url.search = new URLSearchParams({
            base: 'USD',
            quotes: CURRENCIES.filter((currency) => currency !== 'USD').join(
              ','
            ),
            from: new Date(now.getTime() - 30 * DAY).toISOString().slice(0, 10),
            to: today
          }).toString()
          return parseStrength(await json(url), today)
        })
    ),
    section(WATCH_META, () =>
      load('watchlist', async () => {
        const points = await Promise.all(
          WATCHLIST.map(async (instrument) => {
            try {
              const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.symbol)}?interval=1d&range=1mo`
              return parseWatchQuote(await json(url), instrument, today)
            } catch {
              return {
                ...instrument,
                asOf: null,
                close: null,
                changePct: null,
                sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(instrument.symbol)}/`,
                error: 'Observation momentanément indisponible.'
              }
            }
          })
        )
        const dates = points
          .map((point) => point.asOf)
          .filter(Boolean)
          .sort()
        return {
          asOf: dates.at(-1) || null,
          points,
          ...(dates.length
            ? {}
            : { error: 'Données Yahoo Finance momentanément indisponibles.' })
        }
      })
    )
  ])
  return {
    pair,
    years,
    fetchedAt: now.toISOString(),
    fx,
    yields,
    positioning,
    strength,
    watchlist
  }
}

export async function marketHttpHandler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Méthode non autorisée.' }))
    return
  }
  let query
  try {
    query = parseMarketQuery(new URL(req.url, 'http://localhost').searchParams)
  } catch (error) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: error.message }))
    return
  }
  const data = await getMarketData(query)
  const hasError = [
    data.fx,
    data.yields,
    data.positioning,
    data.strength,
    data.watchlist
  ].some((value) => value.error || value.points.some((point) => point.error))
  res.setHeader(
    'Cache-Control',
    hasError ? 'no-store' : 'public, max-age=300, s-maxage=1800'
  )
  res.statusCode = 200
  res.end(JSON.stringify(data))
}
