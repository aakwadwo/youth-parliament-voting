import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { dbError } from '@/lib/api-error'
import { ELECTION_NAME } from '@/lib/election'

/**
 * Public election status.
 *
 * The voter-facing pages previously had no idea whether voting was open. A
 * voter could register, pick a candidate and only discover at the moment of
 * submission that the poll had not opened — after the one irreversible action
 * in the whole flow. This endpoint lets every screen state the position up
 * front.
 *
 * It deliberately exposes only what a voter needs: the election's name and
 * window, and whether it is open right now. No counts, no results, nothing
 * that could influence a vote in progress.
 */
export async function GET() {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('election_settings')
        .select('election_name, is_active, voting_opens_at, voting_closes_at')
        .maybeSingle()

    if (error) return dbError(error, 'Could not load election status.')

    const now = Date.now()
    const opensAt = data?.voting_opens_at ? new Date(data.voting_opens_at).getTime() : null
    const closesAt = data?.voting_closes_at ? new Date(data.voting_closes_at).getTime() : null

    let status = 'closed'
    if (data?.is_active) {
        if (opensAt && opensAt > now) status = 'scheduled'
        else if (closesAt && closesAt < now) status = 'ended'
        else status = 'open'
    }

    return NextResponse.json(
        {
            electionName: data?.election_name ?? ELECTION_NAME,
            status,
            isOpen: status === 'open',
            opensAt: data?.voting_opens_at ?? null,
            closesAt: data?.voting_closes_at ?? null,
        },
        {
            // Short enough that opening the poll is reflected almost at once,
            // long enough to absorb the traffic spike when it does.
            headers: {
                'Cache-Control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=45',
            },
        }
    )
}
