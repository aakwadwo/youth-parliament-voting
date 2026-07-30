import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { getVoterIdFromRequest, clearVoterCookie } from '@/lib/voter-session'
import { isUUID } from '@/lib/validation'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { requireSameOrigin, noStore, rateLimitRefusal } from '@/lib/http'
import { jsonError, dbError } from '@/lib/api-error'

// Each failure reason from cast_vote() maps to one HTTP status and one
// voter-facing sentence. Nothing here reveals anything about another voter, or
// about the contents of any ballot.
const FAILURE_RESPONSES = {
    voter_not_found: ['Your session is no longer valid. Please log in again.', 401],
    already_voted: ['You have already voted in this election.', 409],
    voting_closed: ['Voting is not currently open.', 403],
    voting_not_started: ['Voting has not opened yet.', 403],
    voting_ended: ['Voting has closed.', 403],
    invalid_candidate: ['That candidate is not standing in this election.', 400],
    wrong_constituency: ['That candidate is not standing in your constituency.', 400],
}

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    // The session cookie is the only trusted source of identity. A
    // client-supplied voter id could otherwise be used to vote as someone else.
    const voterId = await getVoterIdFromRequest(request)
    if (!voterId) {
        return noStore(jsonError('Your session has expired. Please log in again.', 401))
    }

    const limit = await rateLimit('vote', voterId, RATE_LIMITS.vote)
    if (!limit.allowed) {
        return rateLimitRefusal(limit, 'Too many attempts. Please try again shortly.')
    }

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400))
    }

    const { candidate_id } = body ?? {}

    if (!isUUID(candidate_id)) {
        return noStore(jsonError('A valid candidate must be selected.', 400))
    }

    const supabase = createAdminClient()

    // One call. cast_vote() re-reads the voter, the election window and the
    // candidate inside the same transaction that writes the ballot, so there
    // is no window in which voting can close, or a candidate be withdrawn,
    // between a check passing and the ballot landing.
    // See migrations/0008_harden_cast_vote.up.sql.
    const { data: result, error } = await supabase.rpc('cast_vote', {
        p_voter_id: voterId,
        p_candidate_id: candidate_id,
    })

    if (error) {
        return noStore(dbError(error, 'Could not record your vote. Please try again.'))
    }

    const outcome = result?.[0]

    if (!outcome?.success) {
        const [message, status] = FAILURE_RESPONSES[outcome?.reason] ?? [
            'Could not record your vote. Please try again.',
            400,
        ]
        const response = noStore(jsonError(message, status))
        // Once a ballot exists for this voter the session has served its
        // purpose, so it is retired rather than left usable.
        if (outcome?.reason === 'already_voted') clearVoterCookie(response)
        return response
    }

    const response = noStore(NextResponse.json({ success: true }))
    clearVoterCookie(response)
    return response
}
