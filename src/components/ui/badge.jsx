import * as React from 'react'
import { cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
    {
        variants: {
            variant: {
                neutral: 'border-border-strong bg-muted text-muted-foreground',
                success: 'border-success-border bg-success-surface text-success-foreground',
                warning: 'border-warning-border bg-warning-surface text-warning-foreground',
                danger: 'border-danger-border bg-danger-surface text-danger-foreground',
                brand: 'border-primary/25 bg-primary/10 text-primary',
            },
        },
        defaultVariants: { variant: 'neutral' },
    }
)

export function Badge({ variant = 'neutral', className, children, ...props }) {
    return (
        <span className={cn(badgeVariants({ variant }), className)} {...props}>
            {children}
        </span>
    )
}

const DOT_TONE = {
    neutral: 'bg-muted-foreground',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    brand: 'bg-primary',
}

/**
 * A badge with a leading status dot. The dot is decorative; the label always
 * carries the meaning in text, so status is never conveyed by colour alone.
 *
 * The dot does not pulse. A poll being open is a steady state, not an alert,
 * and a permanently animating element in the corner of every screen is the
 * kind of motion that reads as decoration and quietly costs attention.
 */
export function StatusPill({ variant = 'neutral', className, children, ...props }) {
    return (
        <Badge variant={variant} className={className} {...props}>
            <span
                aria-hidden="true"
                className={cn('size-1.5 shrink-0 rounded-full', DOT_TONE[variant])}
            />
            {children}
        </Badge>
    )
}
