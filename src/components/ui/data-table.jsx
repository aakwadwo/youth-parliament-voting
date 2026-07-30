'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/feedback'

/**
 * The one table used across the admin portal.
 *
 * A conventional `<table>` inside `overflow-x-auto` is unusable on a phone —
 * you are side-scrolling a four-column grid through a 360px window. So the
 * same data renders two ways from one column definition:
 *
 *   below `md`  a stacked card per row, each cell labelled by its header
 *   `md` and up a real semantic table
 *
 * The desktop table is still wrapped in a keyboard-focusable scroll region
 * (WCAG 2.1.1) for the rare case where content genuinely overflows.
 *
 * Columns:
 *   key      unique id
 *   header   column heading
 *   cell     (row) => ReactNode
 *   primary  used as the card heading on mobile; the header is not repeated
 *   align    'right' aligns the cell and its header
 *   hideOnMobile  drop the cell from the stacked card (e.g. redundant data)
 */
export function DataTable({
    columns,
    rows,
    getRowKey,
    caption,
    loading = false,
    skeletonRows = 5,
    empty = null,
    className,
}) {
    const isEmpty = !loading && rows.length === 0

    if (isEmpty && empty) {
        return (
            <div className={cn('rounded-xl border border-border bg-card', className)}>{empty}</div>
        )
    }

    return (
        <div className={className}>
            {/* Mobile: stacked cards */}
            <div className="space-y-3 md:hidden">
                {loading
                    ? Array.from({ length: skeletonRows }, (_, i) => (
                          <Skeleton key={i} className="h-28 w-full rounded-xl" />
                      ))
                    : rows.map((row) => {
                          const primary = columns.find((c) => c.primary)
                          const rest = columns.filter((c) => !c.primary && !c.hideOnMobile)
                          return (
                              <div
                                  key={getRowKey(row)}
                                  className="rounded-xl border border-border bg-card p-4"
                              >
                                  {primary ? (
                                      <div className="mb-3 text-sm font-semibold text-foreground">
                                          {primary.cell(row)}
                                      </div>
                                  ) : null}
                                  <dl className="space-y-2">
                                      {rest.map((col) => (
                                          <div
                                              key={col.key}
                                              className="flex items-start justify-between gap-4 text-sm"
                                          >
                                              <dt className="shrink-0 text-muted-foreground">
                                                  {col.header}
                                              </dt>
                                              <dd className="min-w-0 text-right font-medium">
                                                  {col.cell(row)}
                                              </dd>
                                          </div>
                                      ))}
                                  </dl>
                              </div>
                          )
                      })}
            </div>

            {/* Desktop: real table */}
            <div
                role="region"
                aria-label={caption}
                tabIndex={0}
                className="hidden overflow-x-auto rounded-xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:block"
            >
                <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">{caption}</caption>
                    <thead>
                        <tr className="border-b border-border bg-muted/50">
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    scope="col"
                                    className={cn(
                                        'px-5 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase',
                                        col.align === 'right' && 'text-right'
                                    )}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading
                            ? Array.from({ length: skeletonRows }, (_, i) => (
                                  <tr key={i}>
                                      {columns.map((col) => (
                                          <td key={col.key} className="px-5 py-4">
                                              <Skeleton className="h-4 w-full max-w-40" />
                                          </td>
                                      ))}
                                  </tr>
                              ))
                            : rows.map((row) => (
                                  <tr
                                      key={getRowKey(row)}
                                      className="transition-colors hover:bg-muted/40"
                                  >
                                      {columns.map((col) => (
                                          <td
                                              key={col.key}
                                              className={cn(
                                                  'px-5 py-3.5 align-middle',
                                                  col.align === 'right' && 'text-right'
                                              )}
                                          >
                                              {col.cell(row)}
                                          </td>
                                      ))}
                                  </tr>
                              ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
