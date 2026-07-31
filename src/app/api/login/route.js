import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { signVoterToken, setVoterCookie } from '@/lib/voter-session'
import { isValidGhanaPhone, isValidDateString } from '@/lib/validation'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, requireSameOrigin, noStore, rateLimitRefusal } from '@/lib/http'
import { jsonError, ERROR_CODES } from '@/lib/api-error'
import { requireVotingOpen } from '@/lib/election-server'

// One message for "no such phone number" and for "wrong date of birth". Two
// distinct messages would turn this endpoint into an oracle for checking
// whether a given Ghanaian mobile number is registered to vote.
//
// Returned as 401 rather than the 404 this used to send. A 404 says "that URL
// does not exist", which is not what happened: the endpoint exists and it
// rejected the credentials presented. Anything sitting in front of the app —
// a CDN, a monitor, an error budget — reads 404 as a routing fault and 401 as
// a failed authentication, and only one of those is true here.
const NOT_FOUND = 'We could not find a registration with those details. Please check and try again.'

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    const ip = getClientIp(request)
    const ipLimit = await rateLimit('login-ip', ip, RATE_LIMITS.loginIp)
    if (!ipLimit.allowed) {
        return rateLimitRefusal(ipLimit, 'Too many attempts. Please try again later.')
    }

    // Signing in exists only to reach the ballot, so it is gated on the poll
    // being open. Two reasons beyond consistency with the rest of the flow:
    // a voter session issued outside the voting window is a credential with
    // nothing to authorise, and this endpoint is the platform's only oracle
    // for "is this phone number registered" — leaving it answering around the
    // clock widens the window for the enumeration the per-phone limit exists
    // to slow down.
    const { response: refusal } = await requireVotingOpen()
    if (refusal) return refusal

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400, ERROR_CODES.INVALID_BODY))
    }

    const { voter_phone, voter_dob } = body ?? {}

    if (!voter_phone || !voter_dob) {
        return noStore(
            jsonError('Phone number and date of birth are required.', 400, ERROR_CODES.MISSING_FIELDS)
        )
    }

    const phone = typeof voter_phone === 'string' ? voter_phone.replace(/[\s-]/g, '') : ''

    if (!isValidGhanaPhone(phone) || !isValidDateString(voter_dob)) {
        return noStore(jsonError(NOT_FOUND, 401, ERROR_CODES.INVALID_CREDENTIALS))
    }

    // The limit that actually matters. A date of birth inside the 18-35
    // eligibility window is roughly 6,600 possibilities, so without a per-phone
    // cap an attacker who knows someone's number could enumerate it. Eight
    // attempts per number per day makes that take centuries.
    const phoneLimit = await rateLimit('login-phone', phone, RATE_LIMITS.loginPhone)
    if (!phoneLimit.allowed) {
        return rateLimitRefusal(
            phoneLimit,
            'Too many sign-in attempts for this number. Please try again tomorrow.'
        )
    }

    const supabase = createAdminClient()

    const { data: voter, error } = await supabase
        .from('voters')
        .select('id, full_name, constituency_id, has_voted, constituencies(name)')
        .eq('voter_phone', phone)
        .eq('voter_dob', voter_dob)
        .maybeSingle()

    if (error || !voter) {
        return noStore(jsonError(NOT_FOUND, 401, ERROR_CODES.INVALID_CREDENTIALS))
    }

    const voterPayload = {
        id: voter.id,
        full_name: voter.full_name,
        constituency_id: voter.constituency_id,
        constituency_name: voter.constituencies?.name ?? null,
    }

    if (voter.has_voted) {
        // We can confirm that they voted, but deliberately cannot say who for:
        // ballots carry no reference back to the voter who cast them.
        return noStore(NextResponse.json({ voter: voterPayload, already_voted: true }))
    }

    const token = await signVoterToken(voter.id)
    const response = noStore(NextResponse.json({ voter: voterPayload, already_voted: false }))
    setVoterCookie(response, token)
    return response
}
