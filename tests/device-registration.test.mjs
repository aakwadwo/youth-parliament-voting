import test from 'node:test'
import assert from 'node:assert/strict'

process.env.VOTER_JWT_SECRET ??= 'test-secret-for-device-registration-only'

const {
    deviceTokenHash,
    environmentHash,
    newDeviceId,
    checkDeviceEligibility,
    DEVICE_ALREADY_USED,
    ENVIRONMENT_ALREADY_USED,
    DEVICE_REGISTRATION_LIMIT,
} = await import('@/lib/device-registration')

function fakeSupabase(response) {
    const calls = []
    return {
        calls,
        rpc: async (name, args) => {
            calls.push({ name, args })
            return response
        },
    }
}

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36'
const CHROME_ANDROID_NEWER = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 Chrome/131.0.6778.81 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'

test('a device digest is stable and never the raw identifier', () => {
    const id = 'b3f1e0c2-0000-4000-8000-000000000001'
    const a = deviceTokenHash(id)
    assert.equal(a, deviceTokenHash(id), 'must be deterministic')
    assert.match(a, /^[0-9a-f]{64}$/, 'must be a SHA-256 hex digest')
    assert.ok(!a.includes(id), 'must not embed the identifier')
})

test('different devices produce different digests', () => {
    assert.notEqual(deviceTokenHash('device-a'), deviceTokenHash('device-b'))
})

test('the digest is keyed, so it cannot be recomputed without the server secret', async () => {
    const withOriginalSecret = deviceTokenHash('device-a')

    const previous = process.env.VOTER_JWT_SECRET
    process.env.VOTER_JWT_SECRET = 'a-completely-different-server-secret'
    try {
        // Same input, different pepper -> different digest. An attacker holding
        // a dump of the table cannot confirm a guess without the secret.
        assert.notEqual(deviceTokenHash('device-a'), withOriginalSecret)
    } finally {
        process.env.VOTER_JWT_SECRET = previous
    }
})

test('no device cookie yields no token digest', () => {
    assert.equal(deviceTokenHash(undefined), null)
    assert.equal(deviceTokenHash(''), null)
})

test('the environment digest survives a browser version bump', () => {
    // A patch-level Chrome update must not silently release the restriction.
    assert.equal(
        environmentHash('41.66.1.1', CHROME_ANDROID),
        environmentHash('41.66.1.1', CHROME_ANDROID_NEWER)
    )
})

test('the environment digest separates different devices and different networks', () => {
    assert.notEqual(
        environmentHash('41.66.1.1', CHROME_ANDROID),
        environmentHash('41.66.1.1', IPHONE)
    )
    assert.notEqual(
        environmentHash('41.66.1.1', CHROME_ANDROID),
        environmentHash('41.66.1.2', CHROME_ANDROID)
    )
})

test('an unknown IP produces no environment digest rather than a shared one', () => {
    // getClientIp() returns 'unknown' when no trusted header is present. Hashing
    // that would put every such request in one bucket and lock them out of each
    // other's allowance.
    assert.equal(environmentHash('unknown', CHROME_ANDROID), null)
    assert.equal(environmentHash(null, CHROME_ANDROID), null)
})

test('device ids are unique and server-minted', () => {
    const ids = new Set(Array.from({ length: 200 }, newDeviceId))
    assert.equal(ids.size, 200)
})

test('the stated rule is one registration per device', () => {
    assert.equal(DEVICE_REGISTRATION_LIMIT, 1)
})

test('a fresh device is allowed, and the tuned limits reach Postgres', async () => {
    const client = fakeSupabase({ data: [{ allowed: true, reason: 'ok' }], error: null })
    const result = await checkDeviceEligibility(client, {
        deviceId: 'device-a',
        ip: '41.66.1.1',
        userAgent: CHROME_ANDROID,
    })

    assert.deepEqual(result, { allowed: true })
    const args = client.calls[0].args
    assert.equal(args.p_token_limit, 1)
    assert.ok(args.p_environment_limit >= 1)
    assert.match(args.p_token_hash, /^[0-9a-f]{64}$/)
    assert.match(args.p_environment_hash, /^[0-9a-f]{64}$/)
})

test('a device that already registered gets exactly the specified message', async () => {
    const result = await checkDeviceEligibility(
        fakeSupabase({ data: [{ allowed: false, reason: 'device' }], error: null }),
        { deviceId: 'device-a', ip: '41.66.1.1', userAgent: CHROME_ANDROID }
    )

    assert.equal(result.allowed, false)
    assert.equal(result.message, 'This device has already been used to register a voter.')
    assert.equal(result.message, DEVICE_ALREADY_USED)
})

test('the fuzzy backstop uses softer wording and offers a way through', async () => {
    const result = await checkDeviceEligibility(
        fakeSupabase({ data: [{ allowed: false, reason: 'environment' }], error: null }),
        { deviceId: undefined, ip: '41.66.1.1', userAgent: CHROME_ANDROID }
    )

    assert.equal(result.allowed, false)
    assert.equal(result.message, ENVIRONMENT_ALREADY_USED)
    // A shared carrier-NAT address can trip this without any wrongdoing, so the
    // message must not tell the voter they have already registered.
    assert.ok(!result.message.includes('already been used'))
    assert.match(result.message, /Electoral Commission/)
})

test('a missing migration 0014 FAILS OPEN — registration must not stop', async () => {
    // The opposite of the rate limiter on purpose: this is an anti-abuse
    // heuristic behind a hard uniqueness constraint, so a broken check must
    // never stand between a citizen and the franchise.
    const result = await checkDeviceEligibility(
        fakeSupabase({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
        { deviceId: 'device-a', ip: '41.66.1.1', userAgent: CHROME_ANDROID }
    )
    assert.deepEqual(result, { allowed: true })
})

test('a database outage FAILS OPEN', async () => {
    const result = await checkDeviceEligibility(
        fakeSupabase({ data: null, error: { code: '08006', message: 'connection failed' } }),
        { deviceId: 'device-a', ip: '41.66.1.1', userAgent: CHROME_ANDROID }
    )
    assert.deepEqual(result, { allowed: true })
})

test('a request with neither signal is allowed without querying at all', async () => {
    const client = fakeSupabase({ data: [{ allowed: false, reason: 'device' }], error: null })
    const result = await checkDeviceEligibility(client, {
        deviceId: undefined,
        ip: 'unknown',
        userAgent: null,
    })
    assert.deepEqual(result, { allowed: true })
    assert.equal(client.calls.length, 0, 'must not hit the database with two null digests')
})

test('a missing server secret disables the check rather than blocking anyone', async () => {
    const previous = process.env.VOTER_JWT_SECRET
    delete process.env.VOTER_JWT_SECRET
    try {
        assert.equal(deviceTokenHash('device-a'), null)
        const client = fakeSupabase({ data: [{ allowed: false, reason: 'device' }], error: null })
        const result = await checkDeviceEligibility(client, {
            deviceId: 'device-a',
            ip: '41.66.1.1',
            userAgent: CHROME_ANDROID,
        })
        assert.deepEqual(result, { allowed: true })
        assert.equal(client.calls.length, 0)
    } finally {
        process.env.VOTER_JWT_SECRET = previous
    }
})
