'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * A candidate's name on the results page, readable in full on a phone.
 *
 * The result card puts the name and the tally on one line. That is the right
 * shape — the number belongs beside the person it belongs to — but on a 320px
 * screen a name like "Hon. Elvis Kwabena Asiedu-Bosompem" has nowhere to go and
 * was being cut off mid-word. A published election result that will not tell
 * you who won is not a published result.
 *
 * ── Why overflow, and not a breakpoint ──────────────────────────────────────
 *
 * The obvious fix is "expandable below `sm`". But the condition is not the
 * screen, it is whether *this* name fits in *this* card — which depends on the
 * name's length, the width the tally takes, whether the trophy and ELECTED
 * label are present, and the user's font size. A breakpoint gets all four
 * wrong in both directions: it leaves short names on a phone looking
 * interactive when they have nothing to reveal, and it leaves a genuinely
 * overflowing name on a narrow desktop window with no way to read it.
 *
 * So the element measures itself and becomes interactive only when it is
 * actually clipped. On a desktop at the page's normal width no name overflows,
 * nothing becomes a button, and the rendering is exactly what it was before —
 * which is the "keep the current display on desktop" requirement, expressed as
 * a property rather than as a media query.
 *
 * ── Accessibility ───────────────────────────────────────────────────────────
 *
 * CSS truncation is visual only: the full name is in the DOM either way, so a
 * screen reader has always read the whole thing and still does. What changes
 * is that a *sighted* keyboard user now has a focus stop and a real
 * `aria-expanded` control for the names they cannot read — and, importantly,
 * only for those. Names that fit stay plain `<span>`s, so this adds no tab
 * stops to a page with 179 candidates on it beyond the ones that earn them.
 *
 * Purely presentational. It receives a name and renders it; it reads no tally
 * and decides nothing about the result.
 */
export function CandidateName({ name, isWinner }) {
    const ref = useRef(null)
    const [clipped, setClipped] = useState(false)
    const [expanded, setExpanded] = useState(false)

    // Only meaningful while collapsed: once the text is allowed to wrap,
    // scrollWidth and clientWidth agree and the answer would always be "fits".
    const measure = useCallback(() => {
        const el = ref.current
        if (!el || expanded) return
        // +1 absorbs sub-pixel rounding, which otherwise reports a name that
        // fits exactly as clipped on fractional-DPI displays.
        setClipped(el.scrollWidth > el.clientWidth + 1)
    }, [expanded])

    useEffect(() => {
        measure()

        const el = ref.current
        if (!el || typeof ResizeObserver === 'undefined') return

        // Rotating a phone, changing the text size, or the browser finishing a
        // font swap all change the answer without a re-render.
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
    }, [measure])

    const shared = cn(
        'min-w-0 text-left',
        isWinner ? 'font-semibold' : 'font-medium',
        expanded ? 'break-words whitespace-normal' : 'truncate'
    )

    // Not clipped: exactly the markup this used to render, with no interaction
    // attached to it.
    if (!clipped) {
        return (
            <span ref={ref} className={shared}>
                {name}
            </span>
        )
    }

    return (
        <button
            ref={ref}
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            // The native tooltip costs nothing and is the fastest way to read a
            // clipped name with a mouse, where tapping is not the instinct.
            title={expanded ? undefined : name}
            className={cn(
                shared,
                'cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                // A dotted underline is the long-standing convention for "there
                // is more here", and it is quiet enough to sit under 179 names
                // without turning the page into a list of links. Only shown
                // while collapsed: once the name is out, there is nothing left
                // to hint at.
                !expanded &&
                    'underline decoration-muted-foreground/50 decoration-dotted underline-offset-4'
            )}
        >
            {name}
        </button>
    )
}
