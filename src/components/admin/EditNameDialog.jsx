'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

/**
 * Correcting one name in place.
 *
 * A sibling of ConfirmDialog rather than a variant of it: that one asks a
 * yes/no question about an action already decided, this one collects a value,
 * so it needs a field, per-field validation and a submit. Sharing the same
 * Radix dialog underneath keeps focus trapping, Escape-to-close and the footer
 * button treatment identical across the admin portal.
 *
 * Used for both constituencies and candidates, whose validation rules differ —
 * a person's name and a constituency's name are not the same kind of string —
 * so the rule arrives as a prop rather than being decided here.
 *
 * State is reset by comparing `recordId` during render rather than in an
 * effect. Opening the dialog on a second row must not show the first row's
 * text, and the render-time comparison is React's documented way to derive
 * state from a changed prop: it re-renders before anything is painted, where an
 * effect would flash the previous value first.
 */
export function EditNameDialog({
    open,
    onOpenChange,
    recordId,
    title,
    description,
    label,
    hint,
    fieldId = 'edit_name',
    initialValue = '',
    placeholder,
    validate,
    saving = false,
    error = '',
    confirmLabel = 'Save changes',
    onSave,
}) {
    const [value, setValue] = useState(initialValue)
    const [fieldError, setFieldError] = useState(null)
    const [shownFor, setShownFor] = useState(recordId)

    if (recordId !== shownFor) {
        setShownFor(recordId)
        setValue(initialValue)
        setFieldError(null)
    }

    function handleSubmit(event) {
        event.preventDefault()

        const message = validate?.(value) ?? null
        setFieldError(message)
        if (message) return

        onSave(value)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={handleSubmit} noValidate>
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        {description ? <DialogDescription>{description}</DialogDescription> : null}
                    </DialogHeader>

                    <div className="py-4">
                        <Field id={fieldId} label={label} hint={hint} required error={fieldError}>
                            <Input
                                autoComplete="off"
                                placeholder={placeholder}
                                value={value}
                                onChange={(event) => {
                                    setValue(event.target.value)
                                    if (fieldError) setFieldError(null)
                                }}
                            />
                        </Field>

                        {/* The server's own sentence, kept separate from the
                            field rule: a name that is well formed but clashes
                            with another record fails here, not above. */}
                        {error ? (
                            <Alert variant="danger" title="Could not save" className="mt-4">
                                {error}
                            </Alert>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" pending={saving} pendingLabel="Saving…">
                            {confirmLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
