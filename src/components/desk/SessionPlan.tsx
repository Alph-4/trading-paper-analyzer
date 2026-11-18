import { useState, type Dispatch, type SetStateAction } from 'react'
import {
  Check,
  ClipboardList,
  ExternalLink,
  Save,
  ShieldCheck
} from 'lucide-react'
import { parisDay, riskBudget } from '@/lib/desk'
import { Panel, Metric, fieldClass, actionClass, num } from './DeskUi'

function useLocalRecord<T>(
  key: string,
  valid: (value: unknown) => value is T
): [Record<string, T>, (id: string, value: T) => void, string] {
  const [error, setError] = useState('')
  const [data, setData] = useState<Record<string, T>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (
        stored?.version !== 1 ||
        !stored.entries ||
        typeof stored.entries !== 'object' ||
        Array.isArray(stored.entries)
      )
        return {}
      return Object.fromEntries(
        Object.entries(stored.entries).filter(([, value]) => valid(value))
      ) as Record<string, T>
    } catch {
      return {}
    }
  })
  function update(id: string, value: T) {
    const next = { ...data, [id]: value }
    // Keep the most recent 90 records, avoiding unbounded journal storage.
    const entries = Object.fromEntries(Object.entries(next).slice(-90))
    setData(entries)
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, entries }))
      setError('')
    } catch {
      setError(
        'Sauvegarde locale impossible. Ces modifications restent en mémoire ; copie tes notes avant de fermer.'
      )
    }
  }
  return [data, update, error]
}

interface Sentiment {
  longPercent: number
  observedAt: string
  provider: 'Myfxbook' | 'IG'
}
function isSentiment(v: unknown): v is Sentiment {
  if (!v || typeof v !== 'object') return false
  const s = v as Sentiment
  return (
    Number.isFinite(s.longPercent) &&
    s.longPercent >= 0 &&
    s.longPercent <= 100 &&
    typeof s.observedAt === 'string' &&
    Number.isFinite(Date.parse(s.observedAt)) &&
    ['Myfxbook', 'IG'].includes(s.provider)
  )
}

export function RetailSentiment({ pair }: { pair: string }) {
  const [snapshots, save, storageError] = useLocalRecord(
    'trading-desk-retail-v1',
    isSentiment
  )
  const snapshot = snapshots[pair]
  const [editing, setEditing] = useState(false)
  const [long, setLong] = useState('')
  const [date, setDate] = useState('')
  const [provider, setProvider] = useState<'Myfxbook' | 'IG'>('Myfxbook')
  const [error, setError] = useState('')
  function saveSnapshot(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(long)
    const observed = new Date(date)
    if (
      !long.trim() ||
      !date ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100 ||
      !Number.isFinite(observed.getTime()) ||
      observed.getTime() > Date.now()
    ) {
      setError(
        'Indique un pourcentage de 0 à 100 et une date d’observation passée.'
      )
      return
    }
    save(pair, {
      longPercent: value,
      observedAt: observed.toISOString(),
      provider
    })
    setEditing(false)
    setError('')
  }
  const ageHours = snapshot
    ? (Date.now() - Date.parse(snapshot.observedAt)) / 3600000
    : null
  return (
    <Panel
      title="Sentiment des particuliers"
      eyebrow={`${pair.slice(0, 3)}/${pair.slice(3)} · Relevé manuel`}
      action={
        <button
          className={actionClass}
          onClick={() => {
            setEditing(!editing)
            setLong(snapshot ? String(snapshot.longPercent) : '')
            setDate('')
          }}
        >
          {editing
            ? 'Fermer'
            : snapshot
              ? 'Actualiser le relevé'
              : 'Saisir un relevé'}
        </button>
      }
    >
      {snapshot ? (
        <>
          <div className="mb-3 flex justify-between text-sm">
            <span className="text-emerald-400">
              {num(snapshot.longPercent, 0)} % long
            </span>
            <span className="text-rose-400">
              {num(100 - snapshot.longPercent, 0)} % short
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="bg-emerald-400"
              style={{ width: `${snapshot.longPercent}%` }}
            />
            <div className="flex-1 bg-rose-400" />
          </div>
          <p
            className={`mt-3 text-[10px] ${ageHours != null && ageHours > 24 ? 'text-amber-400' : 'text-zinc-500'}`}
          >
            {snapshot.provider} · saisi manuellement ·{' '}
            {new Date(snapshot.observedAt).toLocaleString('fr-FR')}{' '}
            {ageHours != null && ageHours > 24
              ? '· relevé de plus de 24 h'
              : ''}
          </p>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-zinc-500">
          Ajoute le ratio long / short observé chez ton fournisseur. Aucun flux
          retail automatique n’est connecté.
        </p>
      )}
      {editing && (
        <form className="mt-4 space-y-3" onSubmit={saveSnapshot}>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-[11px] text-zinc-400">
              Positions longues (%)
              <input
                required
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={long}
                onChange={(e) => setLong(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-[11px] text-zinc-400">
              Source
              <select
                value={provider}
                onChange={(e) =>
                  setProvider(e.target.value as Sentiment['provider'])
                }
                className={fieldClass}
              >
                <option>Myfxbook</option>
                <option>IG</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-[11px] text-zinc-400">
            Date et heure d’observation (heure locale)
            <input
              required
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-rose-400">
              {error}
            </p>
          )}
          <button className={actionClass} type="submit">
            <Save size={12} />
            Enregistrer pour {pair}
          </button>
        </form>
      )}
      {storageError && (
        <p role="alert" className="mt-3 text-xs text-amber-400">
          {storageError}
        </p>
      )}
      <div className="mt-4 flex gap-4 text-[10px] text-zinc-500">
        <a
          href="https://www.myfxbook.com/community/outlook"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:text-zinc-200"
        >
          Myfxbook
          <ExternalLink size={10} />
        </a>
        <a
          href="https://www.ig.com/en/forex/markets-forex"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:text-zinc-200"
        >
          IG
          <ExternalLink size={10} />
        </a>
      </div>
    </Panel>
  )
}

