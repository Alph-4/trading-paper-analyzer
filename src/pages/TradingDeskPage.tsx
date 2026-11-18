import {
  Activity as ReactActivity,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState
} from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Compass,
  Globe2,
  RefreshCw,
  ScanLine,
  Shield,
  Waves
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useMarketData, type MarketData } from '@/hooks/useMarketData'
import {
  DEFAULT_PAIR_LIST,
  useConvictionStore
} from '@/store/useConvictionStore'
import { analyzeWindow } from '@/lib/seasonality'
import { parisDay } from '@/lib/desk'
import {
  Panel,
  Empty,
  Metric,
  SourceLine,
  actionClass,
  fieldClass,
  chartStyle,
  num,
  pct,
  tone
} from '@/components/desk/DeskUi'
import SessionPlan, { RetailSentiment } from '@/components/desk/SessionPlan'
const SeasonalityPanel = lazy(
  () => import('@/components/desk/SeasonalityPanel')
)
const MarketWidgets = lazy(() => import('@/components/desk/MarketWidgets'))
const TABS = [
  { id: 'overview', label: 'Vue d’ensemble', icon: ScanLine },
  { id: 'charts', label: 'Graphiques & agenda', icon: BarChart3 },
  { id: 'seasonality', label: 'Saisonnalités', icon: Waves },
  { id: 'plan', label: 'Plan de session', icon: Shield }
] as const
type Tab = (typeof TABS)[number]['id']

function SessionClocks() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])
  const sessions = [
    { name: 'Tokyo', zone: 'Asia/Tokyo', start: 9, end: 18 },
    { name: 'Londres', zone: 'Europe/London', start: 8, end: 17 },
    { name: 'New York', zone: 'America/New_York', start: 8, end: 17 }
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-zinc-500">
      <span className="flex items-center gap-1.5">
        <Globe2 size={12} />
        SESSIONS FX
      </span>
      {sessions.map((s) => {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: s.zone,
          hour: '2-digit',
          minute: '2-digit',
          weekday: 'short',
          hourCycle: 'h23'
        }).formatToParts(now)
        const part = (type: string) =>
          parts.find((p) => p.type === type)?.value ?? ''
        const hour = Number(part('hour'))
        const open =
          !['Sat', 'Sun'].includes(part('weekday')) &&
          hour >= s.start &&
          hour < s.end
        return (
          <span key={s.name} className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-emerald-400' : 'bg-zinc-700'}`}
            />
            <span className={open ? 'text-zinc-300' : ''}>{s.name}</span>
            <span className="font-mono">
              {part('hour')}:{part('minute')}
            </span>
          </span>
        )
      })}
      <span className="ml-auto text-zinc-600">
        Horaires indicatifs · hors jours fériés
      </span>
    </div>
  )
}

function BondPanel({ data }: { data: MarketData | null }) {
  const points = data?.yields.points ?? []
  const two = points.find((p) => p.tenor === '2Y')?.yield
  const ten = points.find((p) => p.tenor === '10Y')?.yield
  const spread = two != null && ten != null ? (ten - two) * 100 : null
  return (
    <Panel
      title="Courbe des taux américains"
      eyebrow="Le prix de l’argent"
      action={
        <span
          className={`rounded-full border border-zinc-800 px-2 py-1 text-[10px] ${spread != null && spread < 0 ? 'text-amber-400' : 'text-zinc-400'}`}
        >
          10A − 2A : {spread == null ? '—' : `${num(spread, 0)} pb`}
        </span>
      }
    >
      {points.some((p) => p.yield != null) ? (
        <>
          <div
            className="h-44"
            role="img"
            aria-label="Courbe des rendements des obligations américaines"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ left: -25, right: 12, top: 10, bottom: 0 }}
              >
                <CartesianGrid stroke="#242429" vertical={false} />
                <XAxis
                  dataKey="tenor"
                  tickFormatter={(v: string) => v.replace('Y', 'A')}
                  fontSize={10}
                  stroke="#52525b"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => `${num(v, 1)}%`}
                  fontSize={10}
                  stroke="#52525b"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={chartStyle}
                  formatter={(v) => `${num(Number(v), 3)} %`}
                />
                <Line
                  dataKey="yield"
                  name="Rendement"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: '#a78bfa' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {points
              .filter((p) => ['2Y', '5Y', '10Y', '30Y'].includes(p.tenor))
              .map((p) => (
                <div key={p.tenor} className="rounded-lg bg-zinc-950/60 p-2.5">
                  <p className="text-[10px] text-zinc-500">
                    US {p.tenor.replace('Y', ' ans')}
                  </p>
                  <p className="mt-1 font-mono text-sm text-zinc-200">
                    {num(p.yield)} %
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                    {p.changeBps == null
                      ? '—'
                      : `${p.changeBps > 0 ? '+' : ''}${num(p.changeBps, 0)} pb`}
                  </p>
                </div>
              ))}
          </div>
        </>
      ) : (
        <Empty>{data?.yields.error ?? 'Courbe en attente de la source.'}</Empty>
      )}
      {data?.yields && <SourceLine {...data.yields} />}
      <p className="mt-2 text-[10px] text-zinc-600">
        Taux nominaux quotidiens · variations sur la précédente observation.
      </p>
    </Panel>
  )
}

