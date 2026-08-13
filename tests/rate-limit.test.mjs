import test from 'node:test'
import assert from 'node:assert/strict'

import { rateLimit, parseWindowSeconds, RATE_LIMITS } from '@/lib/rate-limit'

/** A stand-in for the service-role client, recording what the RPC was called with. */
function fakeSupabase(response, { onCall } = {}) {
    const calls = []
    return {
        calls,
        rpc: async (name, args) => {
            calls.push({ name, args })
            onCall?.(name, args)
            if (name === 'prune_rate_limit_counters') return { data: 0, error: null }
            return response
        },
    }
}

const allowed = { data: [{ allowed: true, retry_after_seconds: 0 }], error: null }
const denied = { data: [{ allowed: false, retry_after_seconds: 42 }], error: null }

test('window strings parse to the seconds the limits were tuned for', () => {
    assert.equal(parseWindowSeconds('5 m'), 300)
    assert.equal(parseWindowSeconds('15 m'), 900)
    assert.equal(parseWindowSeconds('1 h'), 3600)
    assert.equal(parseWindowSeconds('24 h'), 86400)
    // Tolerant of spacing, and supports the units the config might grow into.
    assert.equal(parseWindowSeconds('30s'), 30)
    assert.equal(parseWindowSeconds('  2  d  '), 172800)
})

test('an unparseable window throws rather than silently disabling a limit', () => {
    // The dangerous failure mode is a typo that quietly becomes "no limit".
    for (const bad of ['', 'h', '1 week', 'soon', '0 m', '-5 m', null, undefined]) {
        assert.throws(() => parseWindowSeconds(bad), /rate-limit/)
    }
})

test('every configured limit is parseable and positive', () => {
    for (const [name, config] of Object.entries(RATE_LIMITS)) {
        assert.ok(config.limit > 0, `${name} has a non-positive limit`)
        assert.ok(Number.isInteger(config.limit), `${name} limit is not an integer`)
        assert.ok(parseWindowSeconds(config.window) > 0, `${name} has an unusable window`)
    }
})

test('the brute-force limits that matter have not been loosened', () => {
    // These are the two that stand between a known phone number and a
    // low-entropy date of birth, and between an admin account and a password
    // guess. A change here should have to be deliberate.
    assert.deepEqual(RATE_LIMITS.loginPhone, { limit: 8, window: '24 h' })
    assert.deepEqual(RATE_LIMITS.adminLoginAccount, { limit: 6, window: '15 m' })
})

test('the per-IP sign-in limit has carrier-NAT headroom', () => {
    // Pinned at the value chosen for polling day. Raised from 60 on 2026-08-13.
    //
    // Ghana's mobile networks put very large numbers of subscribers behind very
    // few addresses. Measured on live production during the registration drive,
    // the busiest single address reached 55 requests in one hour while the
    // whole platform was serving only ~200/hour, and carried a median 10.4% of
    // all platform volume in its hour. Sign-in concentrates far harder than
    // registration, because registration spreads over weeks and every voter
    // signs in on one day: a 25% first-hour spike across 20,000 voters puts the
    // busiest address near 520 sign-ins in that hour on the median share. At 60
    // that refused the overwhelming majority of the voters behind it.
    assert.deepEqual(RATE_LIMITS.loginIp, { limit: 2000, window: '1 h' })
})

test('the IP dimension is looser than the identity dimension it backs', () => {
    // The property rather than the numbers, stated once so that a future edit
    // which tightens an IP limit towards its identity limit fails here.
    //
    // An address is shared by strangers; a phone number is one person. Refusing
    // on the shared dimension takes the vote away from people who have done
    // nothing, so the tight caps live on the identity dimension and the IP caps
    // exist only to bound a script on a fixed address.
    assert.ok(
        RATE_LIMITS.loginIp.limit > RATE_LIMITS.loginPhone.limit * 100,
        'the per-IP sign-in cap must leave room for a whole NAT address of voters'
    )
    assert.ok(
        RATE_LIMITS.registerIp.limit > RATE_LIMITS.registerPhone.limit * 10,
        'the per-IP registration cap must leave room for a shared address'
    )
})

test('the sign-in limits clear a realistic polling-day peak', () => {
    // The projection this change was made from, as an assertion. If either
    // figure moves, this states plainly what it has to survive.
    const ELECTORATE = 20_000
    const FIRST_HOUR_SHARE = 0.25
    // Measured share of platform volume carried by the single busiest address.
    const BUSIEST_ADDRESS_SHARE = 0.104

    const peakHourSignIns = ELECTORATE * FIRST_HOUR_SHARE
    const onBusiestAddress = peakHourSignIns * BUSIEST_ADDRESS_SHARE

    assert.ok(
        RATE_LIMITS.loginIp.limit >= onBusiestAddress,
        `the busiest address expects ~${Math.round(onBusiestAddress)} sign-ins in the peak hour, ` +
            `but the limit is ${RATE_LIMITS.loginIp.limit}`
    )

    // And the per-phone cap must still let one voter sign in, fail a couple of
    // times, and come back after a session expiry — without ever being loose
    // enough to matter for guessing a date of birth.
    assert.ok(RATE_LIMITS.loginPhone.limit >= 4, 'a voter needs room for a retry')
    assert.ok(RATE_LIMITS.loginPhone.limit <= 10, 'the per-phone cap is the brute-force control')
})

