/**
 * Descriptive calendar seasonality, computed only from supplied daily closes.
 * Returns and hit rates are percentages, without spread, financing or fees.
 * A year needs >=220 quotes, >=15 per month, January/December boundaries
 * within 7 days, and no gap >10 days. The current year never enters the sample.
 * Curves are rebased to each year's first close; closed days carry the last
 * known close. February 29 is omitted from the comparable 365-day chart.
 * Monthly returns are close-to-close (January is null without prior December).
 * Windows enter/exit at the first quote on/after each calendar boundary, at
 * most 7 days later. February 29 maps to February 28 in non-leap years.
 * Cross-year windows require both years to be complete. A short return is the
 * negative underlying return for a fixed initial notional, not an inverse FX.
 * The screener is exploratory in-sample analysis, never a predictive score.
 */

export interface PricePoint {
  date: string
  close: number
}
export type SeasonalDirection = 'long' | 'short'
export interface SeasonalCurvePoint {
  day: number
  monthDay: string
  mean: number
  median: number
  samples: number
}
export interface SeasonalMonth {
  month: number
  mean: number | null
  median: number | null
  winRate: number | null
  samples: number
}
export interface YearCoverage {
  year: number
  points: number
  complete: boolean
  reason: string | null
}
export interface SeasonalityResult {
  years: number[]
  excludedYears: number[]
  coverage: YearCoverage[]
  curve: SeasonalCurvePoint[]
  monthly: SeasonalMonth[]
  heatmap: { year: number; months: (number | null)[] }[]
  latestYear: { day: number; monthDay: string; returnPct: number }[]
  asOf: string | null
}
export interface WindowOptions {
  startMonthDay: string
  durationDays: number
  direction: SeasonalDirection
  lookbackYears?: number
}
export interface WindowObservation {
  year: number
  entryDate: string
  exitDate: string
  returnPct: number
  maxDrawdown: number
}
export interface SeasonalWindow extends WindowOptions {
  samples: number
  mean: number | null
  median: number | null
  winRate: number | null
  best: number | null
  worst: number | null
  standardDeviation: number | null
  maxDrawdown: number | null
  observations: WindowObservation[]
}

const DAY = 86_400_000
const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const iso = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 10)
const yearOf = (point: PricePoint) => Number(point.date.slice(0, 4))

function prepare(points: PricePoint[], now: Date, lookbackYears: number) {
  if (!Number.isFinite(now.getTime()))
    throw new RangeError('Date de référence invalide')
  if (!Number.isFinite(lookbackYears))
    throw new RangeError('Historique invalide')
  const lookback = Math.min(20, Math.max(1, Math.floor(lookbackYears)))
  const cutoff = now.toISOString().slice(0, 10)
  const currentYear = now.getUTCFullYear()
  const unique = new Map<string, PricePoint>()
  for (const point of points) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(point.date) ||
      !Number.isFinite(point.close) ||
      point.close <= 0 ||
      point.date > cutoff
    )
      continue
    const timestamp = Date.parse(`${point.date}T00:00:00Z`)
    if (!Number.isFinite(timestamp) || iso(timestamp) !== point.date) continue
    unique.set(point.date, { date: point.date, close: point.close })
  }
  const sorted = [...unique.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  const byYear = new Map<number, PricePoint[]>()
  for (const point of sorted) {
    const year = yearOf(point)
    const values = byYear.get(year) ?? []
    values.push(point)
    byYear.set(year, values)
  }
  const coverage: YearCoverage[] = []
  for (let year = currentYear - lookback; year < currentYear; year++) {
    const values = byYear.get(year) ?? []
    const monthlyCounts = Array.from(
      { length: 12 },
      (_, month) =>
        values.filter((point) => Number(point.date.slice(5, 7)) === month + 1)
          .length
    )
    let reason: string | null = null
    if (values.length < 220) reason = 'Moins de 220 observations quotidiennes'
    else if (
      values[0].date > `${year}-01-07` ||
      values[values.length - 1].date < `${year}-12-24`
    )
      reason = 'Début ou fin d’année absent'
    else if (monthlyCounts.some((count) => count < 15))
      reason = 'Couverture mensuelle insuffisante'
    else if (
      values.some(
        (point, index) =>
          index > 0 &&
          Date.parse(point.date) - Date.parse(values[index - 1].date) > 10 * DAY
      )
    )
      reason = 'Lacune supérieure à 10 jours'
    coverage.push({
      year,
      points: values.length,
      complete: reason === null,
      reason
    })
  }
  return { sorted, byYear, coverage, currentYear, lookback }
}

