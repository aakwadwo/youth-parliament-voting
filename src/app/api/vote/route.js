import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { getVoterIdFromRequest, clearVoterCookie } from '@/lib/voter-session'
import { isUUID } from '@/lib/validation'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { requireSameOrigin, noStore, rateLimitRefusal } from '@/lib/http'
import { jsonError, dbError, ERROR_CODES } from '@/lib/api-error'
import { requireVotingOpen } from '@/lib/election-server'
import { ELECTION_GATE_MESSAGES, ELECTION_GATE_CODES, ELECTION_STATUS } from '@/lib/election-status'

// Each failure reason from cast_vote() maps to one HTTP status, one
// voter-facing sentence and one stable code. Nothing here reveals anything
// about another voter, or about the contents of any ballot.
//
// The three voting-window reasons deliberately reuse the shared gate wording,
// so a voter who reaches this point at the exact moment the poll closes is
// told the same thing as one who was stopped earlier by the route gate.
const FAILURE_RESPONSES = {
    voter_not_found: [
        'Your session is no longer valid. Please sign in again.',
        401,
        ERROR_CODES.SESSION_EXPIRED,
    ],
    already_voted: [
        'You have already voted in this election.',
        409,
        ERROR_CODES.ALREADY_VOTED,
    ],
    voting_closed: [
        ELECTION_GATE_MESSAGES[ELECTION_STATUS.CLOSED],
        403,
        ELECTION_GATE_CODES[ELECTION_STATUS.CLOSED],
    ],
    voting_not_started: [
        ELECTION_GATE_MESSAGES[ELECTION_STATUS.SCHEDULED],
        403,
        ELECTION_GATE_CODES[ELECTION_STATUS.SCHEDULED],
    ],
    voting_ended: [
        ELECTION_GATE_MESSAGES[ELECTION_STATUS.ENDED],
        403,
        ELECTION_GATE_CODES[ELECTION_STATUS.ENDED],
    ],
    invalid_candidate: [
        'That candidate is not standing in this election.',
        400,
        ERROR_CODES.VALIDATION_FAILED,
    ],
    wrong_constituency: [
        'That candidate is not standing in your constituency.',
        400,
        ERROR_CODES.VALIDATION_FAILED,
    ],
}

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    // The session cookie is the only trusted source of identity. A
    // client-supplied voter id could otherwise be used to vote as someone else.
    const voterId = await getVoterIdFromRequest(request)
    if (!voterId) {
        return noStore(
            jsonError('Your session has expired. Please sign in again.', 401, ERROR_CODES.SESSION_EXPIRED)
        )
    }

    const limit = await rateLimit('vote', voterId, RATE_LIMITS.vote)
    if (!limit.allowed) {
        return rateLimitRefusal(limit, 'Too many attempts. Please try again shortly.')
    }

    // An explicit window check before the ballot is even parsed, so a voter who
    // arrives outside the poll is told *why* rather than being handed a generic
    // rejection. cast_vote() re-checks the same window inside the writing
    // transaction and remains the authority — this cannot be relied on alone,
    // because the poll can close between here and the insert.
    const { response: refusal } = await requireVotingOpen()
    if (refusal) return refusal

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400, ERROR_CODES.INVALID_BODY))
    }

    const { candidate_id } = body ?? {}

    if (!isUUID(candidate_id)) {
        return noStore(
            jsonError('A valid candidate must be selected.', 400, ERROR_CODES.VALIDATION_FAILED)
        )
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
        const [message, status, code] = FAILURE_RESPONSES[outcome?.reason] ?? [
            'Could not record your vote. Please try again.',
            400,
            ERROR_CODES.VALIDATION_FAILED,
        ]
        const response = noStore(jsonError(message, status, code))
        // Once a ballot exists for this voter the session has served its
        // purpose, so it is retired rather than left usable.
        if (outcome?.reason === 'already_voted') clearVoterCookie(response)
        return response
    }

    const response = noStore(NextResponse.json({ success: true }))
    clearVoterCookie(response)
    return response
}
