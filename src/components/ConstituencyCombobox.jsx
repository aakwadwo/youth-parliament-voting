'use client'

import { useState } from 'react'
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

/**
 * Constituency picker.
 *
 * A native `<select>` holding 275 options is unusable on a phone, so this is a
 * searchable combobox. Changes from the previous version:
 *
 *  - accepts an `id` and the `aria-*` props from <Field>, so the control is
 *    finally associated with its visible label. It previously had none, and a
 *    screen reader announced it only as an unlabelled button.
 *  - shows a loading state rather than an empty list while the constituencies
 *    are still being fetched, which read to the voter as "no results".
 *  - lists the region under each name: constituencies with similar names exist
 *    in different regions, and a voter has to be able to tell them apart.
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
    const selected = constituencies.find((c) => c.id === value)

    return (
        <Popover open={open} onOpenChange={setOpen}>
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
                // 275 constituencies, typing to filter is the primary way to
                // use this control, and suppressing the autofocus to keep the
                // mobile keyboard down left keyboard users with nowhere to type.
            >
                {/* cmdk's default scorer is a fuzzy subsequence match, which
                    ranked "Techiman North" above "Tema West" for the search
                    "Tema". On a ballot form, where choosing the wrong
                    constituency means voting in the wrong race, matching has to
                    be predictable: substring only, with names that start with
                    the search term ranked above ones that merely contain it,
                    and region matches last. */}
                <Command
                    filter={(value, search) => {
                        const haystack = value.toLowerCase()
                        const needle = search.trim().toLowerCase()
                        if (!needle) return 1
                        if (haystack.startsWith(needle)) return 1
                        if (haystack.includes(needle)) return 0.5
                        return 0
                    }}
                >
                    <CommandInput placeholder="Type a constituency or region…" />
                    <CommandList className="max-h-64">
                        <CommandEmpty>
                            <span className="text-muted-foreground">
                                No constituency matches that search.
                            </span>
                        </CommandEmpty>
                        <CommandGroup>
                            {constituencies.map((c) => (
                                <CommandItem
                                    key={c.id}
                                    // Searchable by region as well as by name.
                                    value={`${c.name} ${c.region ?? ''}`}
                                    onSelect={() => {
                                        onChange(c)
                                        setOpen(false)
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
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
