import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { isUUID } from '@/lib/validation'
import { jsonError, dbError, ERROR_CODES } from '@/lib/api-error'
import { requireVotingOpen } from '@/lib/election-server'
import { noStore } from '@/lib/http'

/**
 * The candidates standing in one constituency.
 *
 * Gated on the election being open. Who is standing is not secret in
 * principle, but publishing the field before the poll opens turns this
 * endpoint into an early-release channel for a list the Commission has not
 * announced yet. Hiding the list in the UI while leaving this route open would
 * mean the restriction lasted exactly as long as it took someone to open the
 * network tab.
 *
 * The gate runs before the constituency id is validated, so a refusal never
 * depends on whether the caller happened to guess a real constituency.
 */
export async function GET(request) {
    const { response: refusal } = await requireVotingOpen()
    if (refusal) return refusal

    const { searchParams } = new URL(request.url)
    const constituencyId = searchParams.get('constituency_id')

    if (!isUUID(constituencyId)) {
        return noStore(
            jsonError('A valid constituency_id is required', 400, ERROR_CODES.VALIDATION_FAILED)
        )
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('candidates')
        .select('id, full_name, photo_url')
        .eq('constituency_id', constituencyId)
        .eq('is_active', true)
        .order('full_name')

    if (error) return dbError(error, 'Could not load candidates.')

    return NextResponse.json(data, {
        // Shorter than the five minutes this used to carry: the list is only
        // served while the poll is open, so a cached copy must not outlive the
        // poll closing by much.
        //
        // `s-maxage` is what a shared cache in front of this actually keys on;
        // `max-age` alone reliably reached only the browser. With one variant
        // per constituency and a whole electorate voting in a day, that was
        // roughly one origin request per voter instead of one per constituency
        // per minute. A cached list outliving the poll's close is harmless:
        // /api/vote re-checks the window inside the writing transaction, so a
        // stale ballot paper cannot produce an accepted ballot.
        headers: {
            'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=30',
        },
    })
}
