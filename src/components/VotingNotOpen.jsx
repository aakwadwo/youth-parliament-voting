import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { ELECTION_STATUS, electionGateMessage, formatWhen } from '@/lib/election-status'

/**
 * The screen a voter sees wherever voting is refused because of the election's
 * state — the ballot route guard, the sign-in page, the confirmation step.
 *
 * One component rather than three, because the failure mode being avoided is a
 * platform that says "voting has not opened" on one screen and "voting is
 * currently closed" on the next for the same underlying situation. The
 * headline sentences are the same constants the API returns, so a voter
 * stopped by the browser and a voter stopped by the server read identical
 * words.
 *
 * A server component: it renders from state the caller already has and needs
 * no interactivity.
 */
export function VotingNotOpen({ election, title, description, children }) {
    const status = election?.status ?? ELECTION_STATUS.CLOSED

    const heading =
        title ??
        {
            [ELECTION_STATUS.SCHEDULED]: 'Voting has not opened yet',
            [ELECTION_STATUS.ENDED]: 'Voting has ended',
            [ELECTION_STATUS.CLOSED]: 'Voting is not open',
        }[status]

    return (
        <PageShell width="sm" credit={false}>
            <PageHeading title={heading} description={description ?? electionGateMessage(status)} />

            {children ? (
                <div className="mt-4 leading-relaxed text-muted-foreground">{children}</div>
            ) : null}

            <ElectionWindow election={election} />

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="sm:w-auto">
                    <Link href="/">Return home</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="sm:w-auto">
                    <Link href="/election">View election details</Link>
                </Button>
            </div>
        </PageShell>
    )
}

/**
 * The published window, when there is one.
 *
 * "The election has not started yet" without a date is an answer a voter
 * cannot act on — it tells them to come back at an unspecified time. The dates
 * are the useful part, so they are shown wherever they exist.
 */
export function ElectionWindow({ election, className }) {
    if (!election?.opensAt && !election?.closesAt) return null

    return (
        <dl
            className={`mt-6 divide-y divide-border rounded-xl border border-border bg-surface px-4 py-1 sm:px-5 ${className ?? ''}`}
        >
            {election.opensAt ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                    <dt className="text-sm text-muted-foreground">Voting opens</dt>
                    <dd className="font-medium">{formatWhen(election.opensAt)}</dd>
                </div>
            ) : null}
            {election.closesAt ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                    <dt className="text-sm text-muted-foreground">Voting closes</dt>
                    <dd className="font-medium">{formatWhen(election.closesAt)}</dd>
                </div>
            ) : null}
        </dl>
    )
}
