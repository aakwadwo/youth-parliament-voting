import * as React from 'react'
import { cva } from 'class-variance-authority'
import { CheckCircle2, Info, AlertTriangle, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

const alertVariants = cva(
    'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm',
    {
        variants: {
            variant: {
                info: 'border-info-border bg-info-surface text-info-foreground',
                success: 'border-success-border bg-success-surface text-success-foreground',
                warning: 'border-warning-border bg-warning-surface text-warning-foreground',
                danger: 'border-danger-border bg-danger-surface text-danger-foreground',
            },
        },
        defaultVariants: { variant: 'info' },
    }
)

const ICONS = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: XCircle,
}

/**
 * Status messaging used across the whole app — form errors, save confirmations,
 * privacy notices and voting-window warnings.
 *
 * Colour is never the only signal: each variant also carries a distinct icon
 * and, where it matters, a title, so the meaning survives for anyone who
 * cannot distinguish the tints (WCAG 1.4.1).
 *
 * Errors announce themselves assertively; everything else is polite.
 */
export function Alert({ variant = 'info', title, icon = true, className, children, ...props }) {
    const Icon = ICONS[variant]
    const isError = variant === 'danger'

    return (
        <div
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={cn(alertVariants({ variant }), className)}
            {...props}
        >
            {icon ? <Icon aria-hidden="true" className="mt-0.5 size-[1.125rem] shrink-0" /> : null}
            <div className="min-w-0 flex-1 space-y-1">
                {title ? <p className="font-semibold">{title}</p> : null}
                {children ? <div className="leading-relaxed [&_a]:underline">{children}</div> : null}
            </div>
        </div>
    )
}

/**
 * A permanently mounted polite live region.
 *
 * Conditionally rendering a live region is a common accessibility bug: some
 * screen readers never announce a region that appears at the same moment its
 * text does. Keeping the node mounted and only swapping its contents makes
 * announcements reliable.
 */
export function LiveRegion({ message, assertive = false }) {
    return (
        <div
            role="status"
            aria-live={assertive ? 'assertive' : 'polite'}
            aria-atomic="true"
            className="sr-only"
        >
            {message}
        </div>
    )
}
