import { createHmac } from 'node:crypto'

/**
 * "One device, one registration" — the anti-abuse layer on voter registration.
 *
 * Voter identity here is a phone number plus a date of birth. Neither is
 * secret, so the cheapest attack on the register is one operator with a stack
 * of SIM cards. The unique index on voters.voter_phone stops the same number
 * twice; this stops one device enrolling many numbers.
 *
 * ── How a device is recognised ───────────────────────────────────────────────
 *
 * Two independent signals, because neither is sufficient alone.
 *
 *   token        A random id minted server-side and kept in an httpOnly,
 *                Secure, SameSite=Lax cookie. Exact, collision-free, and
 *                invisible to page JavaScript, so it cannot be read or forged
 *                by script running on the page. This is the real rule, and it
 *                is hard-limited to one registration.
 *
 *   environment  A digest of the client IP and a coarsened user agent. Exists
 *                only because the cookie is defeated by clearing site data.
 *                A backstop — never treated as an identity.
 *
 * Both are stored only as HMAC-SHA256 digests keyed with a server-side pepper.
 * The raw IP and user agent are never written anywhere. Without the pepper the
 * digests cannot be reversed, nor brute-forced from a list of candidate IPs, so
 * a leak of the table reveals nothing about who registered from where.
 *
 * ── Why deliberate fingerprinting was rejected ───────────────────────────────
 *
 * Canvas, font, WebGL and audio fingerprinting would survive a cookie clear
 * more often. They were not used: they collect far more about a voter than an
 * electoral service has any business collecting, they are trivially defeated by
 * the privacy tooling that increasingly ships on by default, and the resulting
 * identifier is unstable across ordinary browser updates. Trading voter privacy
 * for an identifier that is *still* bypassable is a bad deal.
 *
 * ── The honest limitation ────────────────────────────────────────────────────
 *
 * There is no way on the open web to bind a registration to a physical device
 * such that a determined person cannot defeat it. Someone who clears cookies
 * AND changes network can register again. What this layer does is raise the
 * cost of bulk abuse from "click register repeatedly" to "clear state and move
 * network for every single registration", while the phone-uniqueness constraint
 * and per-phone rate limit continue to bound the damage. It is a speed bump on
 * a road that also has a gate, not a gate of its own.
 */

export const DEVICE_COOKIE = 'device_id'

/** Two years: longer than any single electoral cycle this platform runs. */
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 730

/**
 * The rule as stated: one browser profile, one registration.
 *
 * Exact and collision-free, so there is no reason to allow slack here.
 */
export const DEVICE_REGISTRATION_LIMIT = 1

/**
 * The backstop limit, deliberately NOT 1.
 *
 * Ghana's mobile networks put very large numbers of subscribers behind very few
 * carrier-grade NAT addresses — the same collapse that forced this codebase's
 * per-IP rate limits to be generous. An environment digest therefore collides
 * between unrelated people who share an address and happen to run the same
 * phone and browser version. Setting this to 1 would refuse real voters in
 * quantity on polling day.
 *
 * Wrongly refusing a voter is worse than admitting a duplicate that the phone
 * uniqueness constraint catches anyway, so this is tuned to absorb ordinary
 * sharing — a household phone, a crowded network — while a SIM farm still hits
 * a wall within a few attempts.
 *
 * If the Commission sees legitimate voters blocked, RAISE THIS FIRST. Setting
 * it to Infinity disables the backstop entirely and leaves the cookie layer
 * intact, which is the correct emergency response during polling.
 */
export const ENVIRONMENT_REGISTRATION_LIMIT = 3

/** The message the requirement specifies, shown when the cookie layer matches. */
export const DEVICE_ALREADY_USED = 'This device has already been used to register a voter.'

/**
 * Shown when only the fuzzy backstop matched. Worded differently on purpose:
 * this one can be a false positive on a shared network, so it must not accuse
 * the voter of anything and must offer a way through.
 */
export const ENVIRONMENT_ALREADY_USED =
    'We could not complete this registration from this connection. If you have not registered ' +
    'before, please contact the Electoral Commission.'

/**
 * The pepper for both digests.
 *
 * Derived from VOTER_JWT_SECRET rather than introduced as a new environment
 * variable. That is a deliberate operational choice: a missing secret in
 * production has already taken this platform's voter flows down once, and every
 * new required variable is another chance to repeat it. Domain separation via
 * the label means this value can never collide with a signing key.
 */
