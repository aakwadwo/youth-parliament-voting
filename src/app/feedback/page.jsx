import Image from 'next/image'

import { NavButton } from '@/components/NavButton'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { FeedbackForm } from './FeedbackForm'
import {
    TECHNOLOGY_PROVIDER,
    TECHNOLOGY_PROVIDER_URL,
    ELECTORAL_COMMISSION,
    ELECTION_NAME,
} from '@/lib/election'
import { readElection } from '@/lib/election-server'

/**
 * Feedback on the platform.
 *
 * Open to anyone, with no session: the people best placed to say that
 * registration was confusing are the ones who gave up part-way through it, and
 * a form behind a sign-in collects answers only from the people the platform
 * already worked for.
 *
 * Reads the election's name so the page matches the rest of the site, and
 * nothing else. It touches no tallies, no register and no ballot.
 */

export async function generateMetadata() {
    const { election } = await readElection()
    const name = election?.electionName ?? ELECTION_NAME
    return {
        title: 'Give feedback',
        description: `Tell us how the ${name} voting platform worked for you.`,
    }
}

export default async function FeedbackPage() {
    const { election } = await readElection()
    const electionName = election?.electionName ?? ELECTION_NAME

    return (
        <PageShell width="lg">
            <PageHeading
                title="Give feedback"
                description={`Tell us how the ${electionName} platform worked for you. Your answers go to the ${ELECTORAL_COMMISSION} and to the team that builds the platform.`}
            />

            {/* The supplier's mark identifies who is asking and who will act on
                the answers, which is the one place a contractor's logo belongs
                on a service like this. Kept to the same height and treatment as
                the footer credit so it reads as attribution, not as a banner. */}
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5">
                <a
                    href={TECHNOLOGY_PROVIDER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-my-1 shrink-0 py-1 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                    <Image
                        src="/brand/kas-maven-consult.png"
                        alt={TECHNOLOGY_PROVIDER}
                        width={143}
                        height={66}
                        className="h-6 w-auto dark:brightness-125"
                    />
                    <span className="sr-only">{TECHNOLOGY_PROVIDER} (opens in a new tab)</span>
                </a>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Read and acted on by{' '}
                    <span className="font-medium text-foreground">{TECHNOLOGY_PROVIDER}</span>, who
                    build and maintain this platform.
                </p>
            </div>

            <p className="mt-6 max-w-prose leading-relaxed text-muted-foreground">
                These questions are about the website itself — registering, signing in, voting and
                reading the results. They are not about the candidates, the result or the Youth
                Parliament. Everything is optional; answer only what you want to.
            </p>

            <div className="mt-8">
                <FeedbackForm />
            </div>

            <div className="mt-10 flex flex-col gap-3 border-t border-border pt-8 sm:flex-row">
                <NavButton href="/results" variant="outline" size="lg" className="sm:w-auto">
                    Back to results
                </NavButton>
                <NavButton href="/" variant="outline" size="lg" className="sm:w-auto">
                    Return home
                </NavButton>
            </div>
        </PageShell>
    )
}