test('an allowed request passes the tuned limit and window through to Postgres', async () => {
    const client = fakeSupabase(allowed)
    const result = await rateLimit('loginPhone', '+233241234567', RATE_LIMITS.loginPhone, {
        client,
    })

    assert.deepEqual(result, { allowed: true, retryAfterSeconds: 0 })
    assert.deepEqual(client.calls[0], {
        name: 'check_rate_limit',
        args: {
            p_bucket: 'loginPhone',
            p_identifier: '+233241234567',
            p_limit: 8,
            p_window_seconds: 86400,
        },
    })
})

test('a refused request reports how long until the window rolls over', async () => {
    const result = await rateLimit('vote', 'voter-1', RATE_LIMITS.vote, {
        client: fakeSupabase(denied),
    })

    assert.equal(result.allowed, false)
    assert.equal(result.retryAfterSeconds, 42)
    assert.ok(!result.unavailable, 'a genuine refusal must not be reported as an outage')
})

test('a non-string identifier is coerced, not passed through as an object', async () => {
    const client = fakeSupabase(allowed)
    await rateLimit('vote', 12345, RATE_LIMITS.vote, { client })
    assert.equal(client.calls[0].args.p_identifier, '12345')
})

test('a missing check_rate_limit function fails closed in production', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
        const result = await rateLimit('adminLoginIp', '1.2.3.4', RATE_LIMITS.adminLoginIp, {
            // PGRST202 is what Supabase actually returns; 42883 is the raw
            // Postgres equivalent. Both must be recognised.
            client: fakeSupabase({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
        })

        // Refusing is the whole point: an unapplied migration must not silently
        // run an election with no brute-force protection.
        assert.equal(result.allowed, false)
        assert.equal(result.unavailable, true, 'must be distinguishable from real throttling')
    } finally {
        process.env.NODE_ENV = previous
    }
})

test('the raw Postgres undefined_function code is recognised too', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
        const result = await rateLimit('adminLoginIp', '1.2.3.4', RATE_LIMITS.adminLoginIp, {
            client: fakeSupabase({ data: null, error: { code: '42883', message: 'no function' } }),
        })
        assert.equal(result.allowed, false)
        assert.equal(result.unavailable, true)
    } finally {
        process.env.NODE_ENV = previous
    }
})

test('a missing check_rate_limit function allows the request in development', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
        const result = await rateLimit('adminLoginIp', '1.2.3.4', RATE_LIMITS.adminLoginIp, {
            // PGRST202 is what Supabase actually returns; 42883 is the raw
            // Postgres equivalent. Both must be recognised.
            client: fakeSupabase({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
        })
        assert.equal(result.allowed, true)
    } finally {
        process.env.NODE_ENV = previous
    }
})

test('an unreachable database fails closed, and is not reported as throttling', async () => {
    // The old Redis limiter failed *open* here, which meant anyone who could
    // disrupt it switched off every brute-force protection in the app.
    const result = await rateLimit('loginPhone', '+233241234567', RATE_LIMITS.loginPhone, {
        client: fakeSupabase({ data: null, error: { code: '08006', message: 'connection failed' } }),
    })

    assert.equal(result.allowed, false)
    assert.equal(result.unavailable, true)
    assert.ok(result.retryAfterSeconds >= 1)
})

test('an empty result set fails closed rather than defaulting to allowed', async () => {
    const result = await rateLimit('vote', 'voter-1', RATE_LIMITS.vote, {
        client: fakeSupabase({ data: [], error: null }),
    })

    assert.equal(result.allowed, false)
    assert.equal(result.unavailable, true)
})

test('a single-object result is accepted as well as a one-row table', async () => {
    const result = await rateLimit('vote', 'voter-1', RATE_LIMITS.vote, {
        client: fakeSupabase({ data: { allowed: true, retry_after_seconds: 0 }, error: null }),
    })
    assert.equal(result.allowed, true)
})

test('a refusal always carries a usable Retry-After, even if Postgres reports zero', async () => {
    const result = await rateLimit('vote', 'voter-1', RATE_LIMITS.vote, {
        client: fakeSupabase({
            data: [{ allowed: false, retry_after_seconds: 0 }],
            error: null,
        }),
    })

    // Retry-After: 0 invites an immediate retry loop.
    assert.ok(result.retryAfterSeconds >= 1)
})
