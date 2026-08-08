import { NavButton } from '@/components/NavButton'
import { TricolourRule } from '@/components/brand/BrandMark'
import { SiteHeader, SiteFooter } from '@/components/layout/PageShell'
import { ElectionStatusPanel } from '@/components/ElectionStatusBanner'
import { MIN_AGE, MAX_AGE } from '@/lib/validation'
import { ELECTION_NAME } from '@/lib/election'
import { readElection } from '@/lib/election-server'
import { ELECTION_STATUS } from '@/lib/election-status'

// Re-read at most every 15 seconds. The front page takes the traffic spike when
// a poll opens, so it must stay cacheable, but a cached copy that outlives the
// opening by minutes would tell voters the poll was still shut while it was
// running. The status panel polls on top of this for anyone already on the page.
export const revalidate = 15

// Deliberately no `title` override. A title.template only applies to *child*
// segments, never to the page sitting in the same segment as the layout that
// declares it — so the override this page used to carry ("Official Voting
// Platform") was emitted verbatim, and the front page was the one page whose
// tab and search result never named the election.
//
// Async, because the election's name belongs to the administrators, not to a
// constant in this file. ELECTION_NAME survives only as the fallback for a
// deployment whose settings row has not been configured yet.
export async function generateMetadata() {
    const { election } = await readElection()
    const name = election?.electionName ?? ELECTION_NAME
    return { description: `Register and vote in the ${name}.` }
}

/**
 * The landing page is the front door of a transactional government service,
 * not a product marketing site. Someone arriving here wants to know two
 * things: is the poll open, and where do I go. Everything else is secondary
 * and belongs below the fold in plain prose.
 *
 * The previous version had a badge above the headline, a three-card "how it
 * works" grid, a two-card "how your vote is protected" grid, and a closing
 * section repeating the same call to action. That is the shape of a SaaS
 * homepage. None of it told a voter anything the two buttons and four
 * sentences below do not.
 *
 * Everything the page says about the election — its name, its window, its
 * state — now comes from the admin settings row, read here on the server and
 * handed to the status panel so the first paint is already correct. The one
 * sentence that used to hardcode the platform's status is gone: an election
 * whose state lives in a string literal is an election that lies the moment an
 * administrator changes anything.
 */
export default async function Home() {
    const { election } = await readElection()
    const electionName = election?.electionName ?? ELECTION_NAME

    // Sign-in only leads anywhere while the poll is open, so it is not offered
    // as a primary action otherwise. Registration stays available throughout:
    // the register is open before the poll, and someone arriving after it
    // closes is told so plainly rather than finding a button that fails.
    //
    // Resolved to one destination rather than branching over two buttons in the
    // markup, so the second slot cannot end up with a different treatment from
    // the first depending on the state of the election.
    const secondaryAction =
        election?.status === ELECTION_STATUS.OPEN || !election
            ? { href: '/login', label: 'Sign in to vote' }
            : { href: '/election', label: 'View election details' }

    return (
        <div className="flex min-h-dvh flex-col bg-background">
            <TricolourRule />
            <SiteHeader />

            <main id="main" className="flex-1">
                <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
                    {/* Balanced wrapping put the line break inside the
                        institution's name ("Vote in the National / Youth
                        Parliament election"). Naming the election on its own
                        line and putting the action in the subheading removes
                        the possibility, and reads more like a service and less
                        like a slogan. */}
                    <h1 className="text-display font-semibold text-pretty">{electionName}</h1>
                    <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                        {election?.description?.trim()
                            ? election.description
                            : 'Register with your name, date of birth and phone number, then vote for a candidate standing in your constituency.'}
                    </p>

                    <ElectionStatusPanel initial={election} className="mt-8" />

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <NavButton href="/register" size="xl">
                            Register to vote
                        </NavButton>
                        <NavButton href={secondaryAction.href} variant="outline" size="xl">
                            {secondaryAction.label}
                        </NavButton>
                    </div>

                    <div className="mt-10 max-w-2xl space-y-8 border-t border-border pt-8 sm:mt-12 sm:pt-10">
                        <section>
                            <h2 className="text-heading font-semibold">Who can vote</h2>
                            <p className="mt-2 leading-relaxed text-muted-foreground">
                                Ghanaian citizens aged {MIN_AGE} to {MAX_AGE}. You register once,
                                with one phone number, and vote in the constituency you register
                                in.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-heading font-semibold">Your ballot is secret</h2>
                            <p className="mt-2 leading-relaxed text-muted-foreground">
                                Your details confirm that you are eligible and stop anyone voting
                                twice. They are never stored against the candidate you choose, so
                                nobody, including election staff, can look up how you voted.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-heading font-semibold">If you need help</h2>
                            <p className="mt-2 leading-relaxed text-muted-foreground">
                                Contact the Electoral Commission on{' '}
                                <a
                                    href="tel:+233542298375"
                                    className="font-medium text-primary underline underline-offset-4"
                                >
                                    +233 54 229 8375
                                </a>{' '}
                                or{' '}
                                {/* Clears a 320px line by ~2px with the system
                                    fallback font loaded; allow it to break
                                    rather than leave the front door of the
                                    service one metric change from overflowing. */}
                                <a
                                    href="mailto:aakwadwo1@gmail.com"
                                    className="font-medium text-primary underline underline-offset-4 [overflow-wrap:anywhere]"
                                >
                                    aakwadwo1@gmail.com
                                </a>
                                .
                            </p>
                        </section>
                    </div>
                </div>
            </main>

            <SiteFooter />
        </div>
    )
}
