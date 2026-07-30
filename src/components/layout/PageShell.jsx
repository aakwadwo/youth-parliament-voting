import Link from 'next/link'

import { cn } from '@/lib/utils'
import { BrandMark, TricolourRule } from '@/components/brand/BrandMark'
import { ORGANISATION_NAME, ORGANISATION_SHORT_NAME } from '@/lib/election'

const FOOTER_LINKS = [
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms of use' },
    { href: '/accessibility', label: 'Accessibility' },
    { href: '/contact', label: 'Contact' },
]

export function SiteHeader({ className }) {
    return (
        <header className={cn('border-b border-border bg-background', className)}>
            <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-4 sm:px-6">
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
export function PageShell({ children, width = 'md', className }) {
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
                    'mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-12',
                    maxWidth,
                    className
                )}
            >
                {children}
            </main>

            <SiteFooter />
        </div>
    )
}

export function SiteFooter({ className }) {
    return (
        <footer className={cn('mt-auto border-t border-border bg-surface', className)}>
            <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
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
                    &copy; {new Date().getFullYear()}. Built and operated by the electoral
                    secretariat.
                </p>
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
