'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function ConstituencyCombobox({ constituencies, value, onChange }) {
    const [open, setOpen] = useState(false)

    const selected = constituencies.find(c => c.id === value)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    {selected ? selected.name : 'Search constituency...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                <Command>
                    <CommandInput placeholder="Type to search..." />
                    <CommandList>
                        <CommandEmpty>No constituency found.</CommandEmpty>
                        <CommandGroup>
                            {constituencies.map(c => (
                                <CommandItem
                                    key={c.id}
                                    value={c.name}
                                    onSelect={() => {
                                        onChange(c)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            value === c.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    {c.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}