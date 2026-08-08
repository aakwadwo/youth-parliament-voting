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
 * Runs before the dialog's focus scope moves focus.
 *
 * Layout effects all fire before any passive effect, and Radix's FocusScope
 * pulls focus into the dialog from a passive effect — so this is the last
 * moment at which `document.activeElement` is still the control the
 * administrator actually activated. An ordinary `useEffect` here would run
 * *after* FocusScope and capture a button inside the dialog instead.
 */
const useCaptureEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

/**
 * Confirmation for consequential admin actions — opening or closing voting,
 * deactivating a candidate, publishing a result.
 *
 * Replaces the inline "Sure? Confirm / Cancel" links the admin tables used,
 * which were tiny tap targets, invisible to a screen reader as a dialog, and
 * dismissible only by finding the Cancel link. Radix gives focus trapping and
 * Escape-to-close; `aria-modal` is added in DialogContent, which Radix does not
 * emit on its own.
 *
 * ── Where keyboard focus goes when this closes ───────────────────────────────
 *
 * Radix restores focus to whatever was focused when the dialog mounted, or to
 * `document.body` if that element has since left the DOM. The fallback is the
 * problem: these dialogs confirm actions that routinely remove their own
 * trigger — withdrawing a candidate can drop the row the button sat in — and a
 * keyboard or screen-reader user then lands at the top of the document with no
 * announcement and has to tab back through the whole portal to reach the table
 * they were working in.
 *
 * So the trigger is captured explicitly on open and restored on close when it
 * is still there. When it is not, focus is placed on the nearest surviving
 * ancestor of where it used to be, which keeps the user roughly where they were
 * rather than at the top of the page. Radix's own restore is left to run
 * whenever neither is available, so this can only ever improve on the default.
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
    // The control that opened the dialog, and a fallback anchor for the case
    // where confirming the action removes it.
    const triggerRef = React.useRef(null)
    const fallbackRef = React.useRef(null)
    const wasOpen = React.useRef(false)

    useCaptureEffect(() => {
        if (open && !wasOpen.current) {
            const active = document.activeElement
            const isRealTrigger = active instanceof HTMLElement && active !== document.body
            triggerRef.current = isRealTrigger ? active : null
            // Remembered separately: if the trigger is removed, its parent
            // usually is not, and focusing it keeps the user in place.
            fallbackRef.current = isRealTrigger ? active.parentElement : null
        }
        wasOpen.current = open
    }, [open])

    function handleCloseAutoFocus(event) {
        const trigger = triggerRef.current
        if (trigger?.isConnected) {
            // Prevent Radix's own restore so focus is not moved twice.
            event.preventDefault()
            trigger.focus()
            return
        }

        // The trigger is gone — the usual reason being that confirming removed
        // it. Land on the nearest surviving ancestor so the user stays where
        // they were instead of being sent to the top of the document.
        let anchor = fallbackRef.current
        while (anchor && !anchor.isConnected) anchor = anchor.parentElement
        if (anchor) {
            event.preventDefault()
            // Ancestors are not focusable by default; -1 accepts focus
            // programmatically without adding a tab stop.
            if (!anchor.hasAttribute('tabindex')) anchor.setAttribute('tabindex', '-1')
            anchor.focus()
        }
        // Neither available: leave Radix to do whatever it would have done.
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent onCloseAutoFocus={handleCloseAutoFocus}>
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
