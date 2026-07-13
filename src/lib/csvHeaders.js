const normalizedRowCache = new WeakMap()
const normalizedAliasCache = new Map()

export function normalizeHeader(header) {
  if (header === undefined || header === null) return ''

  return String(header)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getNormalizedRow(row) {
  const cached = normalizedRowCache.get(row)
  if (cached) return cached

  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  )
  normalizedRowCache.set(row, normalized)
  return normalized
}

function getNormalizedAliases(aliases) {
  const cacheKey = aliases.join('\0')
  const cached = normalizedAliasCache.get(cacheKey)
  if (cached) return cached

  const normalized = aliases.map((alias) => normalizeHeader(alias))
  normalizedAliasCache.set(cacheKey, normalized)
  return normalized
}

/**
 * Resolve a CSV cell from a row using multiple header aliases.
 *
 * This normalizes headers so imports work across TradingView exports written in
 * different languages (e.g. French headers like "Balance avant" and English
 * headers like "Balance before").
 *
 * @param {Object} row - The CSV row object.
 * @param {string[]} aliases - Possible header names to search for.
 * @return {*} The value from the first matching header, or undefined if none found.
 */
export function getHeaderValue(row, aliases) {
  const normalized = getNormalizedRow(row)
  const normalizedAliases = getNormalizedAliases(aliases)

  for (const alias of normalizedAliases) {
    const value = normalized[alias]
    if (value === undefined || value === null) continue
    if (typeof value === 'string') {
      if (value.trim() !== '') return value
      continue
    }
    return value
  }

  return undefined
}
