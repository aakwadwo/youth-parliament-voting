import { createHmac } from 'node:crypto'

/**
 * Registration abuse controls, applied over rolling time windows.
 *
 * ── What this is, and what it is emphatically not ────────────────────────────
 *
 * This module throttles how many voters may be REGISTERED from one device in a
 * given period. It has nothing to do with voting. No function here is called by
 * the login route, the ballot page or the vote route, and the digests below are
 * never associated with a voter row, so nothing in this file can decide whether
 * a ballot is accepted. The one-person-one-vote rule is enforced entirely by
 * `voters.has_voted` inside the cast_vote() transaction, and a voter may sign in
 * and vote from any device, including one they never registered on.
 *
 * ── Why this is windowed and not a lifetime cap ──────────────────────────────
 *
 * The previous design allowed one registration per browser profile, ever, with
 * a lifetime backstop of three per address and device class. Both refused real
 * voters. Many Ghanaians eligible for this election do not own a smartphone and
 * will register from a friend's phone, a family phone, a school computer or a
 * cybercafé; a lifetime cap of one turns the second such voter away outright.
 * And because nothing decayed, capacity spent during a registration drive in
 * one month was still gone on polling day in the next.
 *
 * The controls now count registrations inside a moving window, so capacity is
 * returned automatically as events age out. A shared device serves a queue of
 * voters; a script trying to manufacture identities in bulk still hits a wall.
 *
 * ── How a device is recognised ───────────────────────────────────────────────
 *
 * Two independent signals, because neither is sufficient alone.
 *
 *   token        A random id minted server-side and kept in an httpOnly,
 *                Secure, SameSite=Lax cookie. Exact and collision-free: it
 *                identifies one browser profile and nothing else, and page
 *                JavaScript cannot read or forge it. This is the real control.
 *
 *   environment  A digest of the client address and a coarsened user agent.
 *                Exists only because the cookie is defeated by clearing site
 *                data or opening a private window. It collides between
 *                unrelated people behind carrier-grade NAT, so it is given
 *                several times the token layer's headroom and is treated as a
 *                backstop, never as an identity.
 *
 * Both are stored only as HMAC-SHA256 digests keyed with a server-side pepper.
 * The raw address and user agent are never written anywhere, and the digest is
 * never sent to the client.
 *
 * ── Why deliberate fingerprinting was rejected ───────────────────────────────
 *
 * Canvas, font, WebGL and audio fingerprinting would survive a cookie clear more
 * often. They collect far more about a voter than an electoral service has any
 * business collecting, they are defeated by privacy tooling that increasingly
 * ships on by default, and the resulting identifier is unstable across ordinary
 * browser updates. Trading voter privacy for an identifier that is *still*
 * bypassable is a bad deal.
 *
 * ── The honest limitation ────────────────────────────────────────────────────
 *
 * There is no way on the open web to bind a registration to a physical device
 * such that a determined person cannot defeat it. Someone who clears cookies
 * and changes network can register again. What this layer does is raise the cost
 * of bulk abuse while the phone-uniqueness constraint and the per-phone rate
 * limit continue to bound the damage. It is a speed bump on a road that also has
 * a gate, and it is not evidence about any individual registration: hitting a
 * limit means a threshold was crossed, never that a voter did anything wrong.
 */

export const DEVICE_COOKIE = 'device_id'

/** Two years: longer than any single electoral cycle this platform runs. */
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 730

