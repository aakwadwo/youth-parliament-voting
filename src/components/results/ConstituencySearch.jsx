'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, Search, X } from 'lucide-react'

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { filterConstituencies } from '@/lib/constituency-search'
import { cn } from '@/lib/utils'

/**
 * Find a constituency on the results page without scrolling 16 regions.
 *
 * The published result is one long document — 144 seats grouped under their
 * regions — and that grouping is the right way to *read* a national result. It
 * is a poor way to answer the question almost every visitor actually arrives
 * with, which is "what happened in mine". This adds the direct route without
 * taking the regional one away: the sections, their order and their headings
 * are untouched, and this only scrolls the page to one of them.
 *
 * Matching is `filterConstituencies` — the same ranking the registration
 * picker uses, already covered by tests/constituency-picker.test.mjs. Sharing
 * it means "Tema" ranks the same way on both screens, and there is no second
 * scorer to drift from the first. cmdk's own fuzzy filter stays off
 * (`shouldFilter={false}`) for the same reason it is off in the picker: a
 * subsequence match ranked "Techiman North" above "Tema West" for "Tema".
 *
 * Purely presentational. It reads no tallies, decides nothing about the
 * result, and holds no state beyond the search box.
 */

/** How long a jumped-to seat stays outlined. Long enough to find by eye. */
const HIGHLIGHT_MS = 2400

export function ConstituencySearch({ constituencies = [], className }) {
    const [search, setSearch] = useState('')
    const [active, setActive] = useState(false)
    const inputRef = useRef(null)
    const highlightTimer = useRef(null)

    const query = search.trim()
    const open = active && query.length > 0

    const { visible, total, truncated } = useMemo(
        () => filterConstituencies(constituencies, query),
        [constituencies, query]
    )

    useEffect(() => () => clearTimeout(highlightTimer.current), [])

    const jumpTo = useCallback((key) => {
        const section = document.getElementById(`seat-${key}`)
        if (!section) return

        // A smooth scroll across a page this long is a long animation for
        // someone who has asked the system not to animate.
        const reduced =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

        section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })

        // The outline is how a sighted visitor confirms they landed on the seat
        // they picked; moving focus to the heading is how everyone else does.
        // Both, because either alone leaves one group with no confirmation.
        section.setAttribute('data-found', 'true')
        clearTimeout(highlightTimer.current)
        highlightTimer.current = setTimeout(
            () => section.removeAttribute('data-found'),
            HIGHLIGHT_MS
        )

        document.getElementById(`h-${key}`)?.focus({ preventScroll: true })

        setSearch('')
        setActive(false)
    }, [])

    return (
        <div className={cn('relative', className)}>
            <Command
                // We rank and cap the list ourselves, above.
                shouldFilter={false}
                label="Search results by constituency"
                className="overflow-visible bg-transparent"
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        setSearch('')
                        setActive(false)
                        inputRef.current?.blur()
                    }
                }}
            >
                <div className="relative">
                    <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    {/* A plain input rather than <CommandInput>: this is a
                        search bar sitting on the page, not the header of a
                        popover, and it needs its own icon and clear button. */}
                    <input
                        ref={inputRef}
                        type="text"
                        role="combobox"
                        aria-expanded={open}
                        aria-controls="constituency-search-list"
                        aria-autocomplete="list"
                        autoComplete="off"
                        enterKeyHint="search"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value)
                            setActive(true)
                        }}
                        onFocus={() => setActive(true)}
                        // A click on a suggestion blurs the input before the
                        // selection lands, so closing is deferred a tick.
                        onBlur={() => setTimeout(() => setActive(false), 120)}
                        placeholder="Search for a constituency"
                        aria-label="Search for a constituency"
                        className="h-11 w-full rounded-lg border border-border-strong bg-background pr-10 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-sm"
                    />
                    {query ? (
                        <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                setSearch('')
                                inputRef.current?.focus()
                            }}
                            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <X aria-hidden="true" className="size-4" />
                            <span className="sr-only">Clear search</span>
                        </button>
                    ) : null}
                </div>

                {open ? (
                    <CommandList
                        id="constituency-search-list"
                        className="absolute top-full right-0 left-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
                    >
                        <CommandEmpty className="px-4 py-6 text-center text-sm text-muted-foreground">
                            No constituency matches “{query}”.
                        </CommandEmpty>

                        {visible.length > 0 ? (
                            <CommandGroup className="p-1.5">
                                {visible.map((constituency) => (
                                    <CommandItem
                                        key={constituency.key}
                                        value={constituency.key}
                                        onSelect={() => jumpTo(constituency.key)}
                                        className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5"
                                    >
                                        <span className="flex min-w-0 items-center gap-2.5">
                                            <MapPin
                                                aria-hidden="true"
                                                className="size-4 shrink-0 text-muted-foreground"
                                            />
                                            <span className="truncate font-medium">
                                                {constituency.name}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {constituency.region}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ) : null}

                        {truncated ? (
                            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                                Showing the closest {visible.length} of {total} matches. Keep
                                typing to narrow them.
                            </p>
                        ) : null}
                    </CommandList>
                ) : null}
            </Command>
        </div>
    )
}
