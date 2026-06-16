'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export default function Results() {
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        fetch('/api/admin/results')
            .then(r => r.json())
            .then(data => {
                setResults(data)
                setLoading(false)
            })
    }, [])

    async function handleExport() {
        const res = await fetch('/api/admin/results/export')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'results.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    const filtered = results.filter(r =>
        r.constituency_name.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-6">

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Results</h1>
                    <p className="text-zinc-500 text-sm mt-1">Votes per candidate per constituency</p>
                </div>
                <Button
                    variant="outline"
                    className="text-sm"
                    onClick={handleExport}
                >
                    Export CSV
                </Button>
            </div>

            <input
                placeholder="Search constituency..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-10 max-w-sm w-full border border-zinc-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />

            {loading && (
                <div className="space-y-3">
                    {[1,2,3].map(i => (
                        <div key={i} className="h-24 bg-zinc-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            )}

            {!loading && filtered.length === 0 && (
                <div className="bg-white border border-zinc-200 rounded-xl px-5 py-12 text-center">
                    <p className="text-zinc-400 text-sm">No results found</p>
                </div>
            )}

            {!loading && filtered.map(constituency => (
                <div key={constituency.constituency_id} className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
                        <div>
                            <p className="font-medium text-black">{constituency.constituency_name}</p>
                            <p className="text-xs text-zinc-400 mt-0.5">{constituency.total_votes} vote{constituency.total_votes !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <div className="divide-y divide-zinc-50">
                        {constituency.candidates.map((candidate, i) => {
                            const pct = constituency.total_votes > 0
                                ? Math.round((candidate.votes / constituency.total_votes) * 100)
                                : 0
                            return (
                                <div key={i} className="px-5 py-3 space-y-1.5">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium text-black">{candidate.name}</span>
                                        <span className="text-zinc-500">{candidate.votes} vote{candidate.votes !== 1 ? 's' : ''} · {pct}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-black rounded-full transition-all"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}

        </div>
    )
}