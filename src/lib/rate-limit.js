import { createAdminClient } from '@/lib/supabase-admin'

/**
 * Rate limiting, backed by Postgres (migration 0013).
 *
 * This used to run on Upstash Redis. It was the only non-Supabase dependency in
 * the system, and it failed open: an unreachable Redis meant every request was
 * allowed, so disrupting Upstash disabled every brute-force protection at once.
 * Postgres is already required by all of these routes — there is no voter or
 * admin to authenticate against without it — so moving the counters there
 * removes an availability dependency instead of adding one.
 *
 * The window algorithm in check_rate_limit() is a deliberate reimplementation
 * of Upstash's approximated sliding window, so every limit below keeps the
 * meaning it was tuned for.
 *
 * Deliberately free of Sentry, unlike most of lib/. This module sits in front
 * of every rate-limited route, and @sentry/nextjs only resolves to a working
 * SDK inside a Next runtime — importing it here would make the module
 * unloadable by the plain-Node test suite, which is the only thing that can
 * prove the fail-closed paths below actually fail closed. The failures it
 * reports are all console.error plus a 503 the caller cannot miss.
 */

/**
 * "The function is not there" — i.e. migration 0013 has not been applied.
 *
 * Two codes, because the answer depends on who is asked. Supabase goes through
 * PostgREST, which reports a missing RPC from its own schema cache as PGRST202
 * and never surfaces the underlying SQLSTATE; a direct Postgres connection
 * raises 42883 (undefined_function). Only PGRST202 fires in this deployment —
 * 42883 is kept so the check still holds if this ever talks to Postgres
 * directly, which is a plausible next step for the hottest path in the app.
 */
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883'])

/** Roughly one request in a thousand also clears out expired counters. */
const PRUNE_PROBABILITY = 0.001

const WINDOW_UNITS = {
    ms: 1 / 1000,
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
}

/**
 * Converts the human-readable windows below ('15 m', '24 h') into seconds.
 *
 * The strings are kept rather than replaced with raw numbers because the whole
 * point of the table below is that a reviewer can check the policy at a glance,
 * and `{ limit: 8, window: '24 h' }` states the policy in a way that `86400`
 * does not.
 */
export function parseWindowSeconds(window) {
    const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)\s*$/.exec(String(window))
    if (!match) {
        throw new Error(`rate-limit: unrecognised window "${window}"`)
    }

    const seconds = Number(match[1]) * WINDOW_UNITS[match[2]]
    if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error(`rate-limit: window "${window}" is not a positive duration`)
    }

    return Math.round(seconds)
}

/**
 * @param {string} name - logical bucket, e.g. 'vote', 'login'
 * @param {string} identifier - the key being limited (IP, voter id, phone, ...)
 * @param {{ limit: number, window: string }} config - e.g. { limit: 5, window: '1 h' }
 * @param {{ client?: object }} [deps] - injection seam; tests supply a stub client
 * @returns {Promise<{ allowed: boolean, retryAfterSeconds: number, unavailable?: boolean }>}
 */
export async function rateLimit(name, identifier, { limit, window }, { client } = {}) {
    const supabase = client ?? createAdminClient()

    const { data, error } = await supabase.rpc('check_rate_limit', {
        p_bucket: name,
        p_identifier: String(identifier),
        p_limit: limit,
        p_window_seconds: parseWindowSeconds(window),
    })

    if (error) {
        // Migration 0013 has not been applied. In production that is a
        // deployment mistake with the same consequence as no limiter at all, so
        // it fails closed and surfaces on the first request of smoke testing.
        // In development it would only get in the way of someone who has not
        // run migrations yet, so it warns and continues.
        if (MISSING_FUNCTION_CODES.has(error.code)) {
            const message =
                '[rate-limit] check_rate_limit() is missing. Apply migration ' +
                '0013_add_rate_limit_counters.up.sql.'

            if (process.env.NODE_ENV === 'production') {
                console.error(`${message} Refusing the request rather than running unprotected.`)
                return { allowed: false, retryAfterSeconds: 30, unavailable: true }
            }

            console.warn(`${message} Allowing the request (development only).`)
            return { allowed: true, retryAfterSeconds: 0 }
        }

        // Any other failure means Postgres itself is not answering. Refuse:
        // the route's very next statement is a query against the same database,
        // so allowing the request only trades a clear 503 for an opaque 500,
        // and refusing keeps the guarantee that nothing unmetered gets through.
        console.error('[rate-limit] check_rate_limit failed', error)
        return { allowed: false, retryAfterSeconds: 5, unavailable: true }
    }

    // Postgres returns a one-row table.
    const row = Array.isArray(data) ? data[0] : data

    if (!row) {
        console.error('[rate-limit] check_rate_limit returned no row')
        return { allowed: false, retryAfterSeconds: 5, unavailable: true }
    }

    if (Math.random() < PRUNE_PROBABILITY) {
        // Housekeeping must never decide whether a voter gets in, so this is
        // fire-and-forget and its failure is swallowed.
        supabase.rpc('prune_rate_limit_counters').then(
            () => {},
            () => {}
        )
    }

    return {
        allowed: row.allowed === true,
        retryAfterSeconds: row.allowed === true ? 0 : Math.max(1, row.retry_after_seconds ?? 1),
    }
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
