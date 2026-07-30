import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { TricolourRule } from '@/components/brand/BrandMark'
import { SiteHeader, SiteFooter } from '@/components/layout/PageShell'
import { ElectionStatusPanel } from '@/components/ElectionStatusBanner'
import { MIN_AGE, MAX_AGE } from '@/lib/validation'

export const metadata = {
    title: 'Official Voting Platform',
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
 */
export default function Home() {
    return (
        <div className="flex min-h-dvh flex-col bg-background">
            <TricolourRule />
            <SiteHeader />

            <main id="main" className="flex-1">
                <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
                    {/* Balanced wrapping put the line break inside the
                        institution's name ("Vote in the National / Youth
                        Parliament election"). Naming the election on its own
                        line and putting the action in the subheading removes
                        the possibility, and reads more like a service and less
                        like a slogan. */}
                    <h1 className="text-display font-semibold text-pretty">
                        National Youth Parliament election
                    </h1>
                    <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                        Register with your name, date of birth and phone number, then vote for a
                        candidate standing in your constituency.
                    </p>

                    <ElectionStatusPanel className="mt-8" />

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Button asChild size="xl">
                            <Link href="/register">Register to vote</Link>
                        </Button>
                        <Button asChild variant="outline" size="xl">
                            <Link href="/login">Sign in to vote</Link>
                        </Button>
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
                                Contact the electoral secretariat on{' '}
                                <a
                                    href="tel:+233302123456"
                                    className="font-medium text-primary underline underline-offset-4"
                                >
                                    +233 30 212 3456
                                </a>{' '}
                                or{' '}
                                <a
                                    href="mailto:elections@youthparliament.gov.gh"
                                    className="font-medium text-primary underline underline-offset-4"
                                >
                                    elections@youthparliament.gov.gh
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
