import * as React from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Neutral loading placeholder. Suppressed for prefers-reduced-motion users. */
export function Skeleton({ className, ...props }) {
    return (
        <div
            aria-hidden="true"
            className={cn('rounded-lg bg-muted motion-safe:animate-pulse', className)}
            {...props}
        />
    )
}

/**
 * A labelled loading block. Screen readers get a single spoken message
 * instead of trying to narrate a wall of decorative skeleton boxes.
 */
export function LoadingBlock({ label = 'Loading', className, children }) {
    return (
        <div role="status" aria-busy="true" aria-label={label} className={className}>
            {children}
            <span className="sr-only">{label}…</span>
        </div>
    )
}

export function Spinner({ className, label }) {
    return (
        <>
            <Loader2
                aria-hidden="true"
                className={cn('size-4 shrink-0 animate-spin', className)}
            />
            {label ? <span className="sr-only">{label}</span> : null}
        </>
    )
}

/**
 * The empty state used by every list and table.
 *
 * "Nothing here" and "we could not load this" are different situations and
 * should never render identically, so callers pass an explicit action when
 * recovery is possible.
 *
 * Left-aligned and without an icon: a large centred glyph in a tinted circle
 * is decoration, and it pushes the sentence that actually tells an
 * administrator what to do next further down the panel.
 */
export function EmptyState({ title, description, action, className }) {
    return (
        <div className={cn('px-4 py-10 sm:px-6', className)}>
            <p className="font-semibold text-foreground">{title}</p>
            {description ? (
                <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {description}
                </p>
            ) : null}
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    )
}

/**
 * Horizontal share-of-vote bar.
 *
 * Rendered as a real ARIA meter with the value in its label, so the tally is
 * available to a screen reader without relying on the bar's width.
 */
export function VoteBar({ value, max = 100, label, tone = 'brand', className }) {
    const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
    return (
        <div
            role="meter"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
            className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
        >
            <div
                className={cn(
                    'h-full rounded-full',
                    tone === 'brand' ? 'bg-primary' : 'bg-muted-foreground'
                )}
                style={{ width: `${pct}%` }}
            />
        </div>
    )
}
