import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { useConvictionStore, DEFAULT_CURRENCIES_LIST } from '@/store/useConvictionStore'

function StanceButton({ active, color, children, onClick }: any) {
    return (
        <button
            onClick={onClick}
            className={`px-2 py-1 rounded text-xs font-medium ${active ? `${color} text-white` : 'bg-zinc-800 text-zinc-300'
                }`}
        >
            {children}
        </button>
    )
}

export function CurrencyConvictionPanel() {
    const convictions = useConvictionStore((s) => s.convictions)
    const setConviction = useConvictionStore((s) => s.setConviction)

    return (
        <Card>
            <CardHeader>
                <CardTitle>Convictions par devise</CardTitle>
                <div className="text-sm text-muted-foreground">Définis ta position et ta conviction (0–5)</div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {DEFAULT_CURRENCIES_LIST.map((c) => {
                        const cv = convictions[c] ?? { currency: c, stance: 'neutral', score: 0, updatedAt: 0 }
                        return (
                            <div key={c} className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800">
                                <div className="w-14 text-sm font-semibold">{c}</div>

                                <div className="flex items-center gap-2">
                                    <StanceButton
                                        active={cv.stance === 'long'}
                                        color="bg-emerald-500"
                                        onClick={() => setConviction(c, 'long', cv.score)}
                                    >
                                        Long
                                    </StanceButton>
                                    <StanceButton
                                        active={cv.stance === 'neutral'}
                                        color="bg-zinc-500"
                                        onClick={() => setConviction(c, 'neutral', cv.score)}
                                    >
                                        Neutral
                                    </StanceButton>
                                    <StanceButton
                                        active={cv.stance === 'short'}
                                        color="bg-red-500"
                                        onClick={() => setConviction(c, 'short', cv.score)}
                                    >
                                        Short
                                    </StanceButton>
                                </div>

                                <div className="flex-1">
                                    <input
                                        aria-label={`conviction-${c}`}
                                        type="range"
                                        min={0}
                                        max={5}
                                        step={1}
                                        value={cv.score}
                                        onChange={(e) => setConviction(c, cv.stance as any, Number(e.target.value))}
                                        className="w-full h-2 bg-zinc-800 rounded-lg"
                                    />
                                </div>

                                <div className="w-8 text-right text-sm text-zinc-200">{cv.score}</div>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}

export default CurrencyConvictionPanel
