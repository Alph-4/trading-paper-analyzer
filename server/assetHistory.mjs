const ASSETS = {
  SPX: {
    ticker: '^GSPC',
    label: 'S&P 500 · indice de prix',
    note: 'Indice de prix S&P 500, sans réinvestissement des dividendes.'
  },
  NDX: {
    ticker: '^NDX',
    label: 'Nasdaq 100 · indice de prix',
    note: 'Indice de prix Nasdaq 100, sans réinvestissement des dividendes.'
  },
  DAX: {
    ticker: '^GDAXI',
    label: 'DAX · indice de performance',
    note: 'DAX de performance, intégrant le réinvestissement des dividendes ; différent d’un indice de prix.'
  },
  GOLD: {
    ticker: 'GC=F',
    label: 'Or · futures COMEX',
    note: 'Futures or COMEX, différents de XAU/USD spot. Série raccordée par le fournisseur : ajustement des changements de contrats non garanti, effets de roll possibles.'
  }
}
const TTL = 30 * 60 * 1000
const DAY = 86400000
const cache = new Map()
const pending = new Map()

export function parseHistoryQuery(searchParams) {
  const symbol = (searchParams.get('symbol') || 'SPX').toUpperCase()
  const years = Number(searchParams.get('years') || 10)
  if (!Object.hasOwn(ASSETS, symbol))
    throw new Error('Actif invalide : choisir SPX, NDX, DAX ou GOLD.')
  if (![5, 10, 15, 20].includes(years))
    throw new Error('Historique invalide : choisir 5, 10, 15 ou 20 ans.')
  return { symbol, years }
}

export function historySourceUrl(symbol) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(ASSETS[symbol].ticker)}/history/`
}

export function buildHistoryUrl(symbol, years, now) {
  const query = parseHistoryQuery(
    new URLSearchParams({ symbol, years: String(years) })
  )
  const from = new Date(
    Date.UTC(now.getUTCFullYear() - query.years, 0, 1) - 7 * DAY
  )
  const end =
    new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`).getTime() + DAY
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ASSETS[query.symbol].ticker)}`
  )
  url.search = new URLSearchParams({
    period1: String(Math.floor(from.getTime() / 1000)),
    period2: String(Math.floor(end / 1000)),
    interval: '1d',
    includeAdjustedClose: 'true'
  }).toString()
  return url
}

function positiveNumber(value) {
  if (
    value == null ||
    typeof value === 'boolean' ||
    String(value).trim() === ''
  )
    return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function parseAssetHistory(data, symbol, today) {
  const asset = ASSETS[symbol]
  if (!asset) throw new Error('Actif invalide.')
  const result = data?.chart?.result?.[0]
  if (
    data?.chart?.error ||
    !Array.isArray(result?.timestamp) ||
    result.timestamp.length > 12000 ||
    (result.meta?.symbol && result.meta.symbol !== asset.ticker)
  )
    throw new Error('Historique fournisseur invalide.')
  const adjustedPrices = result.indicators?.adjclose?.[0]?.adjclose
  const rawPrices = result.indicators?.quote?.[0]?.close
  const adjusted =
    Array.isArray(adjustedPrices) &&
    adjustedPrices.some((value) => positiveNumber(value) !== null)
  const prices = adjusted ? adjustedPrices : rawPrices
  if (!Array.isArray(prices)) throw new Error('Clôtures fournisseur absentes.')
  const dates = new Map()
  result.timestamp.forEach((timestamp, index) => {
    if (!Number.isFinite(timestamp)) return
    const date = new Date(timestamp * 1000)
    if (!Number.isFinite(date.getTime())) return
    const day = date.toISOString().slice(0, 10)
    const close = positiveNumber(prices[index])
    // Daily bars can update intraday. Exclude today (UTC) and future bars.
    // Keep missing adjusted observations missing, instead of mixing raw and adjusted prices.
    if (day < today && close !== null) dates.set(day, { date: day, close })
  })
  const points = [...dates.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  if (points.length < 2) throw new Error('Historique fournisseur insuffisant.')
  return {
    asOf: points.at(-1).date,
    points,
    adjusted,
    adjustment: adjusted ? 'provider-adjusted-close' : 'raw-close',
    currency: result.meta?.currency || null,
    note: `${asset.note} ${adjusted ? 'Colonne Adjusted Close du fournisseur utilisée.' : 'Clôtures brutes utilisées, faute de colonne Adjusted Close exploitable.'} Observations journalières antérieures à aujourd’hui (UTC). Flux public Yahoo Finance non contractuel, susceptible de blocage ou de révision.`
  }
}

async function fetchHistory(symbol, years, now, fetchImpl) {
  const response = await fetchImpl(buildHistoryUrl(symbol, years, now), {
    signal: AbortSignal.timeout(18000),
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) throw new Error('Source indisponible.')
  if (Number(response.headers?.get?.('content-length') || 0) > 8_000_000)
    throw new Error('Historique trop volumineux.')
  const text = await response.text()
  if (text.length > 8_000_000) throw new Error('Historique trop volumineux.')
  return parseAssetHistory(
    JSON.parse(text),
    symbol,
    now.toISOString().slice(0, 10)
  )
}

export async function getAssetHistory(
  { symbol = 'SPX', years = 10 } = {},
  { fetchImpl = fetch, now = new Date(), useCache = true } = {}
) {
  const query = parseHistoryQuery(
    new URLSearchParams({ symbol, years: String(years) })
  )
  symbol = query.symbol
  years = query.years
  const metadata = {
    symbol,
    years,
    label: ASSETS[symbol].label,
    source: 'Yahoo Finance',
    sourceUrl: historySourceUrl(symbol),
    frequency: 'daily'
  }
  const key = `${symbol}:${years}:${now.toISOString().slice(0, 10)}`
  try {
    const hit = useCache ? cache.get(key) : null
    if (hit && hit.expires > now.getTime()) return { ...metadata, ...hit.value }
    if (useCache && pending.has(key))
      return { ...metadata, ...(await pending.get(key)) }
    const promise = fetchHistory(symbol, years, now, fetchImpl)
    if (useCache) pending.set(key, promise)
    const value = await promise
    if (useCache) {
      if (cache.size >= 32) cache.delete(cache.keys().next().value)
      cache.set(key, { value, expires: now.getTime() + TTL })
    }
    return { ...metadata, ...value }
  } catch {
    return {
      ...metadata,
      asOf: null,
      points: [],
      adjusted: false,
      adjustment: 'unavailable',
      note: ASSETS[symbol].note,
      error:
        'Historique momentanément indisponible. Réessayer ou importer un CSV quotidien.'
    }
  } finally {
    if (useCache) pending.delete(key)
  }
}

export async function historyHttpHandler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    res.end(JSON.stringify({ error: 'Méthode non autorisée.' }))
    return
  }
  let query
  try {
    query = parseHistoryQuery(new URL(req.url, 'http://localhost').searchParams)
  } catch (error) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: error.message }))
    return
  }
  const data = await getAssetHistory(query)
  res.setHeader(
    'Cache-Control',
    data.error ? 'no-store' : 'public, max-age=300, s-maxage=1800'
  )
  res.statusCode = 200
  res.end(JSON.stringify(data))
}