function pepper() {
    const base = process.env.VOTER_JWT_SECRET
    if (!base) return null
    return createHmac('sha256', base).update('device-registration-pepper-v1').digest()
}

function digest(value) {
    const key = pepper()
    if (!key || !value) return null
    return createHmac('sha256', key).update(value).digest('hex')
}

/**
 * Coarsens a user agent to the parts that identify a device *class* rather than
 * a build.
 *
 * Full user agents carry patch-level browser versions that change every few
 * weeks, which would silently release the restriction on the next auto-update.
 * Keeping only the platform token makes the signal stable, and — usefully for
 * privacy — deliberately *less* unique than the raw string.
 */
function coarseUserAgent(userAgent) {
    if (!userAgent) return 'unknown'
    const platform = /\(([^)]*)\)/.exec(userAgent)?.[1] ?? userAgent
    return platform
        .split(';')
        .map((part) => part.trim())
        // Drop anything carrying a version number.
        .filter((part) => part && !/\d+[._]\d+/.test(part))
        .slice(0, 3)
        .join('|')
        .toLowerCase()
}

/**
 * The digest of the device cookie, or null when the browser has none yet.
 *
 * Takes plain values rather than the request object so this module stays free
 * of `next/server`, and can therefore be unit tested — which matters more than
 * usual for a check that can refuse someone the vote.
 */
export function deviceTokenHash(deviceId) {
    return deviceId ? digest(`token:${deviceId}`) : null
}

/** The digest of the coarse network + client environment. */
export function environmentHash(ip, userAgent) {
    if (!ip || ip === 'unknown') return null
    return digest(`env:${ip}:${coarseUserAgent(userAgent)}`)
}

/** A fresh device id, minted server-side so the client never chooses its own. */
export function newDeviceId() {
    return crypto.randomUUID()
}

export function setDeviceCookie(response, deviceId) {
    response.cookies.set(DEVICE_COOKIE, deviceId, {
        // Never readable by page script: an XSS that could read this could
        // clone a device identity, and there is no reason for the browser to
        // need it.
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        // Lax rather than Strict: a voter arriving from a link in an SMS must
        // still present the cookie, or the restriction silently stops working.
        sameSite: 'lax',
        maxAge: DEVICE_COOKIE_MAX_AGE,
        path: '/',
    })
    return response
}

/**
 * Whether this device may complete a registration.
 *
 * Fails **open** on every error, which is the opposite of the rate limiter and
 * is deliberate. The rate limiter guards the door against brute force, so it
 * must refuse when it cannot do its job. This is an anti-abuse heuristic layered
 * behind a hard uniqueness constraint; if it breaks — the migration is not
 * applied, the secret is missing, the database hiccups — the correct behaviour
 * is to let people register, not to halt the franchise. A missing device
 * restriction is a lesser harm than a stopped election.
 *
 * @returns {Promise<{ allowed: boolean, message?: string }>}
 */
export async function checkDeviceEligibility(supabase, { deviceId, ip, userAgent }) {
    const tokenHash = deviceTokenHash(deviceId)
    const envHash = environmentHash(ip, userAgent)

    if (!tokenHash && !envHash) return { allowed: true }

    const { data, error } = await supabase.rpc('check_registration_device', {
        p_token_hash: tokenHash,
        p_environment_hash: envHash,
        p_token_limit: DEVICE_REGISTRATION_LIMIT,
        p_environment_limit: Number.isFinite(ENVIRONMENT_REGISTRATION_LIMIT)
            ? ENVIRONMENT_REGISTRATION_LIMIT
            : 2147483647,
    })

    if (error) {
        console.error('[device-registration] check failed, allowing registration', error)
        return { allowed: true }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row || row.allowed) return { allowed: true }

    return {
        allowed: false,
        message: row.reason === 'device' ? DEVICE_ALREADY_USED : ENVIRONMENT_ALREADY_USED,
    }
}

/**
 * Charges a completed registration to this device.
 *
 * Best effort: a failure here must never turn a registration the voter has
 * already completed into an error, so it is logged and swallowed.
 */
export async function recordDeviceRegistration(supabase, { deviceId, ip, userAgent }) {
    const tokenHash = deviceTokenHash(deviceId)
    const envHash = environmentHash(ip, userAgent)
    if (!tokenHash && !envHash) return

    const { error } = await supabase.rpc('record_registration_device', {
        p_token_hash: tokenHash,
        p_environment_hash: envHash,
    })

    if (error) console.error('[device-registration] could not record device', error)
}
