import { NextResponse } from 'next/server'

import { readConstituencies } from '@/lib/constituencies-server'
import { dbError } from '@/lib/api-error'

/**
 * The public constituency list.
 *
 * `/register` no longer calls this — it reads the same list on the server and
 * renders the picker already populated (see `@/lib/constituencies-server`). The
 * route is kept because it is a public, cacheable endpoint that other callers
 * and any future client-side picker can use, and because removing a shipped
 * endpoint breaks anything already pointing at it.
 */
export async function GET() {
    const { constituencies, error } = await readConstituencies()

    if (error) return dbError(error, 'Could not load constituencies.')

    return NextResponse.json(constituencies, {
        // `s-maxage` is what a shared cache in front of this actually keys on;
        // `max-age` alone left edge caching to the CDN's own interpretation
        // while only reliably reaching the browser. Both are stated so the
        // intent is explicit at every layer.
        //
        // Five minutes is safe because this list changes only when an
        // administrator edits it, and `stale-while-revalidate` means an edit is
        // never more than one background refresh away from being visible.
        headers: {
            'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
        },
    })
}
