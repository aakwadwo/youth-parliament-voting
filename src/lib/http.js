import { NextResponse } from 'next/server'

import { jsonError, ERROR_CODES } from '@/lib/api-error'

/**
 * The client's IP address, for rate limiting.
 *
 * `x-forwarded-for` is a client-writable header. Taking its first entry
 * unconditionally — as the previous implementation did — lets anyone defeat
 * every IP rate limit in the app by sending `X-Forwarded-For: <random>` on
 * each request, which matters most on exactly the endpoints that are rate
 * limited: registration, login and admin sign-in.
 *
 * Platform-set headers are therefore preferred, because the edge overwrites
 * them and a client cannot forge them. Only if none is present do we fall back
 * to `x-forwarded-for`, and then we take the *right-most* entry, which is the
 * one appended by the nearest trusted proxy rather than whatever the client
 * prepended.
 *
 * If you deploy behind a proxy that is not Vercel, add its trusted header here.
 */
export function getClientIp(request) {
    const trusted =
        request.headers.get('x-vercel-forwarded-for') ??
        request.headers.get('cf-connecting-ip') ??
        request.headers.get('x-real-ip')

    if (trusted) return trusted.trim()

    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
        const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean)
        if (hops.length > 0) return hops[hops.length - 1]
    }

    return 'unknown'
}

/**
 * Rejects state-changing requests whose Origin is not this site.
 *
 * The session cookies are already SameSite=Lax, which stops a browser sending
 * them on a cross-site POST, so this is defence in depth rather than the only
 * line of CSRF protection. It is worth having because `request.json()` does
 * not check Content-Type: a cross-site form posting `text/plain` still parses
 * as JSON here, so Lax is doing all the work on its own otherwise.
 *
 * Returns a 403 response to return, or null when the request may proceed.
 */
export function requireSameOrigin(request) {
    const origin = request.headers.get('origin')

    // Same-origin fetch() from our own pages always sends Origin. A missing
    // Origin means a non-browser client (curl, a health check, a native app),
    // which carries no ambient cookie authority and so cannot be a CSRF
    // vector; the request still has to present a valid session cookie.
    if (!origin) return null

    let originHost
    try {
        originHost = new URL(origin).host
    } catch {
        return jsonError('Invalid origin', 403, ERROR_CODES.FORBIDDEN)
    }

    const expected = request.headers.get('x-forwarded-host') ?? request.headers.get('host')

    if (!expected || originHost !== expected) {
        return jsonError('Cross-origin request rejected', 403, ERROR_CODES.FORBIDDEN)
    }

    return null
}

/**
 * Marks a response as never cacheable.
 *
 * Everything under /api/admin returns election data, voter counts or audit
 * entries. None of it may be held by a CDN, a corporate proxy or the browser's
 * back/forward cache, where it could be served to the next person on a shared
 * machine.
 */
export function noStore(response) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    response.headers.set('Pragma', 'no-cache')
    return response
}

export function jsonNoStore(body, init) {
    return noStore(NextResponse.json(body, init))
}

/**
 * Turns a refused rate-limit check into a response.
 *
 * A refusal has two causes that must not be reported the same way.
 *
 * Genuine throttling is the caller's doing: they really have made too many
 * attempts, and 429 with "try again later" is exactly right.
 *
 * A limiter that could not be evaluated at all — migration 0013 not applied, or
 * Postgres not answering — is the *operator's* doing. rateLimit() fails closed
 * there on purpose, because an election must not run with no brute-force
 * protection on voter login, but the caller has made no attempts at all, so
 * telling them they have made too many is simply false. It cost real diagnostic
 * time: an administrator who could not sign in was told "Too many attempts",
 * which reads as "your password is fine, wait a while", when the truth was that
 * the limiter was unreachable and the password was never checked. 503 says
 * "this service is not working", which is what has actually happened, and
 * Retry-After stops a client hammering a broken box.
 *
 * The request is refused either way. This changes only what the caller is told.
 */
export function rateLimitRefusal(limit, throttledMessage) {
    if (limit.unavailable) {
        const response = jsonError(
            'This service is temporarily unavailable. Please try again shortly.',
            503,
            ERROR_CODES.UNAVAILABLE
        )
        response.headers.set('Retry-After', String(limit.retryAfterSeconds ?? 30))
        return noStore(response)
    }

    const response = jsonError(throttledMessage, 429, ERROR_CODES.RATE_LIMITED)
    if (limit.retryAfterSeconds) {
        response.headers.set('Retry-After', String(limit.retryAfterSeconds))
    }
    return noStore(response)
}
