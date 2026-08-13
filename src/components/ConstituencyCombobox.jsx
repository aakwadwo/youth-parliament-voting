'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { filterConstituencies } from '@/lib/constituency-search'

/**
 * Constituency picker.
 *
 * A native `<select>` holding 276 options is unusable on a phone, so this is a
 * searchable combobox.
 *
 *  - accepts an `id` and the `aria-*` props from <Field>, so the control is
 *    associated with its visible label rather than being announced as an
 *    unlabelled button.
 *  - lists the region under each name: constituencies with similar names exist
 *    in different regions, and a voter has to be able to tell them apart.
 *  - filters and ranks in this component rather than in cmdk, so only the rows
 *    that can match are ever mounted.
 *
 * `loading` is retained for callers that still populate this asynchronously.
 * The registration form no longer does — it receives the list from the server —
 * so in that flow this control is never in a loading state at all.
 */
export function ConstituencyCombobox({
    constituencies = [],
    value,
    onChange,
    loading = false,
    disabled = false,
    placeholder = 'Search for your constituency',
    id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
    'aria-required': required,
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')

    const selected = constituencies.find((c) => c.id === value)

    const { visible, total, truncated } = useMemo(
        () => filterConstituencies(constituencies, search),
        [constituencies, search]
    )

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next)
                // Every open starts from the full list. Reopening the picker to
                // a stale search term looks like most of the country has gone
                // missing.
                if (!next) setSearch('')
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    aria-required={required}
                    disabled={disabled || loading}
                    className={cn(
                        'h-10 w-full justify-between px-3 font-normal',
                        !selected && 'text-muted-foreground',
                        invalid && 'border-destructive'
                    )}
                >
                    <span className="truncate">
                        {loading ? 'Loading constituencies…' : (selected?.name ?? placeholder)}
                    </span>
                    {loading ? (
                        <Loader2 aria-hidden="true" className="ml-2 size-4 shrink-0 animate-spin" />
                    ) : (
                        <ChevronsUpDown
                            aria-hidden="true"
                            className="ml-2 size-4 shrink-0 opacity-50"
                        />
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent
                align="start"
                className="w-(--radix-popover-trigger-width) p-0"
                // Focus deliberately moves into the search field on open. With
                // 276 constituencies, typing to filter is the primary way to
                // use this control, and suppressing the autofocus to keep the
                // mobile keyboard down left keyboard users with nowhere to type.
            >
                {/* shouldFilter={false}: the filtering above has already decided
                    what may appear, so cmdk must not apply its fuzzy scorer on
                    top of it and reorder the result. */}
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Type a constituency or region…"
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList className="max-h-64">
                        {visible.length === 0 ? (
                            <CommandEmpty>
                                <span className="text-muted-foreground">
                                    No constituency matches that search.
                                </span>
                            </CommandEmpty>
                        ) : null}
                        <CommandGroup>
                            {visible.map((c) => (
                                <CommandItem
                                    key={c.id}
                                    // The id, not the name: with filtering done
                                    // here this value is only an identity, and
                                    // two constituencies may share a name.
                                    value={c.id}
                                    onSelect={() => {
                                        onChange(c)
                                        setOpen(false)
                                        setSearch('')
                                    }}
                                    className="gap-3"
                                >
                                    <Check
                                        aria-hidden="true"
                                        className={cn(
                                            'size-4 shrink-0 text-primary',
                                            value === c.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate">{c.name}</span>
                                        {c.region ? (
                                            <span className="truncate text-xs font-normal text-muted-foreground">
                                                {c.region}
                                            </span>
                                        ) : null}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        {/* Never let a capped list look like a complete one. */}
                        {truncated ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">
                                Showing the closest {visible.length} of {total}. Keep typing to
                                narrow the list.
                            </p>
                        ) : null}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
