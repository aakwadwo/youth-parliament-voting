import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Accessibility guarantees of the shared admin confirmation dialog.
 *
 * Source-level, because these are properties of how the component is wired to
 * Radix rather than of a value it returns, and the suite has no DOM runner.
 * Each assertion corresponds to a specific way the fix silently regresses —
 * silently being the point: every one of these failures is invisible to a
 * sighted mouse user and only shows up for someone on a keyboard or a screen
 * reader, confirming an irreversible election action.
 *
 * Verified in a real browser when written: aria-modal present, focus trapped
 * and looping on Tab, Escape closes, body scroll locked while open and released
 * after, focus returned to the triggering button, and — where confirming the
 * action removed that button — to its nearest surviving ancestor rather than to
 * the document body.
 */

const ROOT = path.join(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const DIALOG = 'src/components/ui/dialog.jsx'
const CONFIRM = 'src/components/ui/confirm-dialog.jsx'

test('the dialog declares itself modal to assistive technology', () => {
    // @radix-ui/react-dialog gives Content role="dialog" and hides its siblings
    // with aria-hidden, but emits no aria-modal of its own — verified against
    // the installed 1.1.15 dist. If this attribute is dropped, nothing visibly
    // changes and the dialog stops announcing itself as modal.
    const source = read(DIALOG)
    assert.match(
        source,
        /aria-modal="true"/,
        'DialogContent no longer declares aria-modal="true"'
    )

    // It must sit on the content element, ahead of the prop spread, so a caller
    // can still override it but never loses it by accident.
    const content = source.slice(source.indexOf('DialogPrimitive.Content'))
    const ariaAt = content.indexOf('aria-modal')
    const spreadAt = content.indexOf('{...props}')
    assert.ok(ariaAt > -1 && spreadAt > -1, 'DialogContent shape changed')
    assert.ok(ariaAt < spreadAt, 'aria-modal must precede the prop spread so callers can override it')
})

test('the confirmation dialog captures the control that opened it', () => {
    const source = read(CONFIRM)
    assert.match(source, /triggerRef/, 'the trigger is no longer captured')
    assert.match(
        source,
        /document\.activeElement/,
        'nothing reads the focused element, so there is no trigger to return to'
    )
})

test('the capture runs before the focus scope steals focus', () => {
    // The subtle one. Radix pulls focus into the dialog from a passive effect,
    // and child passive effects run before the parent's — so capturing in a
    // plain useEffect here records a button inside the dialog instead of the
    // trigger, and focus is then "restored" to a node that no longer exists.
    // Layout effects all run before any passive effect, which is why the
    // capture must be one.
    const source = read(CONFIRM)
    assert.match(
        source,
        /useLayoutEffect/,
        'the trigger capture must use a layout effect, or it runs after Radix has moved focus'
    )
    assert.match(
        source,
        /typeof window === 'undefined'/,
        'the layout effect must degrade to useEffect on the server'
    )
})

test('focus is returned on close, and never to a detached node', () => {
    const source = read(CONFIRM)
    assert.match(source, /onCloseAutoFocus/, 'the dialog no longer handles focus on close')
    assert.match(
        source,
        /isConnected/,
        'focus must only be restored to a trigger still in the document'
    )
    // Radix's own fallback is document.body. Where the trigger has gone, this
    // component walks up to a surviving ancestor instead, so a keyboard user is
    // left where they were working rather than at the top of the page.
    assert.match(
        source,
        /parentElement/,
        'the detached-trigger fallback that keeps focus in place has been removed'
    )
})

test('Escape, the focus trap and the scroll lock are still Radix defaults', () => {
    // These three come free from Dialog.Root/Content and were verified working.
    // The risk is someone disabling them while adding focus handling, so the
    // opt-outs are asserted absent rather than the behaviour asserted present.
    const source = read(CONFIRM) + read(DIALOG)
    for (const optOut of [
        'onEscapeKeyDown={',
        'trapFocus={false}',
        'modal={false}',
        'onInteractOutside={',
    ]) {
        assert.equal(
            source.includes(optOut),
            false,
            `${optOut} disables a dialog behaviour the audit verified as working`
        )
    }
})

test('every confirmation dialog on the platform goes through this component', () => {
    // The fix is only worth anything if no admin surface hand-rolls its own.
    const users = ['src/components/admin/ResultsPublication.jsx', 'src/components/admin/Settings.jsx', 'src/components/admin/Candidates.jsx']
    for (const file of users) {
        assert.match(read(file), /ConfirmDialog/, `${file} no longer uses the shared dialog`)
    }
})
