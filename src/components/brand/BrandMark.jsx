import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * The official National Youth Parliament Ghana mark.
 *
 * Two lockups, both derived from public/ypg.jpg:
 *   emblem  — the arc, figures and parliament building only. Legible down to
 *             favicon size, so it is what appears in navigation.
 *   lockup  — emblem plus the "Youth Parliament Ghana" wordmark. Reserved for
 *             the landing page, sign-in screens and exported reports, where
 *             the institution needs to name itself.
 *
 * The source assets have a transparent background, so the mark must sit on a
 * light surface. On dark surfaces pass `plate` to place it on a white chip —
 * the building's white pillar gaps would otherwise disappear into the page.
 */

const ASPECT = {
    emblem: 512 / 476,
    lockup: 880 / 1065,
}

export function BrandMark({
    variant = 'emblem',
    height = 32,
    plate = false,
    priority = false,
    className,
    ...props
}) {
    const width = Math.round(height * ASPECT[variant])

    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center justify-center',
                plate && 'rounded-md bg-white p-1 ring-1 ring-black/5',
                className
            )}
            {...props}
        >
            <Image
                src={`/brand/${variant}.png`}
                alt=""
                width={width}
                height={height}
                priority={priority}
                // The mark is a fixed-size chrome element, never a fluid image,
                // so an explicit sizes hint avoids over-fetching on mobile.
                sizes={`${width}px`}
                className="h-full w-auto object-contain"
            />
        </span>
    )
}

/**
 * The tricolour rule. The only place the logo's red, gold and green appear
 * together — it signs a page as official without adding chrome.
 */
export function TricolourRule({ className }) {
    return <div aria-hidden="true" className={cn('brand-rule h-1 w-full', className)} />
}

/**
 * Mark + institution name, as used in page headers.
 */
export function BrandLockup({ subtitle, height = 34, className }) {
    return (
        <span className={cn('flex items-center gap-2.5', className)}>
            <BrandMark height={height} priority />
            <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[0.9375rem] font-semibold tracking-tight">
                    Youth Parliament Ghana
                </span>
                {subtitle ? (
                    <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
                ) : null}
            </span>
        </span>
    )
}
