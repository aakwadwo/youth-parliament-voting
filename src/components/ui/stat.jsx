import * as React from 'react'

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/feedback'

/**
 * A single dashboard metric.
 *
 * No icon. A glyph next to a vote count carries no information the label does
 * not already give, and a row of tinted icon tiles is decoration competing
 * with the numbers, which are the only thing anyone reads this panel for.
 *
 * The label/value pair is a real `<dl>` so the relationship is structural
 * rather than visual, and figures use tabular numerals so a row of counters
 * does not jitter as it updates.
 */
export function Stat({ label, value, hint, className }) {
    return (
        <div className={cn('rounded-xl border border-border bg-card p-4 sm:p-5', className)}>
            <dl>
                <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
                <dd className="numeric mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {value}
                </dd>
            </dl>
            {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    )
}

export function StatSkeleton() {
    return (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
        </div>
    )
}

/**
 * Responsive metric row: one column on small phones, two on large phones,
 * then up to `cols` from `lg`.
 */
export function StatGrid({ cols = 4, className, children }) {
    const lg = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[cols]
    return (
        <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4', lg, className)}>
            {children}
        </div>
    )
}
