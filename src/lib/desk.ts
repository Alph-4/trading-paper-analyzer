import Papa from 'papaparse'
import type { PricePoint } from './seasonality'

export function parsePriceHistory(text: string): PricePoint[] {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  if (result.errors.length)
    throw new Error('CSV illisible. Vérifie le séparateur et les guillemets.')
  const [headers, ...rows] = result.data
  const normalized =
    headers?.map((h) =>
      h
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
    ) ?? []
  const dateIndex = normalized.findIndex((h) =>
    ['date', 'time', 'timestamp'].includes(h)
  )
  const adjustedIndex = normalized.findIndex((h) =>
    ['adj close', 'adjusted close', 'adj_close'].includes(h)
  )
  const closeIndex =
    adjustedIndex >= 0
      ? adjustedIndex
      : normalized.findIndex((h) => ['close', 'clôture', 'cloture'].includes(h))
  if (dateIndex < 0 || closeIndex < 0)
    throw new Error(
      'Colonnes requises : Date et Close. Dates au format AAAA-MM-JJ.'
    )
  const seen = new Set<string>()
  const points = rows
    .map((row, index) => {
      const date = row[dateIndex]?.trim()
      const close = Number(row[closeIndex]?.trim().replace(',', '.'))
      const parsed = new Date(`${date}T00:00:00Z`)
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date ||
        !Number.isFinite(close) ||
        close <= 0
      ) {
        throw new Error(`Ligne ${index + 2} : date ou clôture invalide.`)
      }
      if (seen.has(date))
        throw new Error(
          `Plusieurs clôtures pour le ${date}. Importe un historique quotidien.`
        )
      seen.add(date)
      return { date, close }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  if (points.length < 200)
    throw new Error(
      'Au moins 200 clôtures quotidiennes sont nécessaires. Plusieurs années complètes sont recommandées.'
    )
  return points
}

export function riskBudget(
  equity: number,
  riskPercent: number,
  stopPercent: number
) {
  if (
    ![equity, riskPercent, stopPercent].every(Number.isFinite) ||
    equity <= 0 ||
    riskPercent <= 0 ||
    riskPercent > 100 ||
    stopPercent <= 0 ||
    stopPercent > 100
  )
    return null
  const budget = (equity * riskPercent) / 100
  return { budget, notional: budget / (stopPercent / 100) }
}

export function parisDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export const formatNumber = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('fr-FR', {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits
      })
export const formatPercent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : `${value > 0 ? '+' : ''}${formatNumber(value)} %`
