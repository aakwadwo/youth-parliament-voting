import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const hasUpstashConfig = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)

let redis = null

if (hasUpstashConfig) {
    redis = Redis.fromEnv()
} else {
    console.warn(
        '[rate-limit] Upstash is not configured. Rate limiting is unavailable. ' +
            'This is acceptable in development only.'
    )
}

// One Ratelimit instance per (name, limit, window) combination, created lazily
// and reused across requests/invocations.
const limiters = new Map()

function getLimiter(name, limit, window) {
    const key = `${name}:${limit}:${window}`
    if (!limiters.has(key)) {
        limiters.set(
            key,
            new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(limit, window),
                prefix: `ratelimit:${name}`,
                analytics: false,
            })
        )
    }
    return limiters.get(key)
}

/**
 * @param {string} name - logical bucket, e.g. 'vote', 'login'
 * @param {string} identifier - the key being limited (IP, voter id, phone, ...)
 * @param {{ limit: number, window: string }} config - e.g. { limit: 5, window: '1 h' }
 * @returns {Promise<{ allowed: boolean, retryAfterSeconds: number }>}
 */
export async function rateLimit(name, identifier, { limit, window }) {
    if (!redis) {
        // Two very different situations, handled differently on purpose.
        //
        // Missing configuration in production is a deployment mistake: the
        // election would be running with no brute-force protection at all on
        // voter login. That fails closed, so it surfaces on the first request
        // of smoke testing rather than during polling. (The check lives here
        // rather than at module scope because module scope also runs during
        // `next build`, where these variables legitimately do not exist.)
        if (process.env.NODE_ENV === 'production') {
            console.error(
                '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. ' +
                    'Refusing the request rather than running an election unprotected.'
            )
            return { allowed: false, retryAfterSeconds: 30, misconfigured: true }
        }
        return { allowed: true, retryAfterSeconds: 0 }
    }

    const limiter = getLimiter(name, limit, window)

    let success, reset
    try {
        ;({ success, reset } = await limiter.limit(identifier))
    } catch (error) {
        // A configured Redis that is briefly unreachable is a transient
        // dependency outage, not a deployment error, and must not take a live
        // election offline. Allow the request, but make the outage visible.
        console.error('[rate-limit] limiter unavailable, allowing request', error)
        return { allowed: true, retryAfterSeconds: 0, degraded: true }
    }

    if (!success) {
        return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
        }
    }

    return { allowed: true, retryAfterSeconds: 0 }
}

/**
 * Limits are deliberately split across two dimensions.
 *
 * IP limits in Ghana have to be generous. The mobile networks most voters will
 * use put very large numbers of subscribers behind a handful of carrier-grade
 * NAT addresses, so a tight per-IP cap locks out a whole town rather than an
 * attacker. The previous values — 3 registrations and 10 logins per IP per
 * hour — would have done exactly that on polling day.
 *
 * The tight limits therefore live on the identity dimension: the phone number
 * being registered or signed into. That is what an attacker actually has to
 * iterate over, and it is not collapsed by NAT.
 */
export const RATE_LIMITS = {
    // Keyed by authenticated voter id, so NAT is irrelevant: a voter has one
    // ballot and only needs a retry or two if the network drops.
    vote: { limit: 5, window: '1 h' },

    registerIp: { limit: 40, window: '1 h' },
    registerPhone: { limit: 4, window: '24 h' },

    loginIp: { limit: 60, window: '1 h' },
    // Date of birth is low entropy, so this is the limit that matters: it caps
    // an attacker at 8 guesses per day against any single phone number.
    loginPhone: { limit: 8, window: '24 h' },

    adminLoginIp: { limit: 20, window: '15 m' },
    adminLoginAccount: { limit: 6, window: '15 m' },

    // Report rendering is expensive; one admin should not be able to queue
    // dozens of PDF builds at once.
    export: { limit: 20, window: '5 m' },
}
