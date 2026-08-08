'use client'

import { useMemo, useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Stat, StatGrid, StatSkeleton } from '@/components/ui/stat'
import { Skeleton, EmptyState, VoteBar } from '@/components/ui/feedback'
import { SectionHeader } from '@/components/admin/SectionHeader'
import ResultsPublication from '@/components/admin/ResultsPublication'
import { useFetch } from '@/lib/useFetch'

const nf = new Intl.NumberFormat('en-GB')

export default function Results() {
    const { data, loading, error, reload } = useFetch('/api/admin/results', {
        errorMessage: 'Could not load results.',
    })

    const [search, setSearch] = useState('')
    const [regionFilter, setRegionFilter] = useState('all')

    // Memoised so the empty-array fallback is not a fresh identity on every
    // render, which would defeat the memoisation of everything derived from it.
    const constituencies = useMemo(() => data?.constituencies ?? [], [data])
    const summary = data?.summary

    const regions = useMemo(
        () => [...new Set(constituencies.map((c) => c.region).filter(Boolean))].sort(),
        [constituencies]
    )

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase()
        return constituencies.filter((c) => {
            if (regionFilter !== 'all' && c.region !== regionFilter) return false
            if (!term) return true
            return (
                c.name.toLowerCase().includes(term) ||
                (c.region ?? '').toLowerCase().includes(term) ||
                c.candidates.some((cand) => cand.name.toLowerCase().includes(term))
            )
        })
    }, [constituencies, search, regionFilter])

    if (error) {
        return (
            <div className="space-y-6">
                <SectionHeader title="Results" />
                <Alert variant="danger" title="Could not load results">
                    <p>{error}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={reload}
                        pending={loading}
                    >
                        {loading ? null : <RefreshCw aria-hidden="true" />}
                        Try again
                    </Button>
                </Alert>

                {/* Still offered when the tallies will not load. Whether the
                    result is currently on public display is a separate fact
                    from whether this screen can render it, and an
                    administrator must be able to withdraw a published result
                    even on a screen that is otherwise broken. */}
                <ResultsPublication />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <SectionHeader
                title="Results"
                description="Live tallies per candidate, per constituency"
                actions={
                    <Button variant="outline" size="sm" onClick={reload} pending={loading}>
                        {loading ? null : <RefreshCw aria-hidden="true" />}
                        Refresh
                    </Button>
                }
            />

            {loading && !data ? (
                <>
                    <StatGrid cols={3}>
                        {[0, 1, 2].map((i) => (
                            <StatSkeleton key={i} />
                        ))}
                    </StatGrid>
                    <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} className="h-40 w-full rounded-xl" />
                        ))}
                    </div>
                </>
            ) : null}

            {summary ? (
                <StatGrid cols={3}>
                    <Stat label="Ballots counted" value={nf.format(summary.totalBallots)} />
                    <Stat label="Turnout" value={`${summary.turnoutPct}%`} />
                    <Stat
                        label="Constituencies declared"
                        value={`${summary.declaredConstituencies} of ${summary.totalConstituencies}`}
                    />
                </StatGrid>
            ) : null}

            {data ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1 sm:max-w-sm">
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            type="search"
                            className="pl-9"
                            placeholder="Search constituency or candidate"
                            aria-label="Search results"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="sm:w-56">
                        <label htmlFor="results-region" className="sr-only">
                            Filter by region
                        </label>
                        <select
                            id="results-region"
                            value={regionFilter}
                            onChange={(e) => setRegionFilter(e.target.value)}
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-sm"
                        >
                            <option value="all">All regions</option>
                            {regions.map((r) => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            ) : null}

            {data && filtered.length === 0 ? (
                <div className="rounded-xl border border-border bg-card">
                    <EmptyState
                        title={
                            constituencies.length === 0
                                ? 'No results yet'
                                : 'Nothing matches those filters'
                        }
                        description={
                            constituencies.length === 0
                                ? 'Results appear here once constituencies and candidates have been set up and voting has begun.'
                                : 'Try a different search term or region.'
                        }
                        action={
                            constituencies.length > 0 ? (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setSearch('')
                                        setRegionFilter('all')
                                    }}
                                >
                                    Clear filters
                                </Button>
                            ) : null
                        }
                    />
                </div>
            ) : null}

            <div className="space-y-4">
                {filtered.map((constituency) => {
                    const winnerIds = new Set(constituency.winners.map((w) => w.id))
                    const tied = constituency.winners.length > 1
                    const leadingVotes = constituency.candidates[0]?.votes ?? 0

                    return (
                        <section
                            key={constituency.id}
                            aria-labelledby={`c-${constituency.id}`}
                            className="overflow-hidden rounded-xl border border-border bg-card"
                        >
                            <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                                <div className="min-w-0">
                                    <h2
                                        id={`c-${constituency.id}`}
                                        className="truncate font-semibold"
                                    >
                                        {constituency.name}
                                    </h2>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        {constituency.region ?? 'Region not set'} ·{' '}
                                        <span className="numeric">
                                            {nf.format(constituency.totalVotes)}
                                        </span>{' '}
                                        {constituency.totalVotes === 1 ? 'ballot' : 'ballots'} ·{' '}
                                        <span className="numeric">{constituency.turnoutPct}%</span>{' '}
                                        turnout
                                    </p>
                                </div>
                                {constituency.totalVotes === 0 ? (
                                    <Badge variant="warning">No ballots cast</Badge>
                                ) : tied ? (
                                    <Badge variant="warning">                                        Tied
                                    </Badge>
                                ) : (
                                    <Badge variant="success">                                        Declared
                                    </Badge>
                                )}
                            </div>

                            <ul className="divide-y divide-border">
                                {constituency.candidates.map((candidate) => {
                                    const isWinner = winnerIds.has(candidate.id)
                                    return (
                                        <li key={candidate.id} className="px-4 py-3.5 sm:px-5">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <span
                                                        className={`truncate ${isWinner ? 'font-semibold' : 'font-medium'}`}
                                                    >
                                                        {candidate.name}
                                                    </span>
                                                    {isWinner ? (
                                                        <Badge variant="success">
                                                            {tied ? 'Tied' : 'Elected'}
                                                        </Badge>
                                                    ) : null}
                                                    {!candidate.isActive ? (
                                                        <Badge variant="neutral">Withdrawn</Badge>
                                                    ) : null}
                                                </span>
                                                <span className="numeric shrink-0 text-sm text-muted-foreground">
                                                    {nf.format(candidate.votes)} ·{' '}
                                                    {candidate.sharePct}%
                                                </span>
                                            </div>
                                            <VoteBar
                                                className="mt-2"
                                                value={candidate.votes}
                                                max={Math.max(1, leadingVotes)}
                                                tone={isWinner ? 'brand' : 'muted'}
                                                label={`${candidate.name}: ${candidate.votes} votes, ${candidate.sharePct}% of ballots in ${constituency.name}`}
                                            />
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    )
                })}
            </div>

            {/* Below the figures, not beside them: the declaration is the last
                thing an administrator does, after reading the tallies above
                and reconciling them in Reports. */}
            <div className="border-t border-border pt-6">
                <ResultsPublication />
            </div>
        </div>
    )
}
