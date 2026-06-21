import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const hasUpstashConfig = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)

let redis = null

if (hasUpstashConfig) {
    redis = Redis.fromEnv()
} else {
    // Fail open in any environment without Upstash configured (e.g. local dev)
    // so the app keeps working, but make it loud — this must never be true
    // in production, since it means there is currently no real rate limiting.
    console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. ' +
        'Rate limiting is DISABLED and all requests are being allowed through. ' +
        'Do not deploy to production in this state.'
    )
}

// One Ratelimit instance per (name, limit, window) combination, created lazily
// and reused across requests/invocations.
const limiters = new Map()

function getLimiter(name, limit, window) {
    const key = `${name}:${limit}:${window}`
    if (!limiters.has(key)) {
        limiters.set(key, new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(limit, window),
            prefix: `ratelimit:${name}`,
        }))
    }
    return limiters.get(key)
}

export function getClientIp(request) {
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * @param {string} name - logical bucket name, e.g. 'vote', 'login'
 * @param {string} identifier - the key being limited (IP, voter id, phone, ...)
 * @param {{ limit: number, window: string }} config - e.g. { limit: 5, window: '1 h' }
 * @returns {Promise<{ allowed: boolean, retryAfterSeconds: number }>}
 */
export async function rateLimit(name, identifier, { limit, window }) {
    if (!redis) {
        return { allowed: true, retryAfterSeconds: 0 }
    }

    const limiter = getLimiter(name, limit, window)
    const { success, reset } = await limiter.limit(identifier)

    if (!success) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) }
    }

    return { allowed: true, retryAfterSeconds: 0 }
}

// Limits as specified for each endpoint. Sliding-window format is "<n> <unit>"
// where unit is one of ms | s | m | h | d (see @upstash/ratelimit docs).
export const RATE_LIMITS = {
    vote: { limit: 5, window: '1 h' },
    register: { limit: 3, window: '1 h' },
    login: { limit: 10, window: '1 h' },
    adminLogin: { limit: 5, window: '15 m' },
}