interface Plan {
  bias: string
  thesis: string
  invalidation: string
  levels: string
  events: string
  review: string
  checks: boolean[]
  updatedAt: string
}
const EMPTY_PLAN: Plan = {
  bias: 'Attendre',
  thesis: '',
  invalidation: '',
  levels: '',
  events: '',
  review: '',
  checks: [false, false, false, false],
  updatedAt: ''
}
const CHECKS = [
  'Annonces économiques et banques centrales vérifiées',
  'Contexte taux, dollar et sentiment passé en revue',
  'Niveaux et scénario d’invalidation définis',
  'Risque et exposition cumulée vérifiés'
]
function isPlan(v: unknown): v is Plan {
  if (!v || typeof v !== 'object') return false
  const p = v as Plan
  return (
    [
      'bias',
      'thesis',
      'invalidation',
      'levels',
      'events',
      'review',
      'updatedAt'
    ].every((k) => typeof p[k as keyof Plan] === 'string') &&
    Array.isArray(p.checks) &&
    p.checks.length === 4 &&
    p.checks.every((c) => typeof c === 'boolean')
  )
}

function NumberField({
  label,
  value,
  set
}: {
  label: string
  value: string
  set: Dispatch<SetStateAction<string>>
}) {
  return (
    <label className="space-y-2 text-xs text-zinc-400">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => set(e.target.value)}
        className={fieldClass}
      />
    </label>
  )
}