const calendar = Array.from({ length: 365 }, (_, index) => ({
  day: index + 1,
  monthDay: iso(Date.UTC(2001, 0, index + 1)).slice(5)
}))

function curveForYear(points: PricePoint[]) {
  if (!points.length) return []
  let cursor = 0
  const finalMonthDay = points[points.length - 1].date.slice(5)
  return calendar
    .filter(({ monthDay }) => monthDay <= finalMonthDay)
    .map(({ day, monthDay }) => {
      while (
        cursor + 1 < points.length &&
        points[cursor + 1].date.slice(5) <= monthDay
      )
        cursor++
      return {
        day,
        monthDay,
        returnPct: (points[cursor].close / points[0].close - 1) * 100
      }
    })
}

export function buildSeasonality(
  points: PricePoint[],
  lookbackYears = 10,
  now = new Date()
): SeasonalityResult {
  const context = prepare(points, now, lookbackYears)
  const years = context.coverage
    .filter((year) => year.complete)
    .map(({ year }) => year)
  const yearlyCurves = years.map((year) =>
    curveForYear(context.byYear.get(year)!)
  )
  const curve = years.length
    ? calendar.map(({ day, monthDay }, index) => {
        const values = yearlyCurves
          .map((values) => values[index]?.returnPct)
          .filter((value): value is number => value !== undefined)
        // Complete historical years extend through the last available December quote.
        // Carry its value to December 31 instead of changing the sample mid-chart.
        const filled =
          values.length === years.length
            ? values
            : yearlyCurves.map(
                (values) =>
                  (values[index] ?? values[values.length - 1]).returnPct
              )
        return {
          day,
          monthDay,
          mean: mean(filled),
          median: median(filled),
          samples: filled.length
        }
      })
    : []
  const monthEnds = new Map<string, PricePoint>()
  for (const point of context.sorted)
    monthEnds.set(point.date.slice(0, 7), point)
  const heatmap = years.map((year) => ({
    year,
    months: Array.from({ length: 12 }, (_, index) => {
      const end = monthEnds.get(`${year}-${String(index + 1).padStart(2, '0')}`)
      const previousMonth = iso(Date.UTC(year, index, 0)).slice(0, 7)
      const start = monthEnds.get(previousMonth)
      if (
        !end ||
        !start ||
        Date.parse(start.date) < Date.UTC(year, index, 1) - 7 * DAY
      )
        return null
      return (end.close / start.close - 1) * 100
    })
  }))
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const values = heatmap
      .map(({ months }) => months[index])
      .filter((value): value is number => value !== null)
    return {
      month: index + 1,
      mean: values.length ? mean(values) : null,
      median: values.length ? median(values) : null,
      winRate: values.length
        ? (values.filter((value) => value > 0).length / values.length) * 100
        : null,
      samples: values.length
    }
  })
  return {
    years,
    excludedYears: context.coverage
      .filter((year) => !year.complete)
      .map(({ year }) => year),
    coverage: context.coverage,
    curve,
    monthly,
    heatmap,
    latestYear: curveForYear(context.byYear.get(context.currentYear) ?? []),
    asOf: context.sorted[context.sorted.length - 1]?.date ?? null
  }
}

function validateWindow(options: WindowOptions) {
  if (
    !/^\d{2}-\d{2}$/.test(options.startMonthDay) ||
    iso(Date.parse(`2000-${options.startMonthDay}T00:00:00Z`)).slice(5) !==
      options.startMonthDay
  ) {
    throw new RangeError('Jour de départ invalide (MM-JJ)')
  }
  if (
    !Number.isInteger(options.durationDays) ||
    options.durationDays < 1 ||
    options.durationDays > 180
  )
    throw new RangeError('La durée doit être comprise entre 1 et 180 jours')
  if (options.direction !== 'long' && options.direction !== 'short')
    throw new RangeError('Direction invalide')
}

