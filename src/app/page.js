import { NavButton } from '@/components/NavButton'
import { TricolourRule } from '@/components/brand/BrandMark'
import { SiteHeader, SiteFooter } from '@/components/layout/PageShell'
import { ElectionStatusPanel } from '@/components/ElectionStatusBanner'
import { MIN_AGE, MAX_AGE } from '@/lib/validation'
import { ELECTION_NAME, CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL } from '@/lib/election'
import { readElection } from '@/lib/election-server'
import { electionActions, electionResultsNotice, areResultsPublic } from '@/lib/election-status'

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

    // The whole call to action, resolved from the election's state in one
    // place. The page renders whatever this list holds and makes no decisions
    // of its own, so the front door cannot end up offering an action the
    // election does not currently support.
    //
    // Once voting has ended there is exactly one thing left to do here, and it
    // is not registering or signing in — both of those now lead to a refusal
    // screen. The single slot is given to the result rather than adding a third
    // button beside two dead ends.
    //
    // Ending the poll is not what puts "View election results" here: the
    // Commission releasing the count is. Until it does, this offers the
    // election's own details and `notice` says why there is no result to read
    // yet — a button leading to a page that explains the wait is not a call to
    // action, it is a detour.
    const actions = electionActions(election)
    const notice = electionResultsNotice(election)

    // Once the count is out, the front door offers a second thing to do.
    //
    // Added here rather than inside `electionActions` on purpose: that function
    // answers "what can a voter do about this election", and its answer is read
    // by the results page and the status panel as well as by this one. Feedback
    // on the software is not an election action, and pushing it in there would
    // put a "Give feedback" button on surfaces that are asking a different
    // question. The gate is the same one the results page itself uses, so the
    // button cannot appear while /results is still showing "under review".
    const resultsPublished = areResultsPublic(election)

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

                    {notice ? (
                        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
                            {notice}
                        </p>
                    ) : null}

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        {actions.map((action, i) => (
                            <NavButton
                                key={action.href}
                                href={action.href}
                                // The first action is the primary one whatever
                                // it happens to be, so a state with one action
                                // still gets a filled button rather than an
                                // outlined one floating on its own.
                                variant={i === 0 ? 'default' : 'outline'}
                                size="xl"
                            >
                                {action.label}
                            </NavButton>
                        ))}

                        {/* Secondary, and last. Viewing the result is what the
                            page is for once the count is out; feedback is
                            worth offering but must not compete with it, so it
                            keeps the outlined treatment even though it is the
                            newest thing on the page. */}
                        {resultsPublished ? (
                            <NavButton href="/feedback" variant="outline" size="xl">
                                Give feedback
                            </NavButton>
                        ) : null}
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
                                    href={`tel:${CONTACT_PHONE_TEL}`}
                                    className="numeric font-medium text-primary underline underline-offset-4"
                                >
                                    {CONTACT_PHONE_DISPLAY}
                                </a>{' '}
                                or{' '}
                                {/* Clears a 320px line by ~2px with the system
                                    fallback font loaded; allow it to break
                                    rather than leave the front door of the
                                    service one metric change from overflowing. */}
                                <a
                                    href={`mailto:${CONTACT_EMAIL}`}
                                    className="font-medium text-primary underline underline-offset-4 [overflow-wrap:anywhere]"
                                >
                                    {CONTACT_EMAIL}
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