function PositioningPanel({ data }: { data: MarketData | null }) {
  return (
    <Panel
      title="Positionnement des fonds"
      eyebrow="COT · leveraged money · futures"
      action={
        <span className="rounded border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
          Hebdomadaire
        </span>
      }
    >
      {data?.positioning?.points?.length ? (
        <div className="space-y-3">
          {data.positioning.points.map((p) => {
            const longPercent =
              p.long + p.short > 0 ? (p.long / (p.long + p.short)) * 100 : null
            return (
              <div key={p.currency} className="flex items-center gap-3">
                <span className="w-9 font-mono text-xs text-zinc-300">
                  {p.currency}
                </span>
                <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  {longPercent != null && (
                    <>
                      <div
                        className="bg-emerald-500/70"
                        style={{ width: `${longPercent}%` }}
                      />
                      <div className="flex-1 bg-rose-500/60" />
                    </>
                  )}
                </div>
                <span
                  className={`w-20 text-right font-mono text-[11px] ${tone(p.net)}`}
                >
                  {p.net > 0 ? '+' : ''}
                  {num(p.net, 0)}
                </span>
                <span
                  className={`w-16 text-right font-mono text-[10px] ${tone(p.changeNet)}`}
                >
                  {p.changeNet == null
                    ? '—'
                    : `${p.changeNet > 0 ? '+' : ''}${num(p.changeNet, 0)}`}
                </span>
              </div>
            )
          })}
          <div className="flex justify-end gap-8 pt-1 text-[9px] text-zinc-600">
            <span>Net contrats</span>
            <span>Δ semaine</span>
          </div>
        </div>
      ) : (
        <Empty>
          {data?.positioning?.error ?? 'Positionnement en attente de la CFTC.'}
        </Empty>
      )}
      {data?.positioning && <SourceLine {...data.positioning} />}
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
        Positions sur chaque devise contre USD. Pour USD/JPY ou USD/CHF, le sens
        de la paire est inversé. Le COT ne représente pas les particuliers.
      </p>
    </Panel>
  )
}