function analyzePrepared(
  context: ReturnType<typeof prepare>,
  options: WindowOptions
): SeasonalWindow {
  const eligible = new Set(
    context.coverage.filter(({ complete }) => complete).map(({ year }) => year)
  )
  const observations: WindowObservation[] = []
  const sign = options.direction === 'long' ? 1 : -1
  for (const year of eligible) {
    const monthDay =
      options.startMonthDay === '02-29' &&
      new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1
        ? '02-28'
        : options.startMonthDay
    const requestedEntry = Date.parse(`${year}-${monthDay}T00:00:00Z`)
    const requestedExit = requestedEntry + options.durationDays * DAY
    const exitYear = new Date(requestedExit).getUTCFullYear()
    if (!eligible.has(exitYear)) continue
    const values = [
      ...(context.byYear.get(year) ?? []),
      ...(exitYear !== year ? (context.byYear.get(exitYear) ?? []) : [])
    ]
    const entryIndex = values.findIndex(
      (point) => point.date >= iso(requestedEntry)
    )
    const exitIndex = values.findIndex(
      (point) => point.date >= iso(requestedExit)
    )
    if (entryIndex < 0 || exitIndex <= entryIndex) continue
    const entry = values[entryIndex]
    const exit = values[exitIndex]
    if (
      Date.parse(entry.date) - requestedEntry > 7 * DAY ||
      Date.parse(exit.date) - requestedExit > 7 * DAY
    )
      continue
    let peak = 1
    let maxDrawdown = 0
    for (let index = entryIndex; index <= exitIndex; index++) {
      const equity = 1 + sign * (values[index].close / entry.close - 1)
      peak = Math.max(peak, equity)
      maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100)
    }
    observations.push({
      year,
      entryDate: entry.date,
      exitDate: exit.date,
      returnPct: sign * (exit.close / entry.close - 1) * 100,
      maxDrawdown
    })
  }
  const values = observations.map(({ returnPct }) => returnPct)
  const average = values.length ? mean(values) : null
  return {
    ...options,
    samples: values.length,
    mean: average,
    median: values.length ? median(values) : null,
    winRate: values.length
      ? (values.filter((value) => value > 0).length / values.length) * 100
      : null,
    best: values.length ? Math.max(...values) : null,
    worst: values.length ? Math.min(...values) : null,
    standardDeviation:
      values.length > 1
        ? Math.sqrt(
            values.reduce((sum, value) => sum + (value - average!) ** 2, 0) /
              (values.length - 1)
          )
        : values.length === 1
          ? 0
          : null,
    maxDrawdown: values.length
      ? Math.max(...observations.map(({ maxDrawdown }) => maxDrawdown))
      : null,
    observations
  }
}

export function analyzeWindow(
  points: PricePoint[],
  options: WindowOptions,
  now = new Date()
): SeasonalWindow {
  validateWindow(options)
  return analyzePrepared(
    prepare(points, now, options.lookbackYears ?? 10),
    options
  )
}

export function screenSeasonalWindows(
  points: PricePoint[],
  options: {
    startMonthDay: string
    lookbackYears?: number
    durations?: number[]
  },
  now = new Date()
): SeasonalWindow[] {
  const context = prepare(points, now, options.lookbackYears ?? 10)
  return (options.durations ?? [7, 14, 30, 60, 90])
    .flatMap((durationDays) =>
      (['long', 'short'] as const).map((direction) => {
        const window = {
          startMonthDay: options.startMonthDay,
          lookbackYears: options.lookbackYears,
          durationDays,
          direction
        }
        validateWindow(window)
        return analyzePrepared(context, window)
      })
    )
    .sort((a, b) => (b.mean ?? -Infinity) - (a.mean ?? -Infinity))
}
