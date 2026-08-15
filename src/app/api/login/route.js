import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { signVoterToken, setVoterCookie } from '@/lib/voter-session'
import { isValidGhanaPhone, isValidDateString, normalisePhone } from '@/lib/validation'
import { requireSameOrigin, noStore } from '@/lib/http'
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

/**
 * Voter sign-in is deliberately NOT rate limited.
 *
 * Removed on polling day, 15 August 2026, by instruction of the Commission. A
 * registered voter may attempt sign-in as many times as they need.
 *
 * ── What this gives up ───────────────────────────────────────────────────────
 *
 * This route previously carried two caps: 2,000 attempts per IP per hour, and
 * 8 per phone number per 24 hours. The per-phone cap was the control that
 * mattered. Credentials here are a mobile number plus a date of birth, and a
 * date of birth inside the 18-35 eligibility window is roughly 6,600
 * possibilities — so with no cap, anyone who knows a registered voter's number
 * can enumerate their date of birth and sign in as them. The per-IP cap was
 * also the only thing bounding an unattended script hammering this endpoint,
 * which is additionally the platform's one oracle for "is this number on the
 * register".
 *
 * ── What still stands ────────────────────────────────────────────────────────
 *
 * Signing in is not voting. One person still gets one ballot: `voters.has_voted`
 * is claimed inside the cast_vote() transaction, the per-voter cap on /api/vote
 * is untouched, and a cast ballot retires its own session. The window gate still
 * refuses every request outside polling hours. So the exposure created here is
 * impersonation of a voter who has not yet voted — not double voting.
 *
 * Restoring this is a two-line change: reinstate the per-phone bucket here
 * against `RATE_LIMITS.loginPhone`, which is still defined and still tuned.
 */
export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    // Signing in exists only to reach the ballot, so it is gated on the poll
    // being open: a voter session issued outside the voting window is a
    // credential with nothing to authorise.
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

    // `normalisePhone`, not a local replace. `isValidGhanaPhone` normalises
    // internally before testing, so a route that validates one string and then
    // queries a different one accepts a number as valid and then fails to find
    // it. That is exactly what happened to every voter whose handset supplied
    // "+233 24 123 4567": the number passed validation, the lookup ran against
    // the unnormalised text, and they were told no such registration existed.
    // The register stores the national form, so the lookup must use it too.
    const phone = normalisePhone(voter_phone)

    if (!isValidGhanaPhone(phone) || !isValidDateString(voter_dob)) {
        return noStore(jsonError(NOT_FOUND, 401, ERROR_CODES.INVALID_CREDENTIALS))
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
