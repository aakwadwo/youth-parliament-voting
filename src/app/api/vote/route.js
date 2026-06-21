import { createAdminClient } from '@/lib/supabase-admin'
import { getVoterIdFromRequest } from '@/lib/voter-session'
import { isUUID } from '@/lib/validation'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { jsonError, dbError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function POST(request) {
    // The voter session cookie is the only trusted source of identity here —
    // a client-supplied voter_id could otherwise be used to vote on someone else's behalf.
    const voterId = await getVoterIdFromRequest(request)
    if (!voterId) {
        return jsonError('Your session has expired. Please log in again.', 401)
    }

    const limit = await rateLimit('vote', voterId, RATE_LIMITS.vote)
    if (!limit.allowed) {
        return jsonError('Too many attempts. Please try again later.', 429)
    }

    let body
    try {
        body = await request.json()
    } catch {
        return jsonError('Invalid request body', 400)
    }

    const { candidate_id } = body ?? {}

    if (!isUUID(candidate_id)) {
        return jsonError('A valid candidate must be selected', 400)
    }

    const supabase = createAdminClient()

    const { data: voter, error: voterError } = await supabase
        .from('voters')
        .select('id, constituency_id, has_voted')
        .eq('id', voterId)
        .single()

    if (voterError || !voter) {
        return jsonError('Your session is no longer valid. Please log in again.', 401)
    }

    if (voter.has_voted) {
        return jsonError('You have already voted', 409)
    }

    const { data: settings, error: settingsError } = await supabase
        .from('election_settings')
        .select('is_active, voting_opens_at, voting_closes_at')
        .single()

    if (settingsError || !settings?.is_active) {
        return jsonError('Voting is not currently open', 403)
    }

    const now = new Date()
    if (settings.voting_opens_at && new Date(settings.voting_opens_at) > now) {
        return jsonError('Voting has not opened yet', 403)
    }
    if (settings.voting_closes_at && new Date(settings.voting_closes_at) < now) {
        return jsonError('Voting has closed', 403)
    }

    const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .select('id, constituency_id, is_active')
        .eq('id', candidate_id)
        .single()

    if (candidateError || !candidate || !candidate.is_active) {
        return jsonError('Invalid candidate selection', 400)
    }

    // A voter may only vote for a candidate standing in their own constituency.
    if (candidate.constituency_id !== voter.constituency_id) {
        return jsonError('Invalid candidate selection', 400)
    }

    // cast_vote() flips voters.has_voted and inserts the (voter-anonymous) ballot
    // in a single transaction — see migrations/0003_add_cast_vote_function.up.sql.
    // The votes row contains no reference back to this voter at all.
    const { data: result, error } = await supabase.rpc('cast_vote', {
        p_voter_id: voter.id,
        p_candidate_id: candidate.id,
        p_constituency_id: voter.constituency_id,
    })

    if (error) {
        return dbError(error, 'Could not record your vote. Please try again.')
    }

    const outcome = result?.[0]
    if (!outcome?.success) {
        return jsonError('You have already voted', 409)
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set('voter_token', '', { httpOnly: true, maxAge: 0, path: '/' })
    return response
}
