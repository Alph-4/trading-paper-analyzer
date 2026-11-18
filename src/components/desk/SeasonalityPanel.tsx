import { useMemo, useRef, useState } from 'react'
import { Upload, X, ArrowUpRight } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  analyzeWindow,
  buildSeasonality,
  screenSeasonalWindows,
  type PricePoint
} from '@/lib/seasonality'
import { parsePriceHistory, parisDay } from '@/lib/desk'
import { useAssetHistory } from '@/hooks/useAssetHistory'
import {
  Panel,
  SourceLine,
  Empty,
  Metric,
  actionClass,
  fieldClass,
  chartStyle,
  num,
  pct,
  tone
} from './DeskUi'

const MONTHS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc'
]
const EMPTY_POINTS: PricePoint[] = []

export default function SeasonalityPanel({
  points = EMPTY_POINTS,
  pair,
  years,
  loading
}: {
  points?: PricePoint[]
  pair: string
  years: number
  loading: boolean
}) {
  const [imported, setImported] = useState<{
    name: string
    points: PricePoint[]
  } | null>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [startDate, setStartDate] = useState(parisDay)
  const [duration, setDuration] = useState(30)
  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [asset, setAsset] = useState('fx')
  const assetHistory = useAssetHistory(asset, years, !imported)
  const inputPoints =
    imported?.points ??
    (asset === 'fx' ? points : (assetHistory.data?.points ?? EMPTY_POINTS))
  const priceLoading =
    !imported && (asset === 'fx' ? loading : assetHistory.loading)
  const seasonal = useMemo(
    () => buildSeasonality(inputPoints, years),
    [inputPoints, years]
  )
  const window = useMemo(
    () =>
      analyzeWindow(inputPoints, {
        startMonthDay: startDate.slice(5),
        durationDays: duration,
        direction,
        lookbackYears: years
      }),
    [inputPoints, years, startDate, duration, direction]
  )
  const opportunities = useMemo(
    () =>
      screenSeasonalWindows(inputPoints, {
        startMonthDay: startDate.slice(5),
        lookbackYears: years
      }),
    [inputPoints, years, startDate]
  )
  const chart = useMemo(() => {
    const current = new Map(
      seasonal.latestYear.map((p) => [p.monthDay, p.returnPct])
    )
    return seasonal.curve.map((p) => ({
      ...p,
      current: current.get(p.monthDay)
    }))
  }, [seasonal])
  const assetLabels: Record<string, string> = {
    SPX: 'S&P 500 · indice de prix',
    NDX: 'Nasdaq 100 · indice de prix',
    DAX: 'DAX · indice de performance',
    GOLD: 'Or · futures COMEX'
  }
  const label =
    imported?.name ??
    (asset === 'fx'
      ? `${pair.slice(0, 3)}/${pair.slice(3)}`
      : (assetHistory.data?.label ?? assetLabels[asset]))

  async function importFile(file: File | undefined) {
    if (!file) return
    setError('')
    if (file.size > 5_000_000) {
      setError('Fichier trop volumineux : 5 Mo maximum.')
      return
    }
    setImporting(true)
    try {
      setImported({
        name: file.name.replace(/\.csv$/i, ''),
        points: parsePriceHistory(await file.text())
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import impossible.')
    } finally {
      setImporting(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title={`Laboratoire de saisonnalité · ${label}`}
        eyebrow="Le contexte historique"
        action={
          <div className="flex gap-2">
            {imported && (
              <button className={actionClass} onClick={() => setImported(null)}>
                <X size={13} />
                Fermer le CSV
              </button>
            )}
            <button
              className={actionClass}
              disabled={importing}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={13} />
              {importing ? 'Lecture…' : 'Importer un CSV'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Importer un historique quotidien de prix"
              onChange={(e) => void importFile(e.target.files?.[0])}
            />
          </div>
        }
      >
        <label className="mb-4 block max-w-sm space-y-2 text-xs text-zinc-400">
          Marché saisonnier
          <select
            value={asset}
            onChange={(e) => {
              setAsset(e.target.value)
              setImported(null)
              setError('')
            }}
            className={fieldClass}
          >
            <option value="fx">
              {pair.slice(0, 3)}/{pair.slice(3)} · BCE
            </option>
            {Object.entries(assetLabels).map(([symbol, name]) => (
              <option key={symbol} value={symbol}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {!imported && asset !== 'fx' && assetHistory.error && (
          <p role="alert" className="mb-3 text-xs text-amber-400">
            {assetHistory.error}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 text-xs text-rose-400">
            {error}
          </p>
        )}
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-zinc-500">
          <span>
            <span className="text-zinc-200">{seasonal.years.length}</span>{' '}
            années complètes
          </span>
          <span>
            {seasonal.years.length
              ? `${seasonal.years[0]} – ${seasonal.years[seasonal.years.length - 1]}`
              : 'Historique en attente'}
          </span>
          <span>Année en cours exclue des statistiques</span>
          {imported && (
            <span className="text-amber-400">
              CSV local · conservé pour cette visite
            </span>
          )}
        </div>
        {chart.length ? (
          <>
            <div className="mb-3 flex flex-wrap gap-5 text-[11px] text-zinc-400">
              <span>
                <i className="mr-2 inline-block h-0.5 w-4 bg-emerald-400 align-middle" />
                Moyenne
              </span>
              <span>
                <i className="mr-2 inline-block h-0.5 w-4 bg-cyan-400 align-middle" />
                Médiane
              </span>
              <span>
                <i className="mr-2 inline-block h-0.5 w-4 bg-zinc-500 align-middle" />
                Année en cours
              </span>
            </div>
            <div
              className="h-72 w-full"
              role="img"
              aria-label={`Courbe saisonnière de ${label}, ${seasonal.years.length} années complètes`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chart}
                  margin={{ left: -18, right: 10, top: 10, bottom: 0 }}
                >
                  <CartesianGrid stroke="#242429" vertical={false} />
                  <XAxis
                    dataKey="monthDay"
                    ticks={MONTHS.map(
                      (_, i) => `${String(i + 1).padStart(2, '0')}-15`
                    )}
                    tickFormatter={(value: string) =>
                      MONTHS[Number(value.slice(0, 2)) - 1]
                    }
                    stroke="#52525b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${num(v, 0)}%`}
                    fontSize={10}
                    stroke="#52525b"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={chartStyle}
                    formatter={(v) => pct(Number(v))}
                    labelFormatter={(v) =>
                      `${String(v).slice(3)}/${String(v).slice(0, 2)}`
                    }
                  />
                  <ReferenceLine y={0} stroke="#52525b" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    name="Moyenne"
                    dataKey="mean"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    name="Médiane"
                    dataKey="median"
                    stroke="#22d3ee"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 4"
                    isAnimationActive={false}
                  />
                  <Line
                    name="Année en cours"
                    dataKey="current"
                    stroke="#71717a"
                    dot={false}
                    strokeWidth={1.3}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <Empty>
            {priceLoading
              ? 'Chargement de l’historique…'
              : 'Aucune année complète exploitable. Importe un historique quotidien avec les colonnes Date, Close.'}
          </Empty>
        )}
        {!imported && asset !== 'fx' && assetHistory.data && (
          <>
            <SourceLine {...assetHistory.data} />
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              {assetHistory.data.note}
            </p>
          </>
        )}
        {!imported && asset === 'fx' && (
          <SourceLine
            source="BCE via Frankfurter"
            sourceUrl="https://frankfurter.dev/"
            asOf={seasonal.asOf}
          />
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">
          Variation depuis la première clôture de chaque année. Les courbes
          peuvent avoir des amplitudes différentes de celles d’Equity Clock. CSV
          : Date (AAAA-MM-JJ), Close ; clôtures cohérentes et ajustées pour les
          actions. Aucun prix intraday.
        </p>
      </Panel>

      <Panel
        title="Explorer une fenêtre"
        eyebrow="Une hypothèse, plusieurs années"
      >
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-2 text-xs text-zinc-400">
            <span>Début annuel · jour / mois</span>
            <input
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              value={startDate}
              onChange={(e) => {
                if (/^20\d{2}-\d{2}-\d{2}$/.test(e.target.value))
                  setStartDate(e.target.value)
              }}
              className={fieldClass}
            />
          </label>
          <label className="space-y-2 text-xs text-zinc-400">
            <span>Durée calendaire</span>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={fieldClass}
            >
              {[7, 14, 21, 30, 45, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} jours
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-xs text-zinc-400">
            <span>Sens de l’exposition</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'long' | 'short')}
              className={fieldClass}
            >
              <option value="long">Achat / long</option>
              <option value="short">Vente / short</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Rendement moyen"
            value={pct(window.mean)}
            detail={`Médiane ${pct(window.median)}`}
            valueClass={tone(window.mean)}
          />
          <Metric
            label="Fréquence positive"
            value={window.winRate == null ? '—' : `${num(window.winRate, 0)} %`}
            detail={`${window.samples} fenêtres historiques`}
          />
          <Metric
            label="Pire fenêtre"
            value={pct(window.worst)}
            detail={`Meilleure ${pct(window.best)}`}
            valueClass={tone(window.worst)}
          />
          <Metric
            label="Dispersion"
            value={
              window.standardDeviation == null
                ? '—'
                : `${num(window.standardDeviation)} pts`
            }
            detail="Écart-type des rendements"
          />
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
          Le taux de réussite décrit cet échantillon historique. Il ne mesure
          pas la probabilité du prochain trade. Rendements hors spread, frais et
          financement ; aucune validation hors échantillon.
        </p>
        {window.samples > 0 && window.samples < 5 && (
          <p className="mt-2 text-xs text-amber-400">
            Échantillon faible : moins de cinq fenêtres. Une fréquence de 100 %
            peut reposer sur une seule année.
          </p>
        )}
        <details className="mt-4 text-xs text-zinc-400">
          <summary className="cursor-pointer py-2 hover:text-zinc-200">
            Voir chaque année et les dates réellement retenues
          </summary>
          <div className="mt-2 max-h-60 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-2">Année</th>
                  <th>Entrée</th>
                  <th>Sortie</th>
                  <th className="text-right">Rendement</th>
                </tr>
              </thead>
              <tbody>
                {window.observations.map((o) => (
                  <tr key={o.year} className="border-t border-zinc-800">
                    <td className="py-2">{o.year}</td>
                    <td>{o.entryDate}</td>
                    <td>{o.exitDate}</td>
                    <td className={`text-right font-mono ${tone(o.returnPct)}`}>
                      {pct(o.returnPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!window.samples && (
              <p className="py-4">Aucune fenêtre complète.</p>
            )}
          </div>
        </details>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          title="Calendrier des rendements"
          eyebrow="Chaque mois, chaque année"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[530px] border-separate border-spacing-1 text-center text-[10px]">
              <thead>
                <tr className="text-zinc-500">
                  <th className="text-left">Année</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="pb-2 font-normal">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="text-left font-medium text-zinc-300">Moy.</th>
                  {seasonal.monthly.map((m) => (
                    <td
                      key={m.month}
                      title={`${m.samples} années · fréquence positive ${num(m.winRate, 0)} %`}
                      className="rounded bg-zinc-800/70 py-2 font-mono text-zinc-200"
                    >
                      {num(m.mean, 1)}
                    </td>
                  ))}
                </tr>
                {[...seasonal.heatmap].reverse().map((row) => (
                  <tr key={row.year}>
                    <th className="text-left font-normal text-zinc-500">
                      {row.year}
                    </th>
                    {row.months.map((value, i) => (
                      <td
                        key={i}
                        title={`${MONTHS[i]} ${row.year} : ${pct(value)}`}
                        className={`rounded py-2 font-mono ${value == null ? 'bg-zinc-900 text-zinc-600' : value >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}
                        style={
                          value == null
                            ? undefined
                            : {
                                backgroundColor: `${value >= 0 ? 'rgba(16,185,129,' : 'rgba(244,63,94,'}${Math.min(0.4, 0.07 + Math.abs(value) / 18)})`
                              }
                        }
                      >
                        {num(value, 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-zinc-500">
            En %. Fin de mois à fin de mois ; janvier depuis la fin décembre
            précédente. Cellules absentes = couverture insuffisante.
          </p>
        </Panel>
        <Panel
          title="Comparer les horizons"
          eyebrow={`À partir du ${startDate.slice(8)}/${startDate.slice(5, 7)}`}
        >
          <div className="space-y-1">
            {opportunities
              .filter((o) => o.samples > 0)
              .slice(0, 6)
              .map((o) => (
                <button
                  key={`${o.direction}-${o.durationDays}`}
                  onClick={() => {
                    setDuration(o.durationDays)
                    setDirection(o.direction)
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-zinc-800/60"
                >
                  <span
                    className={`rounded border px-2 py-1 text-[10px] ${o.direction === 'long' ? 'border-emerald-900 text-emerald-400' : 'border-rose-900 text-rose-400'}`}
                  >
                    {o.direction === 'long' ? 'LONG' : 'SHORT'}
                  </span>
                  <span className="flex-1 text-xs text-zinc-300">
                    {o.durationDays} jours
                    <span className="mt-1 block text-[10px] text-zinc-500">
                      {num(o.winRate, 0)} % positifs · n={o.samples}
                    </span>
                  </span>
                  <span className={`font-mono text-sm ${tone(o.mean)}`}>
                    {pct(o.mean)}
                  </span>
                  <ArrowUpRight size={14} className="text-zinc-600" />
                </button>
              ))}
            {!opportunities.some((o) => o.samples) && (
              <Empty>Historique insuffisant.</Empty>
            )}
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-zinc-500">
            Classement exploratoire sur les mêmes données. Le tri du meilleur
            résultat favorise le surajustement ; vérifier sur une période
            indépendante.
          </p>
        </Panel>
      </div>
    </div>
  )
}
