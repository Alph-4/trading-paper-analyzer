import React, { useMemo, useState } from 'react'
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from './ui/table'
import useTradeSignals from '@/hooks/useTradeSignals'
import { ArrowUp, ArrowDown, Minus, ArrowsUpDown } from 'lucide-react'

type SortKey = 'strength' | 'confidence' | 'symbol' | 'direction'

export function TradeSignalTable() {
    const signals = useTradeSignals()
    const [sortKey, setSortKey] = useState<SortKey>('strength')
    const [asc, setAsc] = useState(false)

    function toggleSort(k: SortKey) {
        if (k === sortKey) {
            setAsc((s) => !s)
        } else {
            setSortKey(k)
            setAsc(false)
        }
    }

    const sorted = useMemo(() => {
        const out = signals.slice()
        const dir = asc ? 1 : -1
        out.sort((a, b) => {
            if (sortKey === 'strength') return (a.strength - b.strength) * dir
            if (sortKey === 'confidence') return (a.confidence - b.confidence) * dir
            if (sortKey === 'symbol') return a.symbol.localeCompare(b.symbol) * dir
            // direction order: long > neutral > short
            const order = (d: string) => (d === 'long' ? 2 : d === 'neutral' ? 1 : 0)
            return (order(a.direction) - order(b.direction)) * dir
        })
        return out
    }, [signals, sortKey, asc])

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <div className="flex gap-2">
                    <button className={`px-2 py-1 rounded text-sm ${sortKey === 'strength' ? 'bg-zinc-800' : 'bg-zinc-700'}`} onClick={() => toggleSort('strength')}>Strength</button>
                    <button className={`px-2 py-1 rounded text-sm ${sortKey === 'confidence' ? 'bg-zinc-800' : 'bg-zinc-700'}`} onClick={() => toggleSort('confidence')}>Confidence</button>
                    <button className={`px-2 py-1 rounded text-sm ${sortKey === 'symbol' ? 'bg-zinc-800' : 'bg-zinc-700'}`} onClick={() => toggleSort('symbol')}>Symbol</button>
                    <button className={`px-2 py-1 rounded text-sm ${sortKey === 'direction' ? 'bg-zinc-800' : 'bg-zinc-700'}`} onClick={() => toggleSort('direction')}>Signal</button>
                </div>
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <ArrowsUpDown size={14} />
                    <span>{asc ? 'Ascending' : 'Descending'}</span>
                </div>
            </div>

            <div className="overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Pair</TableHead>
                            <TableHead>Base</TableHead>
                            <TableHead>Quote</TableHead>
                            <TableHead>Base</TableHead>
                            <TableHead>Quote</TableHead>
                            <TableHead>Signal</TableHead>
                            <TableHead>Strength</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sorted.map((s) => (
                            <TableRow key={s.symbol}>
                                <TableCell className="font-mono">{`${s.base}/${s.quote}`}</TableCell>
                                <TableCell>{s.baseConviction.stance}</TableCell>
                                <TableCell>{s.quoteConviction.stance}</TableCell>
                                <TableCell className="text-sm text-zinc-300">{s.baseConviction.score}</TableCell>
                                <TableCell className="text-sm text-zinc-300">{s.quoteConviction.score}</TableCell>
                                <TableCell>
                                    {s.direction === 'long' ? (
                                        <div className="flex items-center gap-2 text-emerald-400">
                                            <ArrowUp size={14} /> <span>Long</span>
                                        </div>
                                    ) : s.direction === 'short' ? (
                                        <div className="flex items-center gap-2 text-red-400">
                                            <ArrowDown size={14} /> <span>Short</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-zinc-400">
                                            <Minus size={14} /> <span>Neutral</span>
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="w-28 h-2 bg-zinc-800 rounded overflow-hidden">
                                            <div
                                                style={{ width: `${(s.strength / 5) * 100}%` }}
                                                className={`h-2 ${s.direction === 'long' ? 'bg-emerald-500' : s.direction === 'short' ? 'bg-red-500' : 'bg-zinc-600'
                                                    }`}
                                            />
                                        </div>
                                        <div className="text-sm text-zinc-300 w-10 text-right">{s.strength}</div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}

export default TradeSignalTable