export default function SessionPlan({ pair }: { pair: string }) {
  const [instrument, setInstrument] = useState('fx')
  const symbol = instrument === 'fx' ? pair : instrument
  const [plans, save, error] = useLocalRecord('trading-desk-plans-v1', isPlan)
  const day = parisDay()
  const id = `${day}-${symbol}`
  const plan = plans[id] ?? EMPTY_PLAN
  const [equity, setEquity] = useState('')
  const [risk, setRisk] = useState('0.5')
  const [stop, setStop] = useState('')
  const budget = riskBudget(Number(equity), Number(risk), Number(stop))
  const update = (patch: Partial<Plan>) =>
    save(id, { ...plan, ...patch, updatedAt: new Date().toISOString() })
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <Panel
          title={`Mon plan · ${symbol}`}
          eyebrow={`${day} · date de Paris`}
          action={
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <Save size={12} />
              {error
                ? 'Sauvegarde indisponible'
                : plan.updatedAt
                  ? 'Sauvegardé dans ce navigateur'
                  : 'Sauvegarde locale'}
            </span>
          }
        >
          <label className="mb-4 block space-y-2 text-xs text-zinc-400">
            Marché du plan
            <select
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              className={fieldClass}
            >
              <option value="fx">
                {pair.slice(0, 3)}/{pair.slice(3)} · paire de référence
              </option>
              <option value="XAUUSD">Or spot · XAU/USD</option>
              <option value="SPX">S&P 500</option>
              <option value="NDX">Nasdaq 100</option>
              <option value="DAX">DAX</option>
            </select>
          </label>
          <div className="space-y-4">
            <label className="block space-y-2 text-xs text-zinc-400">
              Biais de travail
              <select
                value={plan.bias}
                onChange={(e) => update({ bias: e.target.value })}
                className={fieldClass}
              >
                <option>Attendre</option>
                <option>Acheteur</option>
                <option>Vendeur</option>
                <option>Neutre / range</option>
              </select>
            </label>
            {(
              [
                [
                  'thesis',
                  'Scénario et catalyseurs',
                  'Pourquoi ce marché ? Quels éléments doivent se confirmer ?'
                ],
                [
                  'levels',
                  'Niveaux à surveiller',
                  'Support, résistance, liquidité, zones d’intérêt…'
                ],
                [
                  'invalidation',
                  'Invalidation',
                  'Quelle observation annule mon scénario ?'
                ],
                [
                  'events',
                  'Annonces et horaires vérifiés',
                  'Note les événements, leur source et leur heure avec le fuseau.'
                ],
                [
                  'review',
                  'Bilan de session',
                  'Exécution, discipline, surprise et leçon à retenir…'
                ]
              ] as const
            ).map(([key, label, placeholder]) => (
              <label
                key={key}
                className="block space-y-2 text-xs text-zinc-400"
              >
                {label}
                <textarea
                  maxLength={10000}
                  rows={3}
                  value={plan[key]}
                  onChange={(e) => update({ [key]: e.target.value })}
                  placeholder={placeholder}
                  className={`${fieldClass} resize-y placeholder:text-zinc-700`}
                />
              </label>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-4 text-xs text-amber-400">
              {error}
            </p>
          )}
          <button
            className={`${actionClass} mt-4`}
            onClick={() => {
              const blob = new Blob(
                [
                  JSON.stringify(
                    { date: day, instrument: symbol, ...plan },
                    null,
                    2
                  )
                ],
                { type: 'application/json' }
              )
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `session-${id}.json`
              a.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}
          >
            <ClipboardList size={13} />
            Exporter ce plan
          </button>
          <p className="mt-3 text-[10px] text-zinc-500">
            Notes propres à ce marché et cette journée. Historique local des 90
            derniers plans, sans synchronisation entre appareils.
          </p>
          <details className="mt-4 text-xs text-zinc-400">
            <summary className="cursor-pointer">
              Plans précédents (
              {Object.keys(plans).filter((k) => k !== id).length})
            </summary>
            <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
              {Object.entries(plans)
                .filter(([key]) => key !== id)
                .reverse()
                .map(([key, p]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-zinc-800 p-3"
                  >
                    <p className="mb-2 font-mono text-[10px] text-zinc-500">
                      {key} · {p.bias}
                    </p>
                    <p className="whitespace-pre-wrap text-xs">
                      {p.thesis || 'Scénario non renseigné'}
                    </p>
                    {p.review && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-500">
                        Bilan : {p.review}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </details>
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel
          title="Avant d’entrer en position"
          eyebrow="La discipline avant le clic"
          action={<ShieldCheck size={18} className="text-emerald-400" />}
        >
          <div className="space-y-2">
            {CHECKS.map((text, i) => (
              <label
                key={text}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800/70 p-3 text-xs leading-relaxed text-zinc-400"
              >
                <input
                  type="checkbox"
                  checked={plan.checks[i]}
                  onChange={(e) =>
                    update({
                      checks: plan.checks.map((v, j) =>
                        i === j ? e.target.checked : v
                      )
                    })
                  }
                  className="mt-0.5 accent-emerald-500"
                />
                {text}
              </label>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <Check size={13} />
            {plan.checks.filter(Boolean).length} / 4 vérifications consignées
          </p>
        </Panel>
        <Panel
          title="Budget de risque"
          eyebrow="Une estimation avant les frais"
        >
          <div className="grid grid-cols-1 gap-3">
            <NumberField
              label="Capital (devise du compte)"
              value={equity}
              set={setEquity}
            />
            <NumberField
              label="Risque par position (%)"
              value={risk}
              set={setRisk}
            />
            <NumberField
              label="Distance au stop (% du prix d’entrée)"
              value={stop}
              set={setStop}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric
              label="Budget de perte"
              value={budget ? num(budget.budget) : '—'}
              detail="Dans la devise du compte"
            />
            <Metric
              label="Exposition théorique"
              value={budget ? num(budget.notional) : '—'}
              detail="Notionnel dans la même devise"
            />
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-zinc-500">
            Modèle linéaire : budget ÷ distance au stop. Conversion FX, valeur
            du point et multiplicateur du contrat à vérifier chez le courtier.
            Ce résultat n’est pas un nombre de lots. Frais, slippage et gaps
            peuvent dépasser le budget.
          </p>
        </Panel>
      </div>
    </div>
  )
}
