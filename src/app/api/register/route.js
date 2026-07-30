import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { signVoterToken, setVoterCookie } from '@/lib/voter-session'
import { isUUID, isValidGhanaPhone, isValidName, checkAgeEligibility } from '@/lib/validation'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, requireSameOrigin, noStore } from '@/lib/http'
import { jsonError, dbError, PG_UNIQUE_VIOLATION, PG_FOREIGN_KEY_VIOLATION } from '@/lib/api-error'

const ALREADY_REGISTERED = 'This phone number is already registered. Please log in instead.'

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    const ip = getClientIp(request)
    const ipLimit = await rateLimit('register-ip', ip, RATE_LIMITS.registerIp)
    if (!ipLimit.allowed) {
        return noStore(jsonError('Too many attempts. Please try again later.', 429))
    }

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400))
    }

    const { full_name, voter_dob, voter_phone, constituency_id } = body ?? {}

    if (!full_name || !voter_dob || !voter_phone || !constituency_id) {
        return noStore(jsonError('All fields are required.', 400))
    }

    const fullName = typeof full_name === 'string' ? full_name.trim().replace(/\s+/g, ' ') : ''
    const phone = typeof voter_phone === 'string' ? voter_phone.replace(/[\s-]/g, '') : ''

    if (!isValidName(fullName)) {
        return noStore(jsonError('Please enter your full name as it appears on your ID.', 400))
    }
    if (!isValidGhanaPhone(phone)) {
        return noStore(
            jsonError('Enter a valid Ghana mobile number, for example 024 123 4567.', 400)
        )
    }

    // The same eligibility function the browser uses, so a voter can never be
    // told one thing by the form and another by the server.
    const age = checkAgeEligibility(voter_dob)
    if (!age.valid) {
        return noStore(jsonError(age.message, 400))
    }

    if (!isUUID(constituency_id)) {
        return noStore(jsonError('Please select your constituency.', 400))
    }

    // Keyed by phone number rather than IP: the tight limit has to sit on the
    // identity being registered, because Ghana's mobile networks put very many
    // subscribers behind very few addresses.
    const phoneLimit = await rateLimit('register-phone', phone, RATE_LIMITS.registerPhone)
    if (!phoneLimit.allowed) {
        return noStore(jsonError('Too many attempts for this phone number. Try again later.', 429))
    }

    const supabase = createAdminClient()

    // Best-effort friendly message. The unique index added in migration 0006 is
    // what actually prevents a duplicate: without it, two concurrent requests
    // can both pass this check and both insert.
    const { data: existing } = await supabase
        .from('voters')
        .select('id')
        .eq('voter_phone', phone)
        .maybeSingle()

    if (existing) {
        return noStore(jsonError(ALREADY_REGISTERED, 409))
    }

    const { data, error } = await supabase
        .from('voters')
        .insert({
            full_name: fullName,
            voter_dob,
            voter_phone: phone,
            constituency_id,
            is_verified: true,
            verification_method: 'self_declared',
        })
        .select('id, full_name, constituency_id, constituencies(name)')
        .single()

    if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
            return noStore(jsonError(ALREADY_REGISTERED, 409))
        }
        if (error.code === PG_FOREIGN_KEY_VIOLATION) {
            return noStore(jsonError('Please select a valid constituency.', 400))
        }
        return dbError(error, 'Could not complete your registration. Please try again.')
    }

    const token = await signVoterToken(data.id)
    const response = noStore(
        NextResponse.json({
            voter: {
                id: data.id,
                full_name: data.full_name,
                constituency_id: data.constituency_id,
                constituency_name: data.constituencies?.name ?? null,
            },
        })
    )
    setVoterCookie(response, token)
    return response
}
