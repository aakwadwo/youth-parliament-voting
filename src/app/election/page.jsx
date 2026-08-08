import { NavButton } from '@/components/NavButton'
import { StatusPill } from '@/components/ui/badge'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { ElectionWindow } from '@/components/VotingNotOpen'
import { Prose } from '@/components/layout/Prose'
import { readElection } from '@/lib/election-server'
import {
    ELECTION_STATUS,
    ELECTION_STATUS_TONE,
    electionActions,
    electionResultsNotice,
    formatWhen,
} from '@/lib/election-status'
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

// Labels only. The tone comes from ELECTION_STATUS_TONE, shared with the
// landing panel and the admin dashboard: green means a ballot can be cast right
// now, and every other state is the same neutral.
const STATUS_PILL = {
    [ELECTION_STATUS.OPEN]: { variant: ELECTION_STATUS_TONE.open, label: 'Voting is open' },
    [ELECTION_STATUS.SCHEDULED]: {
        variant: ELECTION_STATUS_TONE.scheduled,
        label: 'Voting has not opened yet',
    },
    [ELECTION_STATUS.ENDED]: { variant: ELECTION_STATUS_TONE.ended, label: 'Voting has ended' },
    [ELECTION_STATUS.CLOSED]: {
        variant: ELECTION_STATUS_TONE.closed,
        label: 'Voting is currently closed',
    },
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
            // While the count is with the Commission, say so here rather than
            // stopping at "Voting has ended." This is the page a voter is sent
            // to when there is no result to link to yet, so it has to answer
            // the question that sent them.
            return electionResultsNotice(election) ?? 'Voting has ended.'
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
                <NavButton href="/" variant="outline" size="lg" className="mt-8 w-full sm:w-auto">
                    Return home
                </NavButton>
            </PageShell>
        )
    }

    const pill = STATUS_PILL[election.status] ?? STATUS_PILL[ELECTION_STATUS.CLOSED]

    // The same actions the landing page offers, from the same function, so the
    // two screens cannot end up disagreeing about what a voter may do — which
    // is exactly what happened when each decided for itself.
    //
    // The one adjustment is local: this page is `/election`, so the scheduled
    // state's "View election details" would be a button that reloads the page
    // the reader is already on. It becomes the way back instead. Nothing is
    // added, and no state gains a third button.
    const actions = electionActions(election).map((action) =>
        action.href === '/election' ? { href: '/', label: 'Return home' } : action
    )

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
                {actions.map((action, i) => (
                    <NavButton
                        key={action.href}
                        href={action.href}
                        variant={i === 0 ? 'default' : 'outline'}
                        size="lg"
                        className="sm:w-auto"
                    >
                        {action.label}
                    </NavButton>
                ))}
            </div>

            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
                These dates are set by the {ELECTORAL_COMMISSION}. If anything here does not match
                what you have been told, contact the Commission before voting.
            </p>
        </PageShell>
    )
}
