import { createAdminClient } from '@/lib/supabase-admin'
import { signVoterToken, setVoterCookie } from '@/lib/voter-session'
import { isUUID, isValidGhanaPhone, isValidName, isEligibleAge } from '@/lib/validation'
import { rateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { jsonError, dbError, PG_UNIQUE_VIOLATION, PG_FOREIGN_KEY_VIOLATION } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const ip = getClientIp(request)
    const limit = await rateLimit('register', ip, RATE_LIMITS.register)
    if (!limit.allowed) {
        return jsonError('Too many attempts. Please try again later.', 429)
    }

    let body
    try {
        body = await request.json()
    } catch {
        return jsonError('Invalid request body', 400)
    }

    const { full_name, voter_dob, voter_phone, constituency_id } = body ?? {}

    if (!full_name || !voter_dob || !voter_phone || !constituency_id) {
        return jsonError('All fields are required', 400)
    }

    const fullName = full_name.trim()
    const phone = voter_phone.trim()

    if (!isValidName(fullName)) {
        return jsonError('Please enter a valid full name', 400)
    }
    if (!isValidGhanaPhone(phone)) {
        return jsonError('Enter a valid Ghana phone number (e.g. 0241234567)', 400)
    }
    if (!isEligibleAge(voter_dob)) {
        return jsonError('You must be between 18 and 35 years old', 400)
    }
    if (!isUUID(constituency_id)) {
        return jsonError('Please select a valid constituency', 400)
    }

    const supabase = createAdminClient()

    const { data: existing } = await supabase
        .from('voters')
        .select('id')
        .eq('voter_phone', phone)
        .single()

    if (existing) {
        return jsonError('This phone number is already registered. Please login instead.', 409)
    }

    const { data, error } = await supabase
        .from('voters')
        .insert({ full_name: fullName, voter_dob, voter_phone: phone, constituency_id })
        .select('id, full_name, constituency_id')
        .single()

    if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
            return jsonError('This phone number is already registered. Please login instead.', 409)
        }
        if (error.code === PG_FOREIGN_KEY_VIOLATION) {
            return jsonError('Please select a valid constituency', 400)
        }
        return dbError(error, 'Could not complete registration. Please try again.')
    }

    const token = await signVoterToken(data.id)
    const response = NextResponse.json({
        id: data.id,
        full_name: data.full_name,
        constituency_id: data.constituency_id,
    })
    setVoterCookie(response, token)
    return response
}
