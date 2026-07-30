'use client'

import * as React from 'react'
import { AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

/**
 * One form field: label, optional helper text, the control, and an error.
 *
 * Every screen previously hand-wired its own `<Label>`/`<Input>` pairs, which
 * is how the registration form ended up with inconsistent heights, a
 * constituency picker with no associated label, and errors that were visually
 * red but not programmatically tied to the field they described.
 *
 * This component generates the id, wires `aria-describedby` to the helper and
 * error text, sets `aria-invalid`, and renders a real `<label for>` — so the
 * control is announced correctly and tapping the label focuses the field.
 *
 * `children` may be a single element (cloned with the wiring props) or a
 * render function receiving those props, for controls that need to spread
 * them onto a nested element.
 */
export function Field({
    label,
    hint,
    error,
    required = false,
    optional = false,
    id,
    className,
    children,
}) {
    const reactId = React.useId()
    const fieldId = id ?? reactId
    const hintId = hint ? `${fieldId}-hint` : undefined
    const errorId = error ? `${fieldId}-error` : undefined
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

    const controlProps = {
        id: fieldId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
    }

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={fieldId}>
                    {label}
                    {required ? (
                        <span className="text-destructive" aria-hidden="true">
                            *
                        </span>
                    ) : null}
                </Label>
                {optional ? (
                    <span className="text-xs text-muted-foreground">Optional</span>
                ) : null}
            </div>

            {hint ? (
                <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
                    {hint}
                </p>
            ) : null}

            {typeof children === 'function'
                ? children(controlProps)
                : React.isValidElement(children)
                  ? React.cloneElement(children, controlProps)
                  : children}

            {error ? (
                <p
                    id={errorId}
                    className="flex items-start gap-1.5 text-sm font-medium text-destructive"
                >
                    <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                </p>
            ) : null}
        </div>
    )
}
