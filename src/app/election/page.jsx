import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/badge'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { ElectionWindow } from '@/components/VotingNotOpen'
import { Prose } from '@/components/layout/Prose'
import { readElection } from '@/lib/election-server'
import { ELECTION_STATUS, formatWhen } from '@/lib/election-status'
import { ELECTION_NAME, ELECTORAL_COMMISSION } from '@/lib/election'

/**
 * Everything the Commission has published about this election, in one place.
 *
 * Exists because the state-aware screens elsewhere all need somewhere to send
 * a voter who cannot vote yet. "Voting opens on 3 August" with no way to find
 * out anything more is a dead end, and the registration confirmation shown
 * before a poll opens is otherwise a screen with only a back button.
 *
 * Every field is read from the admin settings row. Nothing on this page is
 * written in the source, including the status: this is the page most likely to
 * be checked by someone asking "is this real and when is it", so it must never
 * be capable of describing an election that no longer matches what the
 * administrators configured.
 */
export const revalidate = 15

export async function generateMetadata() {
    const { election } = await readElection()
    const name = election?.electionName ?? ELECTION_NAME
    return {
        title: 'Election details',
        description: `Dates, status and information for the ${name}.`,
    }
}

const STATUS_PILL = {
    [ELECTION_STATUS.OPEN]: { variant: 'success', label: 'Voting is open' },
    [ELECTION_STATUS.SCHEDULED]: { variant: 'warning', label: 'Voting has not opened yet' },
    [ELECTION_STATUS.ENDED]: { variant: 'neutral', label: 'Voting has ended' },
    [ELECTION_STATUS.CLOSED]: { variant: 'neutral', label: 'Voting is currently closed' },
}

/** The sentence the spec asks the platform to lead with in each state. */
function summarise(election) {
    switch (election.status) {
        case ELECTION_STATUS.OPEN:
            return election.opensAt && election.closesAt
                ? `Voting is open from ${formatWhen(election.opensAt)} to ${formatWhen(election.closesAt)}.`
                : 'Voting is open now.'
        case ELECTION_STATUS.SCHEDULED:
            return election.opensAt
                ? `Voting opens on ${formatWhen(election.opensAt)}.`
                : 'Voting will open during the scheduled election period.'
        case ELECTION_STATUS.ENDED:
            return 'Voting has ended.'
        default:
            return 'Voting is not open at the moment.'
    }
}

export default async function ElectionDetailsPage() {
    const { election, error } = await readElection()

    if (error || !election) {
        return (
            <PageShell width="md">
                <PageHeading
                    title="Election details"
                    description="We could not load the election details just now. Please try again shortly."
                />
                <Button asChild variant="outline" size="lg" className="mt-8 w-full sm:w-auto">
                    <Link href="/">Return home</Link>
                </Button>
            </PageShell>
        )
    }

    const pill = STATUS_PILL[election.status] ?? STATUS_PILL[ELECTION_STATUS.CLOSED]
    const open = election.status === ELECTION_STATUS.OPEN

    return (
        <PageShell width="md">
            <PageHeading title={election.electionName} description={summarise(election)} />

            <div className="mt-6">
                <StatusPill variant={pill.variant}>{pill.label}</StatusPill>
            </div>

            <ElectionWindow election={election} />

            {election.description?.trim() ? (
                <Prose className="mt-8">
                    <h2>About this election</h2>
                    <p>{election.description}</p>
                </Prose>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="sm:w-auto">
                    <Link href="/register">Register to vote</Link>
                </Button>
                {/* Only offered while it leads somewhere. */}
                {open ? (
                    <Button asChild variant="outline" size="lg" className="sm:w-auto">
                        <Link href="/login">Sign in to vote</Link>
                    </Button>
                ) : (
                    <Button asChild variant="outline" size="lg" className="sm:w-auto">
                        <Link href="/">Return home</Link>
                    </Button>
                )}
            </div>

            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
                These dates are set by the {ELECTORAL_COMMISSION}. If anything here does not match
                what you have been told, contact the Commission before voting.
            </p>
        </PageShell>
    )
}
