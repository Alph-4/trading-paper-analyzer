import React, { useState } from 'react'
import CurrencyConvictionPanel from '@/components/CurrencyConvictionPanel'
import TradeSignalTable from '@/components/TradeSignalTable'
import { useConvictionStore } from '@/store/useConvictionStore'
import { parsePairsFromText } from '@/lib/conviction'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function ConvictionsPage() {
  const allowedPairs = useConvictionStore((s) => s.allowedPairs)
  const setPairs = useConvictionStore((s) => s.setPairs)
  const resetPairs = useConvictionStore((s) => s.resetPairs)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  function startEdit() {
    setText(allowedPairs.map((p) => `${p.slice(0, 3)}/${p.slice(3, 6)}`).join(', '))
    setEditing(true)
  }

  function applyPairs() {
    const parsed = parsePairsFromText(text)
    setPairs(parsed)
    setEditing(false)
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-4">
        <CurrencyConvictionPanel />
      </div>
      <div className="col-span-8">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Liste de paires</CardTitle>
              <div className="text-sm text-muted-foreground">Edite les paires que tu veux analyser (format EUR/USD ou EURUSD)</div>
            </CardHeader>
            <CardContent>
              {!editing ? (
                <div className="flex items-center justify-between">
                  <div className="flex-1 text-sm text-zinc-200">{allowedPairs.map((p) => `${p.slice(0, 3)}/${p.slice(3, 6)}`).join(', ')}</div>
                  <div className="ml-4 flex gap-2">
                    <button className="px-3 py-1 rounded bg-zinc-800 text-sm" onClick={() => startEdit()}>
                      Edit
                    </button>
                    <button className="px-3 py-1 rounded bg-zinc-700 text-sm" onClick={() => resetPairs()}>
                      Reset
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea className="w-full h-24 bg-zinc-900 p-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="px-3 py-1 rounded bg-emerald-600 text-sm" onClick={() => applyPairs()}>
                      Save
                    </button>
                    <button className="px-3 py-1 rounded bg-zinc-800 text-sm" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-lg font-semibold mb-4">Recommandations de trade</h3>
            <TradeSignalTable />
          </div>
        </div>
      </div>
    </div>
  )
}
