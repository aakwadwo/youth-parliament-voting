import LoginForm from './LoginForm'
import { VotingNotOpen } from '@/components/VotingNotOpen'
import { readElection } from '@/lib/election-server'
import { isVotingOpen, ELECTION_STATUS } from '@/lib/election-status'

/**
 * The sign-in route's guard.
 *
 * The form itself has to be a client component — it holds field state, an
 * in-flight guard and a submit — and a client component cannot guard a route,
 * because by the time it runs the page has already been sent to the browser.
 * So this page used to render a working-looking sign-in form whatever the
 * election was doing, and only told a voter the poll was shut *after* they had
 * typed their mobile number and date of birth and pressed the button.
 *
 * That is the same defect the ballot route was given a server guard to fix, and
 * it mattered more here than it looks: `/vote/candidates` redirects to `/login`
 * whenever there is no voter session, so every latecomer who followed an old
 * ballot link — or a bookmark, or an SMS from before the deadline — was routed
 * into a form that could never work. Asking someone to hand over their date of
 * birth before telling them the election is over is both a dead end and a
 * pointless collection of personal data.
 *
 * The check now happens per request, before any form markup exists, exactly as
 * on the ballot route. `/api/login` enforces the same rule independently, so
 * this is the outer of two layers rather than the only one.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Sign in to vote' }

export default async function LoginRoute() {
    const { election, error } = await readElection()

    // Fails closed, like every other election gate in the platform: a state
    // that cannot be read is not a state in which sign-in is offered.
    if (error) {
        return (
            <VotingNotOpen
                election={null}
                title="Sign-in is temporarily unavailable"
                description="We could not confirm the election status, so sign-in cannot be opened."
            >
                Please try again shortly.
            </VotingNotOpen>
        )
    }

    if (!isVotingOpen(election.status)) {
        return (
            <VotingNotOpen election={election}>
                {election.status === ELECTION_STATUS.ENDED
                    ? 'Sign-in is closed for this election. If you voted, your ballot has been counted.'
                    : 'You will be able to sign in and vote once the poll opens. If you have already registered, there is nothing else to do now.'}
            </VotingNotOpen>
        )
    }

    return <LoginForm />
}