/**
 * The policy, in one place.
 *
 * Two windows rather than one, and they do very different amounts of work.
 *
 * The BURST window is the control that matters. Filling in a name, a date of
 * birth, a phone number and a constituency takes a person a minute or two and
 * takes a script a second, so a short window separates the two cleanly: it is
 * invisible to everyone registering by hand and expensive for anything
 * automated. This is where the anti-abuse value lives.
 *
 * The DAILY figures are sanity ceilings, not the policy. They were originally
 * set low enough to be the binding constraint, and that was a mistake: a daily
 * cap cannot tell a registration desk apart from a bot — it only counts — so it
 * fell hardest on shared laptops and campus Wi-Fi while barely inconveniencing
 * an attacker, who can simply wait or move network. They are now set well above
 * any realistic legitimate volume, purely to bound an unattended script left
 * running overnight.
 *
 * The honest reason they are not tighter: measured against a scripted attacker
 * who changes network whenever refused, tightening these limits by a factor of
 * eight altered the number of fake registrations achieved by roughly a tenth,
 * while cutting the number of real voters who could register at one location
 * from five hundred to one hundred. That trade is not worth making.
 *
 * ── Why the device figures were raised (2026-08-13) ─────────────────────────
 *
 * The first values shipped were 5 per ten minutes and 100 per day. Production
 * measurement during the live registration drive showed both were binding on
 * real voters, not on abuse:
 *
 *   * Across 4,155 registrations in 24 hours, the peak ten-minute count for 81
 *     separate device tokens was exactly 5, and NOT ONE device exceeded it. A
 *     distribution that stops dead on the limit with zero overshoot is the
 *     signature of a constraint that is binding, not of natural behaviour.
 *     Those 81 devices are registration desks, school computers and shared
 *     phones — the exact population this module documents itself as protecting.
 *
 *   * One device had reached exactly 100 registrations in 24 hours and was
 *     refused outright; eleven more were past 50 and climbing.
 *
 * A refusal writes no row, so the number of voters actually turned away is not
 * recoverable from the database — only the clamp is visible. 20 per ten minutes
 * is still a rate no hand-filled form reaches (it allows one registration every
 * 30 seconds, sustained), and 300 a day still bounds an unattended script,
 * while leaving a busy desk room to work.
 *
 * The environment figures are deliberately UNCHANGED. They were measured over
 * the same 24 hours and were nowhere near binding: the busiest environment
 * digest peaked at 9 registrations in a ten-minute window against a limit of
 * 40, and at 79 in a day against a limit of 1000. They are also the limits that
 * can refuse a stranger who merely shares a carrier-NAT address, so they are not
 * touched without evidence that they are the thing refusing anyone.
 *
 * WATCH THIS: raising the device burst to 20 leaves the environment burst only
 * twice as loose, rather than the eight-fold headroom it had before. The
 * observed environment peaks were themselves held down by the device limit
 * upstream of them, so they will rise now. If refusals with reason
 * `environment_burst` start appearing in the logs, that is this interaction,
 * and the remedy is the one stated above — raise the environment limits first.
 *
 * The environment limits are deliberately several times the device limits and
 * must stay that way. That digest collides between unrelated people who share a
 * carrier-grade NAT address and happen to run the same class of phone — the same
 * collapse that forced this codebase's per-IP rate limits to be generous. Tuning
 * it as tightly as the token layer would refuse real voters in quantity on
 * polling day.
 *
 * If the Commission sees legitimate voters refused during polling, RAISE THE
 * ENVIRONMENT LIMITS FIRST; they are the ones that can be tripped by strangers.
 * Setting them to Infinity disables the backstop entirely and leaves the token
 * layer intact, which is the correct emergency response mid-poll.
 *
 * These numbers are an internal security control. They are not stated anywhere
 * in voter-facing copy, and the refusal messages below deliberately describe
 * them only in vague terms.
 */
export const REGISTRATION_DEVICE_LIMITS = {
    burst: { seconds: 10 * 60, device: 20, environment: 40 },
    daily: { seconds: 24 * 60 * 60, device: 300, environment: 1000 },
}

/**
 * Shown when the device's own allowance is exhausted.
 *
 * States no threshold and no duration. "Recently" and "shortly" are as specific
 * as this gets, on purpose: publishing the exact window would tell someone
 * building identities exactly how long to sleep between attempts, and stating a
 * figure invites a voter to treat the control as a quota rather than a
 * backstop.
 *
 * It also must not accuse anyone. A shared phone reaching this limit is a phone
 * doing its job, so the message offers a way forward instead of a verdict.
 */
