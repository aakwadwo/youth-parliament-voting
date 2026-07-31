import Link from 'next/link'
import Image from 'next/image'

import { cn } from '@/lib/utils'
import { BrandMark, TricolourRule } from '@/components/brand/BrandMark'
import {
    ELECTORAL_COMMISSION,
    ORGANISATION_NAME,
    ORGANISATION_SHORT_NAME,
    TECHNOLOGY_PROVIDER,
    TECHNOLOGY_PROVIDER_URL,
} from '@/lib/election'

const FOOTER_LINKS = [
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms of use' },
    { href: '/accessibility', label: 'Accessibility' },
    { href: '/contact', label: 'Contact' },
]

export function SiteHeader({ className }) {
    return (
        <header className={cn('border-b border-border bg-background', className)}>
            {/* 20px rather than 16px at the base width. On a 320px phone the
                old value left content 16px from the glass on both sides, which
                is close enough to the edge to read as "the page ran out of
                room" rather than as a margin — and it put text directly under
                the curved corners of most modern handsets. */}
            <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-5 sm:px-6">
                <Link
                    href="/"
                    className="-my-2 flex items-center gap-2.5 rounded-md py-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                    <BrandMark height={32} priority />
                    <span className="text-[0.9375rem] font-semibold tracking-tight">
                        {ORGANISATION_SHORT_NAME}
                    </span>
                    <span className="sr-only">, return to the home page</span>
                </Link>
            </div>
        </header>
    )
}

/**
 * The frame every voter-facing page sits in.
 *
 * Previously each screen re-implemented its own centred main element and its
 * own tricolour, which is how spacing and the logo treatment drifted between
 * the landing, registration, login and ballot pages.
 */
export function PageShell({ children, width = 'md', className, credit = true }) {
    const maxWidth = {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-3xl',
        xl: 'max-w-5xl',
    }[width]

    return (
        <div className="flex min-h-dvh flex-col bg-background">
            <TricolourRule />
            <SiteHeader />

            <main
                id="main"
                className={cn(
                    'mx-auto w-full flex-1 px-5 py-8 sm:px-6 sm:py-12',
                    maxWidth,
                    className
                )}
            >
                {children}
            </main>

            <SiteFooter credit={credit} />
        </div>
    )
}

/**
 * `credit` carries the supplier attribution, and is switched off for the whole
 * voter transaction — registration, sign-in, the ballot and both confirmation
 * screens. A voter part-way through casting a ballot should see one institution
 * on the page and one only; a contractor's mark sitting under the Submit button
 * invites the question of who is actually running the election. It stays on the
 * landing page and the policy pages, where an institutional credit belongs.
 */
export function SiteFooter({ className, credit = true }) {
    return (
        <footer className={cn('mt-auto border-t border-border bg-surface', className)}>
            <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-6">
                {/* Standalone navigation links, so they get a real tap target.
                    The vertical padding is cancelled by a negative margin, so
                    the hit area grows to 40px without the row growing with it.
                    (Inline links inside prose are exempt from the target-size
                    rule; these are not inline.) */}
                <nav aria-label="Footer" className="-my-2 flex flex-wrap gap-x-6">
                    {FOOTER_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className="py-2.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                    {ORGANISATION_NAME}
                    <br />
                    &copy; {new Date().getFullYear()}. Operated by the {ELECTORAL_COMMISSION}.
                </p>

                {/* Technology attribution.
                    Deliberately the quietest thing on the page and separated by
                    a rule: the Commission owns this service, and a supplier's
                    mark sitting level with the institution's own copy would
                    read as co-branding on a ballot platform. Small caption,
                    muted label, mark at text height — the pattern government
                    services use to credit an implementation partner. */}
                {credit ? (
                    <div className="mt-6 border-t border-border pt-5">
                        <a
                            href={TECHNOLOGY_PROVIDER_URL}
                            target="_blank"
                            // noreferrer as well as noopener: the Commission has
                            // no reason to leak which page of an electoral
                            // service a visitor came from to a third party.
                            rel="noopener noreferrer"
                            className="-my-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-xs text-muted-foreground transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                        >
                            <span>Platform developed by</span>
                            <Image
                                src="/brand/kas-maven-consult.png"
                                alt={TECHNOLOGY_PROVIDER}
                                width={143}
                                height={66}
                                // Height-constrained to the cap height of the
                                // text beside it. The source was a 1254px square
                                // that was ~65% white margin; it is cropped to
                                // the wordmark and keyed to transparency, so
                                // there is no white plate on the surface colour.
                                className="h-[1.15rem] w-auto dark:brightness-125"
                            />
                            <span className="sr-only">(opens in a new tab)</span>
                        </a>
                    </div>
                ) : null}
            </div>
        </footer>
    )
}

/**
 * Page title block, so the title and description rhythm is identical on every
 * screen. No uppercase eyebrow label above the heading: it is a decorative
 * marketing device, and on a form it puts a second competing line of text
 * where the heading should be doing the work alone.
 */
export function PageHeading({ title, description, className, children }) {
    return (
        <div className={cn('space-y-2', className)}>
            <h1 className="text-title font-semibold">{title}</h1>
            {description ? (
                <p className="leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
            {children}
        </div>
    )
}
