import { NextResponse } from 'next/server'

import { dbError } from '@/lib/api-error'
import { readElection } from '@/lib/election-server'

/**
 * Public election status.
 *
 * The voter-facing pages previously had no idea whether voting was open. A
 * voter could register, pick a candidate and only discover at the moment of
 * submission that the poll had not opened — after the one irreversible action
 * in the whole flow. This endpoint lets every screen state the position up
 * front.
 *
 * The derivation now lives in `@/lib/election-status` and is shared with the
 * gates on the voting routes, so what a voter is told here and what they are
 * actually allowed to do cannot drift apart.
 *
 * It deliberately exposes only what a voter needs: the election's name,
 * description and window, and whether it is open right now. No counts, no
 * results, nothing that could influence a vote in progress.
 */
export async function GET() {
    const { election, error } = await readElection()

    if (error) return dbError(error, 'Could not load election status.')

    return NextResponse.json(election, {
        // Short enough that opening the poll is reflected almost at once,
        // long enough to absorb the traffic spike when it does.
        headers: {
            'Cache-Control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=45',
        },
    })
}