function Overview({
  data,
  pair,
  years,
  loading,
  onTab
}: {
  data: MarketData | null
  pair: string
  years: number
  loading: boolean
  onTab: (tab: Tab) => void
}) {
  const [range, setRange] = useState(66)
  const convictions = useConvictionStore((s) => s.convictions)
  const prices = data?.fx.points ?? []
  const latest = prices[prices.length - 1]
  const previous = prices[prices.length - 2]
  const delta =
    latest && previous ? (latest.close / previous.close - 1) * 100 : null
  const seasonal = useMemo(
    () =>
      analyzeWindow(data?.fx.points ?? [], {
        startMonthDay: parisDay().slice(5),
        durationDays: 30,
        direction: 'long',
        lookbackYears: years
      }),
    [data?.fx.points, years]
  )
  const ten = data?.yields.points.find((p) => p.tenor === '10Y')
  const today = parisDay()
  const stale =
    data?.fx.asOf &&
    (Date.parse(today) - Date.parse(data.fx.asOf)) / 86400000 > 4
  const longData = prices.slice(-range)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label={`${pair.slice(0, 3)} / ${pair.slice(3)} · Référence BCE`}
          value={latest ? num(latest.close, pair.includes('JPY') ? 3 : 5) : '—'}
          detail={
            latest
              ? `${latest.date} · quotidien${stale ? ' · donnée ancienne' : ''}`
              : loading
                ? 'Chargement des cours…'
                : 'Source indisponible'
          }
        />
        <Metric
          label="Variation quotidienne"
          value={pct(delta)}
          detail="Entre les deux dernières observations"
          valueClass={tone(delta)}
        />
        <Metric
          label="Obligation US 10 ans"
          value={ten?.yield == null ? '—' : `${num(ten.yield)} %`}
          detail={`Variation ${ten?.changeBps == null ? '—' : `${num(ten.changeBps, 0)} pb`} · ${data?.yields.asOf?.slice(0, 10) ?? 'en attente'}`}
        />
        <Metric
          label="Saisonnalité · 30 jours long"
          value={pct(seasonal.mean)}
          detail={`${seasonal.samples} fenêtres · fréquence positive ${num(seasonal.winRate, 0)} %`}
          valueClass={tone(seasonal.mean)}
        />
      </div>
      {data?.watchlist && (
        <Panel
          title="La température des marchés"
          eyebrow="Indices · volatilité · matières premières"
          action={
            <button
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-200"
              onClick={() => onTab('charts')}
            >
              Ouvrir les graphiques
              <ChevronRight size={13} />
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
            {data.watchlist.points.map((p) => (
              <a
                key={p.symbol}
                href={p.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3 transition hover:border-zinc-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-zinc-400">{p.label}</span>
                  <ArrowUpRight size={11} className="text-zinc-600" />
                </div>
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-base text-zinc-200">
                    {num(p.close, 2)}
                  </span>
                  <span
                    className={`font-mono text-[11px] ${tone(p.changePct)}`}
                  >
                    {pct(p.changePct)}
                  </span>
                </div>
                <p className="mt-2 text-[9px] text-zinc-600">
                  {p.asOf?.slice(0, 10) ?? 'Indisponible'}
                </p>
              </a>
            ))}
          </div>
          {data.watchlist.error && (
            <p className="mt-3 text-xs text-amber-400">
              {data.watchlist.error}
            </p>
          )}
          <p className="mt-3 text-[10px] text-zinc-600">
            Yahoo Finance · observations quotidiennes, pas un flux intraday.
            L’or affiché est un contrat futures, distinct de XAU/USD spot.
          </p>
        </Panel>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Panel
          title={`${pair.slice(0, 3)} / ${pair.slice(3)}`}
          eyebrow="Perspective quotidienne"
          action={
            <div className="flex rounded-lg border border-zinc-800 p-0.5">
              {[
                { label: '1M', value: 22 },
                { label: '3M', value: 66 },
                { label: '1A', value: 260 }
              ].map((r) => (
                <button
                  key={r.label}
                  onClick={() => setRange(r.value)}
                  className={`rounded-md px-3 py-1 text-[10px] ${range === r.value ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          }
        >
          {prices.length ? (
            <div
              className="h-[280px]"
              role="img"
              aria-label={`Historique quotidien ${pair}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={longData}
                  margin={{ left: -8, right: 5, top: 12 }}
                >
                  <defs>
                    <linearGradient id="desk-price" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#34d399"
                        stopOpacity={0.18}
                      />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#242429" vertical={false} />
                  <XAxis
                    dataKey="date"
                    minTickGap={45}
                    tickFormatter={(d: string) =>
                      d.slice(5).split('-').reverse().join('/')
                    }
                    fontSize={10}
                    stroke="#52525b"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tickFormatter={(v: number) =>
                      num(v, pair.includes('JPY') ? 1 : 3)
                    }
                    width={60}
                    fontSize={10}
                    stroke="#52525b"
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={chartStyle}
                    formatter={(v) => num(Number(v), 5)}
                  />
                  <Area
                    type="monotone"
                    dataKey="close"
                    name="Clôture de référence"
                    stroke="#34d399"
                    strokeWidth={2}
                    fill="url(#desk-price)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty>
              {loading
                ? 'Chargement du cours quotidien…'
                : (data?.fx.error ?? 'Cours indisponible.')}
            </Empty>
          )}
          {data?.fx && <SourceLine {...data.fx} />}
          <p className="mt-2 text-[10px] text-zinc-600">
            Taux de référence BCE · aucune cotation d’exécution.
          </p>
        </Panel>
        <div className="space-y-4">
          <RetailSentiment key={pair} pair={pair} />
          <Panel
            title="Mes convictions"
            eyebrow="Ton analyse personnelle"
            action={
              <Link
                to="/convictions"
                className="text-zinc-500 hover:text-zinc-200"
                aria-label="Modifier mes convictions"
              >
                <Compass size={15} />
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              {[pair.slice(0, 3), pair.slice(3)].map((currency) => {
                const c = convictions[currency]
                return (
                  <div key={currency} className="rounded-lg bg-zinc-950/60 p-3">
                    <p className="font-mono text-xs text-zinc-400">
                      {currency}
                    </p>
                    <p
                      className={`mt-2 text-sm ${c?.stance === 'long' ? 'text-emerald-400' : c?.stance === 'short' ? 'text-rose-400' : 'text-zinc-500'}`}
                    >
                      {c?.stance === 'long'
                        ? 'Acheteur'
                        : c?.stance === 'short'
                          ? 'Vendeur'
                          : 'Neutre'}
                      <span className="ml-2 text-[10px]">
                        {c?.score ?? 0}/5
                      </span>
                    </p>
                  </div>
                )
              })}
            </div>
            <Link
              to="/convictions"
              className="mt-3 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200"
            >
              Mettre à jour mon analyse
              <ChevronRight size={11} />
            </Link>
          </Panel>
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <BondPanel data={data} />
        <PositioningPanel data={data} />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          title="Force relative des devises"
          eyebrow="Variation contre USD · référence BCE"
        >
          <div className="space-y-3">
            {data?.strength?.points?.map((p) => (
              <div key={p.currency} className="flex items-center gap-4">
                <span className="w-8 font-mono text-xs text-zinc-400">
                  {p.currency}
                </span>
                <div className="relative h-4 flex-1">
                  <div className="absolute left-1/2 top-0 h-full w-px bg-zinc-700" />
                  <div
                    className={`absolute top-1 h-2 rounded-sm ${(p.change5d ?? 0) >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                    style={{
                      left:
                        (p.change5d ?? 0) >= 0
                          ? '50%'
                          : `${50 - Math.min(50, Math.abs(p.change5d ?? 0) * 12)}%`,
                      width: `${Math.min(50, Math.abs(p.change5d ?? 0) * 12)}%`
                    }}
                  />
                </div>
                <span
                  className={`w-20 text-right font-mono text-xs ${tone(p.change5d)}`}
                >
                  {pct(p.change5d)}
                </span>
              </div>
            ))}
            {!data?.strength?.points?.length && (
              <Empty>{data?.strength?.error ?? 'Données en attente.'}</Empty>
            )}
          </div>
          {data?.strength && <SourceLine {...data.strength} />}
          <p className="mt-2 text-[10px] text-zinc-600">
            Sur environ une semaine · benchmark USD = 0 ; ce graphique n’est pas
            un indice pondéré.
          </p>
        </Panel>
        <Panel
          title="Préparer la prochaine décision"
          eyebrow="Du contexte au scénario"
        >
          <p className="text-sm leading-relaxed text-zinc-400">
            Rassemble les catalyseurs, tes niveaux et ton invalidation avant de
            choisir une exposition.
          </p>
          <div className="mt-5 space-y-2">
            {[
              {
                tab: 'charts' as Tab,
                icon: CalendarDays,
                title: 'Vérifier les annonces',
                detail: 'Agenda macro et graphiques FX, indices et or'
              },
              {
                tab: 'seasonality' as Tab,
                icon: Waves,
                title: 'Tester le contexte saisonnier',
                detail: 'Fenêtres, dispersion et comparaison par année'
              },
              {
                tab: 'plan' as Tab,
                icon: Shield,
                title: 'Écrire mon plan de session',
                detail: 'Scénario, checklist et budget de risque'
              }
            ].map(({ tab, icon: Icon, title, detail }) => (
              <button
                key={tab}
                onClick={() => onTab(tab)}
                className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 p-3 text-left transition hover:bg-zinc-800/50"
              >
                <Icon size={17} className="text-emerald-400" />
                <span className="flex-1">
                  <span className="text-xs text-zinc-200">{title}</span>
                  <span className="mt-1 block text-[10px] text-zinc-500">
                    {detail}
                  </span>
                </span>
                <ChevronRight size={14} className="text-zinc-600" />
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

export default function TradingDeskPage() {
  const [pair, setPair] = useState('EURUSD')
  const [years, setYears] = useState(10)
  const [tab, setTab] = useState<Tab>('overview')
  const { data, error, loading, refresh } = useMarketData(pair, years)
  const failedSources = data
    ? [
        data.fx,
        data.yields,
        data.positioning,
        data.strength,
        data.watchlist
      ].filter((s) => s?.error).length
    : 0
  return (
    <div className="mx-auto max-w-[1800px] space-y-5 pb-6">
      <SessionClocks />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[.2em] text-emerald-400">
            <Activity size={12} />
            Ton espace de marché
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Trading desk<span className="text-emerald-400">.</span>
          </h1>
          <p className="mt-2 text-xs text-zinc-500">
            Le contexte, les cycles et ton plan. Au même endroit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="desk-pair">
            Paire FX de référence
          </label>
          <select
            id="desk-pair"
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            className={`${fieldClass} !w-auto`}
          >
            {DEFAULT_PAIR_LIST.map((p) => (
              <option key={p} value={p}>
                {p.slice(0, 3)} / {p.slice(3)}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="desk-years">
            Profondeur historique
          </label>
          <select
            id="desk-years"
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className={`${fieldClass} !w-auto`}
          >
            {[5, 10, 15, 20].map((y) => (
              <option key={y} value={y}>
                {y} ans d’historique
              </option>
            ))}
          </select>
          <button
            className={actionClass}
            disabled={loading}
            onClick={refresh}
            aria-label="Actualiser les données de marché"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800">
        <div
          className="flex max-w-full gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Sections du trading desk"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                if (
                  !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                    event.key
                  )
                )
                  return
                event.preventDefault()
                const index = TABS.findIndex((item) => item.id === id)
                const nextIndex =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? TABS.length - 1
                      : (index +
                          (event.key === 'ArrowRight' ? 1 : -1) +
                          TABS.length) %
                        TABS.length
                const next = TABS[nextIndex].id
                setTab(next)
                document.getElementById(`tab-${next}`)?.focus()
              }}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs transition ${tab === id ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <span className="pb-3 text-[10px] text-zinc-600" role="status">
          {loading
            ? 'Connexion aux sources…'
            : error
              ? 'Connexion indisponible'
              : failedSources
                ? `${failedSources} source(s) indisponible(s)`
                : 'Données quotidiennes et hebdomadaires'}
        </span>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-amber-900/70 bg-amber-950/20 p-4 text-xs text-amber-300"
        >
          {error}{' '}
          <button className="ml-2 underline" onClick={refresh}>
            Réessayer
          </button>
        </div>
      )}
      {failedSources > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-amber-900/60 p-3 text-xs text-amber-400"
        >
          Certaines sources ne répondent pas. Les panneaux concernés affichent
          leur état sans donnée de remplacement.
        </div>
      )}
      {TABS.map(({ id }) => (
        <ReactActivity key={id} mode={tab === id ? 'visible' : 'hidden'}>
          <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
            <Suspense fallback={<Empty>Chargement de l’espace…</Empty>}>
              {id === 'overview' ? (
                <Overview
                  data={data}
                  pair={pair}
                  years={years}
                  loading={loading}
                  onTab={setTab}
                />
              ) : id === 'seasonality' ? (
                <SeasonalityPanel
                  points={data?.fx.points}
                  pair={pair}
                  years={years}
                  loading={loading}
                />
              ) : id === 'plan' ? (
                <SessionPlan pair={pair} />
              ) : (
                <MarketWidgets pair={pair} />
              )}
            </Suspense>
          </div>
        </ReactActivity>
      ))}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/70 pt-4 text-[10px] text-zinc-600">
        <p>
          Sources datées · historique ≠ prévision · vérifie les cotations chez
          ton courtier.
        </p>
        <div className="flex flex-wrap gap-4">
          <a
            href="https://charts.equityclock.com/euro-to-us-dollar-eurusd-seasonal-chart"
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-300"
          >
            Equity Clock ↗
          </a>
          <a
            href="https://www.seasonax.com/seasonality-screener/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-300"
          >
            Seasonax ↗
          </a>
        </div>
      </footer>
    </div>
  )
}
