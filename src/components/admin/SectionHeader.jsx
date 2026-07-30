import { cn } from '@/lib/utils'

/**
 * The heading block every admin section opens with.
 *
 * Stacks the title above the actions on a phone rather than forcing a
 * `justify-between` row, which previously squeezed "Bulk import CSV" and "Add
 * constituency" into unreadable slivers at narrow widths.
 */
export function SectionHeader({ title, description, actions, className }) {
    return (
        <div
            className={cn(
                'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
                className
            )}
        >
            <div className="min-w-0 space-y-1">
                <h1 className="text-title font-semibold">{title}</h1>
                {description ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                ) : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
    )
}
