'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Button, PendingSwap } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A left click with no modifier held. Everything else — middle click, ⌘/Ctrl
 * click, Shift click — is the browser's to handle, and intercepting it would
 * turn "open the registration form in a new tab" into a navigation in this one.
 * A keyboard Enter on a focused link reports button 0 with no modifiers, so it
 * takes the same path as a plain click and gets the same spinner.
 */
function isPlainLeftClick(event) {
    return (
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
    )
}

/**
 * A button that navigates, and shows that it is navigating.
 *
 * The call-to-action buttons on the landing and election-details pages used to
 * be `<Button asChild><Link>` — which is instant on a warm connection and dead
 * silent on a cold one. On a phone on mobile data there is a real gap between
 * the tap and the next screen painting, and a button that does not acknowledge
 * the tap reads as broken, so it gets tapped again.
 *
 * The navigation is driven by `router.push` inside `useTransition` rather than
 * by the link's own default action, because the transition is pending for
 * exactly as long as the navigation is: React clears it when the destination
 * has been fetched and rendered, and also if the navigation is abandoned. A
 * flag set by hand in the click handler has no equivalent of that second case
 * and would leave a button spinning forever after an interrupted navigation.
 *
 * The `<Link>` is kept — rather than a plain `<button onClick>` — so the pages'
 * primary actions stay real anchors with real hrefs: they are prefetched, they
 * can be opened in a new tab or copied, and they are still links to a crawler
 * reading the front page of the service.
 *
 * `pendingLabel` defaults to the label itself: the spinner appears beside the
 * text the voter just tapped rather than replacing it with a different word.
 * Both states occupy the same grid cell, so the button is always as wide as the
 * wider of them and nothing on the page moves when the spinner appears.
 */
export function NavButton({ href, children, pendingLabel = children, className, ...props }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    return (
        <Button
            asChild
            // Anchors have no `disabled`, so the pending button is taken out of
            // the hit-testing tree instead; the guard below covers the keyboard,
            // which pointer-events cannot.
            pending={pending}
            aria-disabled={pending || undefined}
            className={cn(pending && 'pointer-events-none', className)}
            {...props}
        >
            <Link
                href={href}
                onClick={(event) => {
                    if (!isPlainLeftClick(event)) return
                    event.preventDefault()
                    if (pending) return
                    startTransition(() => {
                        router.push(href)
                    })
                }}
            >
                <PendingSwap pending={pending} pendingLabel={pendingLabel}>
                    {children}
                </PendingSwap>
            </Link>
        </Button>
    )
}
