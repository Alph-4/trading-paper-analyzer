import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, TrendingUp, TrendingDown, Download, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { parseRawRows, exportCSV } from '@/lib/parser'
import { useTradeStore } from '@/store/useTradeStore'
import type { RawRow, Trade } from '@/lib/types'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface FileInfo {
  name: string
}

interface ParseResult {
  rawRows: RawRow[]
  trades: Trade[]
  initialBalance: number
  finalBalance: number
  netPnl: number
  periodStart: Date
  periodEnd: Date
  addedRows?: number
  duplicateRows?: number
}

function summarize(rawRows: RawRow[], trades: Trade[]): ParseResult {
  return {
    rawRows,
    trades,
    initialBalance: rawRows[rawRows.length - 1].balanceAvant,
    finalBalance: rawRows[0].balanceApres,
    netPnl: trades.reduce((sum, trade) => sum + trade.netPnl, 0),
    periodStart: new Date(rawRows[rawRows.length - 1].heure.replace(' ', 'T')),
    periodEnd: new Date(rawRows[0].heure.replace(' ', 'T')),
  }
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

      {result.addedRows !== undefined && (
        <p className="text-xs text-muted-foreground" role="status">
          {result.addedRows} {result.addedRows > 1 ? 'nouvelles opérations' : 'nouvelle opération'} · {result.duplicateRows} {result.duplicateRows === 1 ? 'doublon ignoré' : 'doublons ignorés'}.
          {' '}L’historique ci-dessous regroupe tous vos imports.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{trades.length} trades clôturés</Badge>
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
          <p className="text-xs text-muted-foreground mb-0.5">PnL net des trades</p>
          <p className={cn(
            'text-sm font-mono font-semibold flex items-center justify-center gap-0.5',
            pnlPositive ? 'text-emerald-500' : 'text-red-500'
          )}>
            {pnlPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {pnlPositive ? '+' : '-'}${Math.abs(netPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function UploadPage() {
  const navigate = useNavigate()
  const { rawRows, trades, isLoaded, storageError, importRows, reset } = useTradeStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)

  const [status, setStatus] = useState<Status>('idle')
  const [isDragging, setIsDragging] = useState(false)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const processFile = useCallback(async (file: File) => {
    if (busyRef.current) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setStatus('error')
      setErrorMsg('Le fichier doit être au format .csv')
      return
    }

    busyRef.current = true
    setStatus('loading')
    setErrorMsg('')
    try {
      const text = await file.text()
      const imported = importRows(parseRawRows(text))
      setParseResult({ ...summarize(imported.rawRows, imported.trades), addedRows: imported.addedRows, duplicateRows: imported.duplicateRows })
      setFileInfo({ name: file.name })
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Impossible de lire ou de sauvegarder le fichier.')
    } finally {
      busyRef.current = false
    }
  }, [importRows])

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

  const handleExport = () => {
    const url = URL.createObjectURL(new Blob([exportCSV(rawRows)], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `trading-historique-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleClearHistory = () => {
    if (!window.confirm('Effacer tout l’historique enregistré sur cet appareil ? Exportez une sauvegarde CSV avant de continuer si vous souhaitez le conserver.')) return
    try {
      reset()
      handleReset()
    } catch {
      setStatus('error')
      setErrorMsg('Impossible d’effacer l’historique local. Vérifiez le stockage du navigateur.')
    }
  }

  return (
    <div className="min-h-[calc(100dvh-6rem)] bg-background flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Title */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Trading Analyzer</h1>
          <p className="text-sm text-muted-foreground">Importez votre export CSV TradingView Paper Trading</p>
        </div>

        {storageError && (
          <div role="alert" className="text-sm text-red-400 space-y-2">
            <p>{storageError}</p>
            <Button variant="outline" size="sm" onClick={handleClearHistory}>Réinitialiser la sauvegarde locale</Button>
          </div>
        )}

        {isLoaded && status !== 'success' && (
          <Card>
            <CardContent className="p-6">
              <SuccessSummary result={summarize(rawRows, trades)} fileName="Historique enregistré sur cet appareil" />
            </CardContent>
          </Card>
        )}

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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (status !== 'loading') inputRef.current?.click()
                  }
                }}
                aria-label="Importer un fichier CSV"
                aria-disabled={status === 'loading'}
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
                      <p className="text-sm font-medium text-red-500">Import impossible</p>
                      <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
                    </div>
                    <p className="text-xs text-muted-foreground" role="alert">Cliquez pour réessayer. L’historique précédent est conservé.</p>
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
              aria-label="Fichier CSV TradingView"
              disabled={status === 'loading'}
              onChange={handleFileInput}
              className="hidden"
            />
          </CardContent>
        </Card>

        {/* Action buttons */}
        {isLoaded && (
          <div className="flex gap-3">
            {status === 'success' && (
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Ajouter un autre CSV
              </Button>
            )}
            <Button onClick={() => navigate('/dashboard')} className="flex-1">
              Voir le dashboard
            </Button>
          </div>
        )}

        <div className="space-y-3 text-center">
          <p className="text-xs text-muted-foreground">
            Vos trades restent enregistrés dans ce navigateur après fermeture. Chaque nouvel import complète l’historique ; les doublons sont ignorés.
          </p>
          {isLoaded && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} disabled={status === 'loading'}>
                <Download /> Sauvegarder en CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClearHistory} disabled={status === 'loading'} className="text-muted-foreground">
                <Trash2 /> Effacer l’historique
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            La sauvegarde est propre à cet appareil. Exportez-la pour changer de navigateur ou avant d’effacer ses données.
          </p>
        </div>

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
