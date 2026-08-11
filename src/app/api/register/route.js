import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { signVoterToken, setVoterCookie } from '@/lib/voter-session'
import { isUUID, isValidGhanaPhone, isValidName, checkAgeEligibility } from '@/lib/validation'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, requireSameOrigin, noStore, rateLimitRefusal } from '@/lib/http'
import {
    jsonError,
    dbError,
    ERROR_CODES,
    PG_UNIQUE_VIOLATION,
    PG_FOREIGN_KEY_VIOLATION,
} from '@/lib/api-error'
import { readElection } from '@/lib/election-server'
import { isVotingOpen } from '@/lib/election-status'
import {
    checkDeviceEligibility,
    recordDeviceRegistration,
    newDeviceId,
    setDeviceCookie,
    DEVICE_COOKIE,
} from '@/lib/device-registration'

const ALREADY_REGISTERED = 'This phone number is already registered. Please sign in instead.'

/**
 * Registration is deliberately NOT gated on the voting window.
 *
 * The register has to be open before the poll — that is the whole point of a
 * registration period — and closing it the moment voting ends would turn a
 * late arrival into an error rather than an explanation. What changes with the
 * election state is only what a voter is offered next, so the state travels
 * back in the success payload and the confirmation screen renders from it.
 * Sending it here rather than letting the page fetch it separately means the
 * screen cannot contradict the decision the server just made.
 */

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    const ip = getClientIp(request)
    const ipLimit = await rateLimit('register-ip', ip, RATE_LIMITS.registerIp)
    if (!ipLimit.allowed) {
        return rateLimitRefusal(ipLimit, 'Too many attempts. Please try again later.')
    }

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400, ERROR_CODES.INVALID_BODY))
    }

    const { full_name, voter_dob, voter_phone, constituency_id } = body ?? {}

    if (!full_name || !voter_dob || !voter_phone || !constituency_id) {
        return noStore(jsonError('All fields are required.', 400, ERROR_CODES.MISSING_FIELDS))
    }

    const fullName = typeof full_name === 'string' ? full_name.trim().replace(/\s+/g, ' ') : ''
    const phone = typeof voter_phone === 'string' ? voter_phone.replace(/[\s-]/g, '') : ''

    if (!isValidName(fullName)) {
        return noStore(
            jsonError(
                'Please enter your full name as it appears on your ID.',
                400,
                ERROR_CODES.VALIDATION_FAILED
            )
        )
    }
    if (!isValidGhanaPhone(phone)) {
        return noStore(
            jsonError(
                'Enter a valid Ghana mobile number, for example 024 123 4567.',
                400,
                ERROR_CODES.VALIDATION_FAILED
            )
        )
    }

    // The same eligibility function the browser uses, so a voter can never be
    // told one thing by the form and another by the server.
    const age = checkAgeEligibility(voter_dob)
    if (!age.valid) {
        return noStore(jsonError(age.message, 400, ERROR_CODES.VALIDATION_FAILED))
    }

    if (!isUUID(constituency_id)) {
        return noStore(
            jsonError('Please select your constituency.', 400, ERROR_CODES.VALIDATION_FAILED)
        )
    }

    // Keyed by phone number rather than IP: the tight limit has to sit on the
    // identity being registered, because Ghana's mobile networks put very many
    // subscribers behind very few addresses.
    const phoneLimit = await rateLimit('register-phone', phone, RATE_LIMITS.registerPhone)
    if (!phoneLimit.allowed) {
        return rateLimitRefusal(
            phoneLimit,
            'Too many attempts for this phone number. Try again later.'
        )
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
        return noStore(jsonError(ALREADY_REGISTERED, 409, ERROR_CODES.ALREADY_REGISTERED))
    }

    // How many voters this device has registered recently (migration 0016).
    // A device may enrol several people — a household phone and a school
    // computer are how a great many voters will reach this form — but not an
    // unbounded number, and not at machine speed.
    //
    // Checked here rather than earlier so that a voter who simply mistyped
    // their name, picked the wrong constituency or re-entered a number that is
    // already registered is not charged a device slot for an attempt that was
    // never going to create a row. Read-only — the device is charged only after
    // the insert below actually succeeds.
    //
    // Nothing about this decision reaches the ballot: registration_events is
    // never read when authorising a vote, and a voter registered here may sign
    // in and vote from any device at all.
    const deviceSignals = {
        deviceId: request.cookies.get(DEVICE_COOKIE)?.value,
        ip,
        userAgent: request.headers.get('user-agent'),
    }
    const device = await checkDeviceEligibility(supabase, deviceSignals)
    if (!device.allowed) {
        // Deliberately no Retry-After. The refusal is genuine and the voter is
        // told to try again later in words, but publishing an exact countdown
        // would hand out the width of the window — which is a security control,
        // not something a voter needs to know to the second.
        console.warn(
            `[register] device limit reached (${device.reason}), retry in ${device.retryAfterSeconds}s`
        )
        return noStore(jsonError(device.message, 409, ERROR_CODES.DEVICE_LIMIT))
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
        // `registered_at` and `voter_dob` are read back from the row rather than
        // echoed from the request, so the receipt shows what was actually
        // stored — including the database's own timestamp — instead of what the
        // browser believed it sent.
        .select('id, full_name, voter_dob, registered_at, constituency_id, constituencies(name)')
        .single()

    if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
            return noStore(jsonError(ALREADY_REGISTERED, 409, ERROR_CODES.ALREADY_REGISTERED))
        }
        if (error.code === PG_FOREIGN_KEY_VIOLATION) {
            return noStore(
                jsonError('Please select a valid constituency.', 400, ERROR_CODES.VALIDATION_FAILED)
            )
        }
        return dbError(error, 'Could not complete your registration. Please try again.')
    }

    // The voter row now exists, so charge the device. Issue a device id if this
    // browser did not already carry one, so the next attempt is recognised.
    const existingDeviceId = deviceSignals.deviceId
    const deviceId = existingDeviceId ?? newDeviceId()
    await recordDeviceRegistration(supabase, { ...deviceSignals, deviceId })

    // What the voter is offered next depends entirely on where the election is
    // in its lifecycle, so the state is read once here and returned with the
    // registration. A failed read is not allowed to fail the registration —
    // the voter is on the register either way — so the page falls back to
    // polling /api/election when `election` is null.
    const { election } = await readElection(supabase)

    // Deliberately no `id` and no `constituency_id`. Nothing in the browser has
    // needed either since the ballot began reading the voter from the session
    // cookie server-side, and a voter's row id is an internal handle that the
    // confirmation screen has no use for. What is returned is exactly what that
    // screen asks the voter to check, and nothing else.
    const response = noStore(
        NextResponse.json({
            voter: {
                full_name: data.full_name,
                constituency_name: data.constituencies?.name ?? null,
                voter_dob: data.voter_dob,
                registered_at: data.registered_at,
            },
            election,
        })
    )

    // A ballot session is only issued when there is a ballot to reach. Minting
    // a 30-minute voting token for someone registering a month before the poll
    // opens creates a credential that authorises nothing and simply sits in
    // the browser; the voter signs in when voting opens, as everyone else does.
    if (!election || isVotingOpen(election.status)) {
        setVoterCookie(response, await signVoterToken(data.id))
    }
    if (!existingDeviceId) setDeviceCookie(response, deviceId)
    return response
}
