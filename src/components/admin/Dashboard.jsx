'use client'

import { RefreshCw } from 'lucide-react'

import { useFetch } from '@/lib/useFetch'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { StatusPill } from '@/components/ui/badge'
import { Stat, StatGrid, StatSkeleton } from '@/components/ui/stat'
import { Skeleton, VoteBar, EmptyState } from '@/components/ui/feedback'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { ELECTION_STATUS_TONE } from '@/lib/election-status'
import { formatWhen } from '@/lib/voter-client'

// Shorter labels than the voter-facing pills — an administrator is scanning a
// dashboard, not reading a sentence — but the same tones, so the state an
// administrator sees here is the state a voter sees on the front page.
const STATUS = {
    open: { variant: ELECTION_STATUS_TONE.open, label: 'Open' },
    scheduled: { variant: ELECTION_STATUS_TONE.scheduled, label: 'Scheduled' },
    ended: { variant: ELECTION_STATUS_TONE.ended, label: 'Closed' },
    closed: { variant: ELECTION_STATUS_TONE.closed, label: 'Closed' },
}

const nf = new Intl.NumberFormat('en-GB')

export default function Dashboard() {
    const { data, loading, error, reload } = useFetch('/api/admin/stats', {
        // Shared with the other read-only consumer of this endpoint so moving
        // between Dashboard and Reports does not re-run the aggregates. Short,
        // because these are live election figures; "Refresh" bypasses it.
        cacheTtl: 15_000,
        errorMessage: 'Could not load dashboard statistics.',
    })

    if (error) {
        return (
            <div className="space-y-6">
                <SectionHeader title="Dashboard" />
                <Alert variant="danger" title="Could not load the dashboard">
                    <p>{error}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={reload}
                        pending={loading}
                        pendingLabel="Trying again…"
                    >
                        Try again
                    </Button>
                </Alert>
            </div>
        )
    }

    if (loading || !data) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-9 w-48" />
                <StatGrid>
                    {[0, 1, 2, 3].map((i) => (
                        <StatSkeleton key={i} />
                    ))}
                </StatGrid>
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        )
    }

    const { election, totals, timeline, reconciliation, regions } = data
    const status = STATUS[election.status]
    const maxRegionTurnout = Math.max(10, ...regions.map((r) => r.turnoutPct))

    return (
        <div className="space-y-6">
            <SectionHeader
                title="Dashboard"
                description={election.name ?? 'No election configured yet.'}
                actions={
                    // The icon gives way to the spinner rather than sitting
                    // beside it: both are size-4 behind the same gap, so the
                    // button does not change width mid-refresh.
                    <Button variant="outline" size="sm" onClick={reload} pending={loading}>
                        {loading ? null : <RefreshCw aria-hidden="true" />}
                        Refresh
                    </Button>
                }
            />

            {/* A voter marked as having voted with no matching ballot is the
                single most important integrity signal this system can raise, so
                it sits above every other figure. It is stated once, here, and
                not repeated at the foot of the page. */}
            {!reconciliation.balanced ? (
                <Alert variant="danger" title="Ballot reconciliation discrepancy">
                    {nf.format(reconciliation.votersMarkedVoted)} voters are marked as having
                    voted, but {nf.format(reconciliation.ballotsRecorded)} ballots are recorded.
                    Investigate before publishing any result.
                </Alert>
            ) : null}

            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className="min-w-0 truncate text-lg font-semibold">
                        {election.name ?? 'Untitled election'}
                    </p>
                    <StatusPill variant={status.variant}>{status.label}</StatusPill>
                </div>

                <dl className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                        ['Opens', election.opensAt ? formatWhen(election.opensAt) : 'Not set'],
                        ['Closes', election.closesAt ? formatWhen(election.closesAt) : 'Not set'],
                        [
                            'First ballot',
                            timeline.firstVoteAt ? formatWhen(timeline.firstVoteAt) : 'None yet',
                        ],
                        [
                            'Latest ballot',
                            timeline.lastVoteAt ? formatWhen(timeline.lastVoteAt) : 'None yet',
                        ],
                    ].map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-xs text-muted-foreground">{label}</dt>
                            <dd className="mt-0.5 text-sm font-medium">{value}</dd>
                        </div>
                    ))}
                </dl>
            </div>

            <StatGrid>
                <Stat
                    label="Ballots cast"
                    value={nf.format(totals.ballots)}
                    hint={`${totals.contestedConstituencies} of ${totals.constituencies} constituencies contested`}
                />
                <Stat
                    label="Turnout"
                    value={`${totals.turnoutPct}%`}
                    hint="Of verified registered voters"
                />
                <Stat
                    label="Registered voters"
                    value={nf.format(totals.registered)}
                    hint={`${nf.format(totals.verified)} verified`}
                />
                <Stat
                    label="Candidates standing"
                    value={nf.format(totals.activeCandidates)}
                    hint={`${nf.format(totals.candidates)} total on file`}
                />
            </StatGrid>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-4 sm:px-5">
                    <h2 className="font-semibold">Turnout by region</h2>
                    <p className="text-sm text-muted-foreground">
                        Ballots cast as a share of registered voters
                    </p>
                </div>

                {regions.length === 0 ? (
                    <EmptyState
                        title="No regional data yet"
                        description="This appears once constituencies have been imported and voters have registered."
                    />
                ) : (
                    <ul className="divide-y divide-border">
                        {regions.map((region) => (
                            <li key={region.region} className="px-4 py-3.5 sm:px-5">
                                <div className="flex items-baseline justify-between gap-4">
                                    <span className="truncate font-medium">{region.region}</span>
                                    <span className="numeric shrink-0 text-sm text-muted-foreground">
                                        {nf.format(region.ballots)} · {region.turnoutPct}%
                                    </span>
                                </div>
                                <VoteBar
                                    className="mt-2"
                                    value={region.turnoutPct}
                                    max={maxRegionTurnout}
                                    label={`${region.region}: ${region.turnoutPct}% turnout, ${region.ballots} ballots from ${region.registered} registered voters`}
                                />
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    {nf.format(region.registered)} registered across{' '}
                                    {region.constituencies} constituenc
                                    {region.constituencies === 1 ? 'y' : 'ies'}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
