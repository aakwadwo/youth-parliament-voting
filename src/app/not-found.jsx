import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { readElection } from '@/lib/election-server'
import { ELECTION_STATUS } from '@/lib/election-status'

export const metadata = { title: 'Page not found' }

/**
 * Offers sign-in only while sign-in leads somewhere.
 *
 * This page used to offer it unconditionally, which made the 404 the last
 * remaining route into a flow the platform holds shut: outside the voting
 * window `/api/login` refuses before it even checks credentials, so a voter
 * following a stale link was handed a button that takes them to a refusal
 * screen. Registration is offered throughout, because the register genuinely
 * is open throughout.
 *
 * Reading the election costs nothing extra here. `readElection` is wrapped in
 * React's per-request cache and the root layout's `generateMetadata` has
 * already called it for this same request.
 */
export default async function NotFound() {
    const { election } = await readElection()

    // A failed read falls through to offering sign-in, matching the landing
    // page: the login route gates itself properly, so the worst case is the
    // behaviour this page had before.
    const showSignIn = !election || election.status === ELECTION_STATUS.OPEN

    return (
        <PageShell width="sm">
            <PageHeading title="Page not found" description="The link may be out of date." />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                    <Link href="/register">Register to vote</Link>
                </Button>
                {showSignIn ? (
                    <Button asChild variant="outline" size="lg">
                        <Link href="/login">Sign in to vote</Link>
                    </Button>
                ) : (
                    <Button asChild variant="outline" size="lg">
                        <Link href="/election">View election details</Link>
                    </Button>
                )}
            </div>
        </PageShell>
    )
}
