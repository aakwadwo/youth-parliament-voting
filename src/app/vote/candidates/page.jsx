import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

import Ballot from './Ballot'
import { VotingNotOpen } from '@/components/VotingNotOpen'
import { Button } from '@/components/ui/button'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { readElection } from '@/lib/election-server'
import { isVotingOpen, ELECTION_STATUS } from '@/lib/election-status'
import { getVoterIdFromCookies } from '@/lib/voter-session'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * The ballot route's guard.
 *
 * The ballot itself has to be a client component — it holds a selection, a
 * confirmation step and an irreversible submit — but a client component cannot
 * guard a route, because by the time it runs the page has already been sent to
 * the browser. Two things were therefore only enforced after the fact:
 *
 *   * the voting window. Typing this URL before the poll opened delivered a
 *     working ballot, and the candidate list with it, which only failed at the
 *     final step.
 *
 *   * the voter's identity. The page decided who you were from sessionStorage,
 *     which is display data the browser can edit at will. Anyone could put a
 *     constituency id there and be shown that constituency's ballot; only
 *     /api/vote ever checked the httpOnly cookie that actually authenticates a
 *     voter.
 *
 * Both are now checked here, per request, before any ballot markup exists.
 * `/api/candidates` and `/api/vote` enforce the same rules independently, so
 * this is the outermost of several layers rather than the only one.
 */
export const dynamic = 'force-dynamic'

export const metadata = {
    title: 'Your ballot',
    // A ballot must never be indexed, cached by an intermediary, or previewed.
    robots: { index: false, follow: false },
}

export default async function BallotRoute() {
    const { election, error } = await readElection()

    // Fails closed. If the election state cannot be read, the safe answer is
    // that voting is not open — showing a ballot on the strength of a failed
    // check is the one outcome that cannot be undone.
    if (error) {
        return (
            <VotingNotOpen
                election={null}
                title="Voting is temporarily unavailable"
                description="We could not confirm the election status, so the ballot cannot be opened."
            >
                Please try again shortly. No ballot has been recorded for you.
            </VotingNotOpen>
        )
    }

    if (!isVotingOpen(election.status)) {
        return (
            <VotingNotOpen election={election}>
                {election.status === ELECTION_STATUS.ENDED
                    ? 'No further ballots can be cast. Results are published by the Electoral Commission.'
                    : 'Your registration is unaffected. You can return to vote once the poll opens.'}
            </VotingNotOpen>
        )
    }

    const voterId = await getVoterIdFromCookies(await cookies())
    if (!voterId) redirect('/login')

    const supabase = createAdminClient()
    const { data: voter, error: voterError } = await supabase
        .from('voters')
        .select('id, full_name, constituency_id, has_voted, constituencies(name)')
        .eq('id', voterId)
        .maybeSingle()

    // A valid token for a voter who is no longer on the register. Treated as no
    // session at all rather than as an error.
    if (voterError || !voter) redirect('/login')

    // Checked here as well as inside cast_vote() so that a voter who has
    // already voted is never shown a ballot to fill in a second time.
    if (voter.has_voted) {
        return (
            <PageShell width="sm" credit={false}>
                <PageHeading
                    title="You have already voted"
                    description="A ballot has already been recorded for this registration, so you cannot vote again."
                />
                <p className="mt-4 leading-relaxed text-muted-foreground">
                    We can confirm that you voted, but not who you voted for. No record anywhere
                    links a ballot back to the person who cast it.
                </p>
                <Button asChild variant="outline" size="lg" className="mt-8 w-full sm:w-auto">
                    <Link href="/">Back to home</Link>
                </Button>
            </PageShell>
        )
    }

    return (
        <Ballot
            voter={{
                fullName: voter.full_name,
                constituencyId: voter.constituency_id,
                constituencyName: voter.constituencies?.name ?? '',
            }}
        />
    )
}
