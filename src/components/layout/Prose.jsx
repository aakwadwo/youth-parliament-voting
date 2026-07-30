import { cn } from '@/lib/utils'

/**
 * Long-form text for the policy pages.
 *
 * A single shared measure and vertical rhythm, so Privacy, Terms,
 * Accessibility and Contact cannot drift apart typographically. Body copy is
 * capped near 70 characters per line, which is where sustained reading stops
 * being comfortable.
 */
export function Prose({ className, children }) {
    return (
        <div
            className={cn(
                'max-w-[62ch] leading-relaxed',
                '[&_h2]:mt-10 [&_h2]:text-heading [&_h2]:font-semibold',
                '[&_h2:first-child]:mt-0',
                '[&_h3]:mt-6 [&_h3]:font-semibold',
                '[&_p]:mt-3 [&_p]:text-muted-foreground',
                '[&_ul]:mt-3 [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:text-muted-foreground',
                '[&_li]:list-disc [&_li]:marker:text-border-strong',
                '[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4',
                // An address like accessibility@youthparliament.gov.gh is a
                // single unbreakable word ~36 characters long. Inside a 320px
                // viewport there is nowhere for it to wrap, so it pushed the
                // page 10px wider than the screen and every one of these pages
                // scrolled sideways. `anywhere` rather than `break-word` so the
                // break is taken while measuring the line, not only after the
                // word has already been found not to fit on a line of its own.
                '[&_a]:[overflow-wrap:anywhere]',
                // A term sits tight to its own definition and further from the
                // previous pair. Even spacing between every child of the list
                // makes the grouping ambiguous: each term looks equally
                // attached to the definition above it and the one below.
                '[&_dl]:mt-4',
                '[&_dt]:mt-5 [&_dt]:font-medium [&_dt]:text-foreground [&_dt:first-child]:mt-0',
                '[&_dd]:mt-1 [&_dd]:text-muted-foreground',
                className
            )}
        >
            {children}
        </div>
    )
}

/**
 * "Last updated" line. A policy page without a date is not a policy anyone can
 * rely on, and a reviewer notices its absence immediately.
 */
export function LastUpdated({ date }) {
    return (
        <p className="mt-3 text-sm text-muted-foreground">
            Last updated{' '}
            <time dateTime={date}>
                {new Intl.DateTimeFormat('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'Africa/Accra',
                }).format(new Date(date))}
            </time>
        </p>
    )
}
