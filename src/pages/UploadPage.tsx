import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { parseCSV } from '@/lib/parser'
import { useTradeStore } from '@/store/useTradeStore'
import type { RawRow, Trade } from '@/lib/types'

type Status = 'idle' | 'selected' | 'loading' | 'success' | 'error'

interface FileInfo {
  name: string
  text: string
  rowCount: number
}

interface ParseResult {
  rawRows: RawRow[]
  trades: Trade[]
  initialBalance: number
  finalBalance: number
  netPnl: number
  periodStart: Date
  periodEnd: Date
}

interface SuccessSummaryProps {
  result: ParseResult
  fileName: string
}

function SuccessSummary({ result, fileName }: SuccessSummaryProps) {
  const { trades, initialBalance, finalBalance, netPnl, periodStart, periodEnd } = result
  const winCount = trades.filter((t) => t.win).length
  const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0
  const pnlPositive = netPnl >= 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{fileName}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{trades.length} trades</Badge>
        <Badge variant="outline">{winRate.toFixed(1)}% win rate</Badge>
        <Badge variant="outline">
          {format(periodStart, 'dd/MM/yyyy')} → {format(periodEnd, 'dd/MM/yyyy')}
        </Badge>
      </div>

      <Separator />

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Balance initiale</p>
          <p className="text-sm font-mono font-medium">
            ${initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Balance finale</p>
          <p className="text-sm font-mono font-medium">
            ${finalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">PnL net</p>
          <p className={cn(
            'text-sm font-mono font-semibold flex items-center justify-center gap-0.5',
            pnlPositive ? 'text-emerald-500' : 'text-red-500'
          )}>
            {pnlPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {pnlPositive ? '+' : ''}${Math.abs(netPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function UploadPage() {
  const navigate = useNavigate()
  const { setData } = useTradeStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [isDragging, setIsDragging] = useState(false)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setStatus('error')
      setErrorMsg('Le fichier doit être au format .csv')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) {
        setStatus('error')
        setErrorMsg('Impossible de lire le fichier.')
        return
      }

      setFileInfo({ name: file.name, text, rowCount: 0 })
      setStatus('loading')

      setTimeout(() => {
        try {
          const { rawRows, trades } = parseCSV(text)

          if (rawRows.length === 0) {
            setStatus('error')
            setErrorMsg("Aucune ligne valide trouvée. Vérifiez qu'il s'agit bien d'un export TradingView.")
            return
          }

          // rawRows are newest-first (CSV order) — oldest row is last
          const initialBalance = rawRows[rawRows.length - 1].balanceAvant
          const finalBalance = rawRows[0].balanceApres

          const sortedByTime = [...trades].sort((a, b) => a.openTime.getTime() - b.openTime.getTime())
          const periodStart = sortedByTime[0]?.openTime ?? new Date()
          const periodEnd = sortedByTime[sortedByTime.length - 1]?.closeTime ?? new Date()

          const netPnl = trades.reduce((s, t) => s + t.netPnl, 0)

          const result: ParseResult = { rawRows, trades, initialBalance, finalBalance, netPnl, periodStart, periodEnd }

          setData(rawRows, trades)
          setParseResult(result)
          setFileInfo((prev) => prev ? { ...prev, rowCount: rawRows.length } : null)
          setStatus('success')
        } catch (err) {
          setStatus('error')
          setErrorMsg(err instanceof Error ? err.message : 'Erreur lors du parsing.')
        }
      }, 50)
    }
    reader.onerror = () => {
      setStatus('error')
      setErrorMsg('Erreur de lecture du fichier.')
    }
    reader.readAsText(file, 'utf-8')
  }, [setData])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const handleReset = () => {
    setStatus('idle')
    setFileInfo(null)
    setParseResult(null)
    setErrorMsg('')
    setIsDragging(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Title */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Trading Analyzer</h1>
          <p className="text-sm text-muted-foreground">Importez votre export CSV TradingView Paper Trading</p>
        </div>

        {/* Drop zone card */}
        <Card className="border-border">
          <CardContent className="p-6">
            {status === 'success' && parseResult && fileInfo ? (
              <SuccessSummary result={parseResult} fileName={fileInfo.name} />
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => status !== 'loading' && inputRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && status !== 'loading' && inputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'relative rounded-lg border-2 border-dashed transition-colors cursor-pointer min-h-[180px] flex flex-col items-center justify-center gap-3 p-6 text-center select-none',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : status === 'error'
                      ? 'border-red-500/50 bg-red-500/5'
                      : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'
                )}
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground">Analyse en cours…</p>
                  </>
                ) : status === 'error' ? (
                  <>
                    <AlertCircle className="h-8 w-8 text-red-500" />
                    <div>
                      <p className="text-sm font-medium text-red-500">Erreur de parsing</p>
                      <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Cliquez pour réessayer</p>
                  </>
                ) : (
                  <>
                    {isDragging ? (
                      <Upload className="h-8 w-8 text-primary" />
                    ) : (
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {isDragging ? 'Déposer le fichier' : 'Glissez votre fichier CSV ici'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">ou cliquez pour sélectionner</p>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono">.csv</Badge>
                  </>
                )}
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
            />
          </CardContent>
        </Card>

        {/* Action buttons */}
        {status === 'success' && (
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset} className="flex-1">
              Nouveau fichier
            </Button>
            <Button onClick={() => navigate('/dashboard')} className="flex-1">
              Voir le dashboard
            </Button>
          </div>
        )}

        {/* Instructions */}
        {(status === 'idle' || status === 'error') && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Export depuis TradingView → Paper Trading → Historique des soldes → Export CSV
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
