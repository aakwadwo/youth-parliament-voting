import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { TECHNOLOGY_PROVIDER, TECHNOLOGY_PROVIDER_URL, ELECTORAL_COMMISSION } from '@/lib/election'
import { cn } from '@/lib/utils'

/**
 * The supplier credit, as it appears on the results page.
 *
 * `SiteFooter` already carries a one-line attribution on every page, and the
 * rule that governs it applies here unchanged: the Commission owns this
 * service, and a contractor's mark that sits level with the institution's own
 * copy reads as co-branding on an election result. So this is deliberately not
 * a banner. It is the same credit given a little more room on the one page a
 * visitor arrives at voluntarily, after the result they came for and below the
 * notes on how it was counted — never above or beside a tally.
 *
 * It earns its place by doing something for the reader rather than for the
 * supplier: the feedback invitation is the actual call to action, and the
 * credit is the context for who is asking. That is why the two are one
 * component and not a credit with an advert bolted on.
 *
 * No claim about the count, the Commission's decisions or the result appears
 * here. The wording is confined to who built and maintains the software.
 */
export function PlatformCredit({ className }) {
    return (
        <aside
            aria-label={`About this platform`}
            className={cn('rounded-xl border border-border bg-surface p-5 sm:p-6', className)}
        >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
                <div className="min-w-0">
                    <a
                        href={TECHNOLOGY_PROVIDER_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="-my-1 inline-flex items-center gap-2.5 py-1 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                    >
                        <Image
                            src="/brand/kas-maven-consult.png"
                            alt={TECHNOLOGY_PROVIDER}
                            width={143}
                            height={66}
                            // Matched to the footer's treatment: keyed to
                            // transparency, height-constrained, lifted slightly
                            // in dark mode so the wordmark does not go muddy.
                            className="h-6 w-auto dark:brightness-125"
                        />
                        <span className="sr-only">
                            {TECHNOLOGY_PROVIDER} (opens in a new tab)
                        </span>
                    </a>

                    <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
                        This voting platform was designed, built and maintained by{' '}
                        <span className="font-medium text-foreground">{TECHNOLOGY_PROVIDER}</span>{' '}
                        for the {ELECTORAL_COMMISSION}. The count and its publication are the
                        Commission&rsquo;s.
                    </p>
                </div>

                <div className="shrink-0">
                    <Link
                        href="/feedback"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                    >
                        Tell us how the platform worked
                        <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                    <p className="mt-1.5 text-xs text-muted-foreground">Takes about a minute</p>
                </div>
            </div>
        </aside>
    )
}
