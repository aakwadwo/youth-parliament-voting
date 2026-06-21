'use client'

import { useFetch } from '@/lib/useFetch'

export default function Dashboard() {
    const { data: stats, loading, error } = useFetch('/api/admin/stats', {
        errorMessage: 'Could not load dashboard stats. Please refresh the page.',
    })

    if (error) return <p className="text-sm text-red-600" role="alert" aria-live="polite">{error}</p>

    if (loading || !stats) return (
        <div className="space-y-8">
            <div className="h-8 w-48 bg-zinc-100 rounded-lg animate-pulse" />
            <div className="grid grid-cols-3 gap-4">
                <div className="h-24 bg-zinc-100 rounded-xl animate-pulse" />
                <div className="h-24 bg-zinc-100 rounded-xl animate-pulse" />
                <div className="h-24 bg-zinc-100 rounded-xl animate-pulse" />
            </div>
            <div className="h-32 bg-zinc-100 rounded-xl animate-pulse" />
        </div>
    )

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-semibold text-black">Dashboard</h1>
                <p className="text-zinc-500 text-sm mt-1">Youth Parliament Ghana Elections overview</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-1">
                    <p className="text-sm text-zinc-500">Total votes cast</p>
                    <p className="text-3xl font-semibold text-black">{stats.totalVotes ?? 0}</p>
                </div>
                <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-1">
                    <p className="text-sm text-zinc-500">Voting status</p>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${stats.isActive ? 'bg-[#006B3F]' : 'bg-zinc-300'}`} />
                        <p className="text-lg font-semibold text-black">{stats.isActive ? 'Open' : 'Closed'}</p>
                    </div>
                </div>
                <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-1">
                    <p className="text-sm text-zinc-500">Voting window</p>
                    <p className="text-sm font-medium text-black mt-1">
                        {stats.opensAt ? new Date(stats.opensAt).toLocaleString() : '—'}
                    </p>
                    <p className="text-xs text-zinc-500">
                        to {stats.closesAt ? new Date(stats.closesAt).toLocaleString() : '—'}
                    </p>
                </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
                <p className="text-sm font-medium text-zinc-700">Election</p>
                <p className="text-xl font-semibold text-black">{stats.electionName}</p>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
                    stats.isActive
                        ? 'bg-green-50 text-[#006B3F] border border-green-200'
                        : 'bg-zinc-100 text-zinc-500 border border-zinc-200'
                }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${stats.isActive ? 'bg-[#006B3F]' : 'bg-zinc-400'}`} />
                    {stats.isActive ? 'Voting is currently open' : 'Voting is currently closed'}
                </div>
            </div>
        </div>
    )
}