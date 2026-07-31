'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
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
 * Confirmation for consequential admin actions — opening or closing voting,
 * deactivating a candidate, publishing a result.
 *
 * Replaces the inline "Sure? Confirm / Cancel" links the admin tables used,
 * which were tiny tap targets, invisible to a screen reader as a dialog, and
 * dismissible only by finding the Cancel link. Radix gives focus trapping,
 * Escape-to-close and correct `aria-modal` semantics.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = 'Confirm',
    // What the confirm button says while the action is in flight. Defaults to
    // the confirm label itself, which is enough to give the button the shared
    // pending treatment — spinner, aria-busy and a width that already allows
    // for the spinner, so a dialog footer never reflows under the pointer as
    // an administrator closes voting.
    pendingLabel = confirmLabel,
    cancelLabel = 'Cancel',
    tone = 'default',
    warning,
    pending = false,
    onConfirm,
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description ? <DialogDescription>{description}</DialogDescription> : null}
                </DialogHeader>

                {warning ? <Alert variant="warning">{warning}</Alert> : null}

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={pending}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={tone === 'destructive' ? 'destructive' : 'default'}
                        onClick={onConfirm}
                        pending={pending}
                        pendingLabel={pendingLabel}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
