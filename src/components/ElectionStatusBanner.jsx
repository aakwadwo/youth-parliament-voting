'use client'

import { Skeleton } from '@/components/ui/feedback'
import { StatusPill } from '@/components/ui/badge'
import { useElectionStatus, describeElection } from '@/lib/voter-client'

/**
 * States the election's name, its window and whether the poll is open.
 *
 * Without it a voter could complete registration and select a candidate before
 * discovering, at the single irreversible step, that voting had not opened.
 *
 * `initial` is the state a server component has already read. Passing it
 * matters on the landing page: the front door of the service should not open
 * on a grey placeholder that resolves into the election's status a moment
 * later, and someone on a slow connection should not be shown nothing where
 * the server already knew the answer.
 */
export function ElectionStatusPanel({ initial = null, className }) {
    const { data, loading, error } = useElectionStatus({ initial })

    if (loading && !data) {
        return <Skeleton className={`h-[4.5rem] w-full rounded-xl ${className ?? ''}`} />
    }

    // A failure to read status must never block the flow, so this renders
    // nothing rather than an alarming error on the front page.
    if (!data) return null

    const status = describeElection(data)

    return (
        <div
            className={`rounded-xl border border-border bg-surface px-4 py-3.5 sm:px-5 ${className ?? ''}`}
        >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold">{data.electionName}</p>
                    {status.detail ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">{status.detail}</p>
                    ) : null}
                </div>
                <StatusPill variant={status.variant}>{status.label}</StatusPill>
            </div>
            {error ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    Status last checked a moment ago.
                </p>
            ) : null}
        </div>
    )
}