export const DEVICE_LIMIT_REACHED =
    'Several voter registrations have already been completed on this device recently. ' +
    'Please try again shortly, or contact the Electoral Commission if you need help registering.'

/**
 * Shown when only the fuzzy backstop matched.
 *
 * Worded differently on purpose: this one can be a false positive for someone
 * who has done nothing at all except share a network with strangers, so it must
 * not refer to "this device" or imply the voter has registered before.
 */
export const ENVIRONMENT_LIMIT_REACHED =
    'We could not complete this registration from this connection right now. Please try again ' +
    'later, or contact the Electoral Commission if you have not registered before.'

/** Which message a refusal reason maps to. Unknown reasons take the softer one. */
const REFUSAL_MESSAGES = {
    device_burst: DEVICE_LIMIT_REACHED,
    device_daily: DEVICE_LIMIT_REACHED,
    environment_burst: ENVIRONMENT_LIMIT_REACHED,
    environment_daily: ENVIRONMENT_LIMIT_REACHED,
}

/** Roughly one registration in fifty also clears out expired events. */
const PRUNE_PROBABILITY = 0.02

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
 * Whether this device may complete another registration right now.
 *
 * Fails **open** on every error, which is the opposite of the rate limiter and
 * is deliberate. The rate limiter guards the door against brute force, so it
 * must refuse when it cannot do its job. This is an anti-abuse heuristic layered
 * behind a hard uniqueness constraint; if it breaks — the migration is not
 * applied, the secret is missing, the database hiccups — the correct behaviour
 * is to let people register, not to halt the franchise. A missing device
 * restriction is a lesser harm than a stopped election.
 *
 * `retryAfterSeconds` is returned for server-side logging only. The route does
 * not put it on the response: an exact countdown would publish the width of the
 * window to anyone willing to read a header.
 *
 * @returns {Promise<{ allowed: boolean, message?: string, reason?: string, retryAfterSeconds?: number }>}
 */
export async function checkDeviceEligibility(supabase, { deviceId, ip, userAgent }) {
    const tokenHash = deviceTokenHash(deviceId)
    const envHash = environmentHash(ip, userAgent)

    if (!tokenHash && !envHash) return { allowed: true }

    const { burst, daily } = REGISTRATION_DEVICE_LIMITS

    const { data, error } = await supabase.rpc('check_registration_device', {
        p_token_hash: tokenHash,
        p_environment_hash: envHash,
        p_burst_seconds: burst.seconds,
        p_token_burst_limit: burst.device,
        p_environment_burst_limit: asLimit(burst.environment),
        p_daily_seconds: daily.seconds,
        p_token_daily_limit: daily.device,
        p_environment_daily_limit: asLimit(daily.environment),
    })

    if (error) {
        console.error('[device-registration] check failed, allowing registration', error)
        return { allowed: true }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row || row.allowed) return { allowed: true }

    return {
        allowed: false,
        reason: row.reason,
        retryAfterSeconds: row.retry_after_seconds ?? null,
        message: REFUSAL_MESSAGES[row.reason] ?? ENVIRONMENT_LIMIT_REACHED,
    }
}

/**
 * Postgres has no infinity for an integer parameter, so a disabled limit is
 * sent as the largest one it will accept. Anything finite passes through
 * unchanged.
 */
function asLimit(value) {
    return Number.isFinite(value) ? value : 2147483647
}

/**
 * Records a completed registration against this device's digests.
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

    // Housekeeping must never decide whether a voter gets registered, so this is
    // fire-and-forget and its failure is swallowed. Rows outlive the longest
    // window by a wide margin before they are removed, so pruning can never
    // return capacity early.
    if (Math.random() < PRUNE_PROBABILITY) {
        supabase.rpc('prune_registration_events').then(
            () => {},
            () => {}
        )
    }
}
