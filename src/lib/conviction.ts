import type { CurrencyConviction, TradeSignal } from './types'

// A small predefined currency universe (majors + common minors)
export const CURRENCY_UNIVERSE = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'AUD',
  'CAD',
  'NZD',
]

export const DEFAULT_PAIR_LIST = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD',
  'EURGBP', 'GBPCHF', 'EURJPY', 'GBPJPY', 'CADJPY', 'AUDJPY', 'NZDJPY',
  'EURCHF', 'CADCHF', 'AUDCHF', 'NZDCHF', 'EURCAD', 'GBPCAD', 'AUDCAD',
  'EURAUD', 'GBPAUD', 'EURNZD', 'GBPNZD', 'AUDNZD', 'NZDCAD'
]

export function decomposePair(symbol: string): { base: string; quote: string } | null {
  if (!symbol) return null
  // Accept formats like EURUSD, EUR/USD, EUR-USD, EUR USD
  const s = String(symbol).toUpperCase().replace(/[^A-Z]/g, '')
  if (s.length === 6) {
    return { base: s.slice(0, 3), quote: s.slice(3, 6) }
  }
  return null
}

export function buildPairList(currencies: string[] = CURRENCY_UNIVERSE, allowedPairs?: string[]): string[] {
  if (allowedPairs && allowedPairs.length > 0) {
    return allowedPairs.map((p) => String(p).toUpperCase().replace(/[^A-Z]/g, '')).filter((p) => p.length === 6)
  }

  const pairs: string[] = []
  for (const base of currencies) {
    for (const quote of currencies) {
      if (base === quote) continue
      pairs.push(`${base}${quote}`)
    }
  }
  return pairs
}

export function parsePairsFromText(text: string): string[] {
  if (!text) return []
  // split on commas, semicolons, newlines, spaces
  const tokens = text.split(/[,;\n\r]+/)
  const cleaned = tokens
    .map((t) => String(t).trim().toUpperCase())
    .flatMap((t) => t.split(/[\s\/\-]+/))
    .map((t) => t.replace(/[^A-Z]/g, ''))
    .filter((t) => t.length === 6)
  return Array.from(new Set(cleaned))
}

function stanceToDir(stance: CurrencyConviction['stance']) {
  if (stance === 'long') return 1
  if (stance === 'short') return -1
  return 0
}

export function computeSignal(symbol: string, baseConv: CurrencyConviction, quoteConv: CurrencyConviction): TradeSignal {
  const base = baseConv.currency
  const quote = quoteConv.currency

  const baseDir = stanceToDir(baseConv.stance)
  const quoteDir = stanceToDir(quoteConv.stance)

  const pairDir = baseDir - quoteDir // range -2..+2

  const avgConv = (Math.abs(baseConv.score) + Math.abs(quoteConv.score)) / 2

  const alignmentBonus = Math.abs(pairDir) === 2 ? 1 : Math.abs(pairDir) === 1 ? 0.5 : 0

  let strength = avgConv * (1 + alignmentBonus * 0.3)
  if (strength > 5) strength = 5

  const direction = pairDir > 0 ? 'long' : pairDir < 0 ? 'short' : 'neutral'

  const confidence = Math.abs(pairDir) / 2 // 0|0.5|1

  return {
    symbol,
    base,
    quote,
    direction,
    strength: Number(strength.toFixed(2)),
    confidence,
    baseConviction: baseConv,
    quoteConviction: quoteConv,
  }
}
