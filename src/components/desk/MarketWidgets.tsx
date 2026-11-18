import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Panel, fieldClass } from './DeskUi'

function Widget({
  kind,
  symbol
}: {
  kind: 'chart' | 'calendar'
  symbol?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const container = ref.current
    if (!container) return
    setError(false)
    const host = document.createElement('div')
    host.className = 'tradingview-widget-container'
    host.style.height = '100%'
    const inner = document.createElement('div')
    inner.className = 'tradingview-widget-container__widget'
    inner.style.height = 'calc(100% - 32px)'
    host.appendChild(inner)
    const script = document.createElement('script')
    script.async = true
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${kind === 'chart' ? 'advanced-chart' : 'events'}.js`
    script.textContent = JSON.stringify(
      kind === 'chart'
        ? {
            autosize: true,
            symbol,
            interval: '60',
            timezone: 'Europe/Paris',
            theme: 'dark',
            style: '1',
            locale: 'fr',
            allow_symbol_change: true,
            calendar: false,
            hide_side_toolbar: false,
            support_host: 'https://www.tradingview.com'
          }
        : {
            colorTheme: 'dark',
            isTransparent: true,
            width: '100%',
            height: '100%',
            locale: 'fr',
            importanceFilter: '0,1',
            countryFilter: 'us,eu,gb,jp,ca,au,nz,ch'
          }
    )
    script.onerror = () => setError(true)
    host.appendChild(script)
    container.appendChild(host)
    return () => {
      script.onerror = null
      host.remove()
    }
  }, [kind, symbol])
  return (
    <>
      <div
        ref={ref}
        className={kind === 'chart' ? 'h-[540px] w-full' : 'h-[540px] w-full'}
      />
      {error && (
        <p role="alert" className="text-xs text-amber-400">
          Le widget ne se charge pas. Utilise le lien TradingView ci-dessous.
        </p>
      )}
      <a
        href={
          kind === 'chart'
            ? `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol ?? '')}`
            : 'https://www.tradingview.com/economic-calendar/'
        }
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200"
      >
        {kind === 'chart' ? 'Graphique' : 'Calendrier économique'} sur
        TradingView
        <ExternalLink size={10} />
      </a>
    </>
  )
}

export default function MarketWidgets({ pair }: { pair: string }) {
  const [instrument, setInstrument] = useState('fx')
  const symbol = instrument === 'fx' ? `FX:${pair}` : instrument
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-zinc-500">
        Widgets fournis par TradingView. Vérifie le délai de cotation indiqué
        par le fournisseur et le fuseau affiché dans le calendrier avant la
        session.
      </p>
      <div className="grid items-start gap-4 2xl:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Graphique de session"
          eyebrow="FX · indices · or"
          action={
            <select
              aria-label="Instrument du graphique"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              className={`${fieldClass} !w-auto`}
            >
              <option value="fx">
                {pair.slice(0, 3)}/{pair.slice(3)}
              </option>
              <option value="OANDA:XAUUSD">Or spot · XAU/USD</option>
              <option value="SP:SPX">S&P 500</option>
              <option value="NASDAQ:NDX">Nasdaq 100</option>
              <option value="XETR:DAX">DAX</option>
              <option value="TVC:DXY">Dollar · DXY</option>
              <option value="TVC:US10Y">Taux US 10 ans</option>
            </select>
          }
        >
          <Widget kind="chart" symbol={symbol} />
        </Panel>
        <Panel title="Agenda économique" eyebrow="Catalyseurs de la session">
          <Widget kind="calendar" />
        </Panel>
      </div>
    </div>
  )
}
