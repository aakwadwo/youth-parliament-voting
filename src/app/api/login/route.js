import { createAdminClient } from '@/lib/supabase-admin'
import { signVoterToken, setVoterCookie } from '@/lib/voter-session'
import { isValidGhanaPhone, isValidDateString } from '@/lib/validation'
import { rateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { jsonError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const ip = getClientIp(request)
    // Date-of-birth has limited entropy, so login is rate limited aggressively
    // to make brute-forcing a phone+DOB combination impractical.
    const ipLimit = await rateLimit('login', ip, RATE_LIMITS.login)
    if (!ipLimit.allowed) {
        return jsonError('Too many attempts. Please try again later.', 429)
    }

    let body
    try {
        body = await request.json()
    } catch {
        return jsonError('Invalid request body', 400)
    }

    const { voter_phone, voter_dob } = body ?? {}

    if (!voter_phone || !voter_dob) {
        return jsonError('Phone number and date of birth are required', 400)
    }

    const phone = voter_phone.trim()

    if (!isValidGhanaPhone(phone) || !isValidDateString(voter_dob)) {
        return jsonError('No voter found with these details. Please register first.', 404)
    }

    // Second key dimension beyond the IP limit above: protects a specific phone
    // number from DOB brute-forcing even if the attacker rotates IPs.
    const phoneLimit = await rateLimit('login-phone', phone, RATE_LIMITS.login)
    if (!phoneLimit.allowed) {
        return jsonError('Too many attempts. Please try again later.', 429)
    }

    const supabase = createAdminClient()

    const { data: voter, error } = await supabase
        .from('voters')
        .select('id, full_name, constituency_id, has_voted, constituencies(name)')
        .eq('voter_phone', phone)
        .eq('voter_dob', voter_dob)
        .single()

    if (error || !voter) {
        return jsonError('No voter found with these details. Please register first.', 404)
    }

    const voterPayload = {
        id: voter.id,
        full_name: voter.full_name,
        constituency_id: voter.constituency_id,
        constituency_name: voter.constituencies?.name,
    }

    if (voter.has_voted) {
        // We deliberately cannot say *who* they voted for — votes carry no
        // reference back to the voter that cast them.
        return NextResponse.json({ voter: voterPayload, already_voted: true })
    }

    const token = await signVoterToken(voter.id)
    const response = NextResponse.json({ voter: voterPayload, already_voted: false })
    setVoterCookie(response, token)
    return response
}
