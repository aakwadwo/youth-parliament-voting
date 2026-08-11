import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

process.env.VOTER_JWT_SECRET ??= 'test-secret-for-device-registration-only'

const {
    deviceTokenHash,
    environmentHash,
    newDeviceId,
    checkDeviceEligibility,
    recordDeviceRegistration,
    REGISTRATION_DEVICE_LIMITS,
    DEVICE_LIMIT_REACHED,
    ENVIRONMENT_LIMIT_REACHED,
} = await import('@/lib/device-registration')

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36'
const CHROME_ANDROID_NEWER = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 Chrome/131.0.6778.81 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'

const SHARED_PHONE = { ip: '41.66.1.1', userAgent: CHROME_ANDROID }

/**
 * An in-memory stand-in for migration 0016, reimplementing the same window
 * semantics against a clock the test controls.
 *
 * Worth the ~40 lines: the whole point of this change is that capacity is
 * *returned* as events age out, and there is no way to demonstrate that against
 * a real clock without a test that sleeps for half an hour. It also pins the
 * semantics the SQL is expected to have — a strictly-greater-than cutoff, and a
 * wait derived from the limit-th most recent event — so a future edit to either
 * side has something to disagree with.
 */
function makeDeviceStore({ start = Date.parse('2026-08-09T09:00:00Z') } = {}) {
    let clock = start
    const events = []
    const calls = []

    function retryFor(hash, limit, seconds) {
        if (limit <= 0 || seconds <= 0) {
            throw new Error(`window must be positive (got ${limit} / ${seconds})`)
        }
        if (!hash) return null

        const cutoff = clock - seconds * 1000
        const recent = events
            .filter((event) => event.hash === hash && event.at > cutoff)
            .sort((a, b) => b.at - a.at)

        if (recent.length < limit) return null

        const freesAt = recent[limit - 1].at + seconds * 1000
        return Math.max(1, Math.ceil((freesAt - clock) / 1000))
    }

    return {
        calls,
        events,
        advanceSeconds(seconds) {
            clock += seconds * 1000
        },
        get registrations() {
            return events.length
        },
        rpc: async (name, args) => {
            calls.push({ name, args })

            if (name === 'check_registration_device') {
                const checks = [
                    ['device_burst', args.p_token_hash, args.p_token_burst_limit, args.p_burst_seconds],
                    ['device_daily', args.p_token_hash, args.p_token_daily_limit, args.p_daily_seconds],
                    ['environment_burst', args.p_environment_hash, args.p_environment_burst_limit, args.p_burst_seconds],
                    ['environment_daily', args.p_environment_hash, args.p_environment_daily_limit, args.p_daily_seconds],
                ]

                for (const [reason, hash, limit, seconds] of checks) {
                    const retry = retryFor(hash, limit, seconds)
                    if (retry !== null) {
                        return {
                            data: [{ allowed: false, reason, retry_after_seconds: retry }],
                            error: null,
                        }
                    }
                }
                return { data: [{ allowed: true, reason: 'ok', retry_after_seconds: 0 }], error: null }
            }

            if (name === 'record_registration_device') {
                if (args.p_token_hash) events.push({ hash: args.p_token_hash, kind: 'token', at: clock })
                if (args.p_environment_hash) {
                    events.push({ hash: args.p_environment_hash, kind: 'environment', at: clock })
                }
                return { data: null, error: null }
            }

            if (name === 'prune_registration_events') {
                return { data: 0, error: null }
            }

            throw new Error(`unexpected rpc ${name}`)
        },
    }
}

/** One voter completing a registration from the given signals. */
async function register(store, signals) {
    const check = await checkDeviceEligibility(store, signals)
    if (!check.allowed) return check
    await recordDeviceRegistration(store, signals)
    return check
}

// ── The digest itself ────────────────────────────────────────────────────────

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

test('the digest is keyed, so it cannot be recomputed without the server secret', () => {
    const withOriginalSecret = deviceTokenHash('device-a')
    const previous = process.env.VOTER_JWT_SECRET
    process.env.VOTER_JWT_SECRET = 'a-completely-different-server-secret'
    try {
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
    assert.equal(
        environmentHash('41.66.1.1', CHROME_ANDROID),
        environmentHash('41.66.1.1', CHROME_ANDROID_NEWER)
    )
})

test('the environment digest separates different devices and different networks', () => {
    assert.notEqual(environmentHash('41.66.1.1', CHROME_ANDROID), environmentHash('41.66.1.1', IPHONE))
    assert.notEqual(environmentHash('41.66.1.1', CHROME_ANDROID), environmentHash('41.66.1.2', CHROME_ANDROID))
})

test('an unknown IP produces no environment digest rather than a shared one', () => {
    assert.equal(environmentHash('unknown', CHROME_ANDROID), null)
    assert.equal(environmentHash(null, CHROME_ANDROID), null)
})

test('device ids are unique and server-minted', () => {
    const ids = new Set(Array.from({ length: 200 }, newDeviceId))
    assert.equal(ids.size, 200)
})

// ── The policy ───────────────────────────────────────────────────────────────

test('the policy is windowed, not a lifetime cap', () => {
    const { burst, daily } = REGISTRATION_DEVICE_LIMITS

    for (const window of [burst, daily]) {
        assert.ok(Number.isInteger(window.seconds) && window.seconds > 0)
        assert.ok(Number.isInteger(window.device) && window.device > 0)
        assert.ok(window.environment > 0)
    }

    assert.ok(burst.seconds < daily.seconds, 'the burst window must be the shorter one')
    assert.ok(burst.device < daily.device, 'the burst allowance must be the smaller one')
    // The environment digest collides between strangers behind one NAT address.
    // If it is ever tuned as tightly as the token layer it becomes the binding
    // constraint for a shared network, and starts refusing people who have done
    // nothing at all.
    assert.ok(burst.environment > burst.device, 'the backstop must be looser than the device limit')
    assert.ok(daily.environment > daily.device, 'the backstop must be looser than the device limit')
})

test('the stated policy is 5 per ten minutes, with a daily ceiling of 100', () => {
    // Pinned deliberately: these are the figures the Commission agreed, and a
    // change to them should have to be made on purpose.
    //
    // The burst window carries the anti-abuse work; the daily figure is a
    // ceiling set well above any legitimate volume, so that a registration desk
    // or a shared laptop is never the thing it stops.
    assert.deepEqual(REGISTRATION_DEVICE_LIMITS.burst.seconds, 600)
    assert.deepEqual(REGISTRATION_DEVICE_LIMITS.burst.device, 5)
    assert.deepEqual(REGISTRATION_DEVICE_LIMITS.burst.environment, 40)
    assert.deepEqual(REGISTRATION_DEVICE_LIMITS.daily.seconds, 86400)
    assert.deepEqual(REGISTRATION_DEVICE_LIMITS.daily.device, 100)
    assert.deepEqual(REGISTRATION_DEVICE_LIMITS.daily.environment, 1000)
})

test('a shared device serves a queue at human speed without being refused', () => {
    // The property that matters more than any individual number: a device may
    // register at least one voter per minute-and-a-bit sustained, which is
    // faster than anyone fills in this form by hand.
    const { burst, daily } = REGISTRATION_DEVICE_LIMITS
    const perHour = (burst.device * 3600) / burst.seconds

    assert.ok(perHour >= 30, `a device must sustain a queue (got ${perHour}/hour)`)
    assert.ok(
        daily.device >= perHour,
        'the daily ceiling must not undercut the burst rate within the first hour'
    )
})

test('1. one voter registers from a device', async () => {
    const store = makeDeviceStore()
    const result = await register(store, { deviceId: 'device-x', ...SHARED_PHONE })

    assert.deepEqual(result, { allowed: true })
    assert.equal(store.registrations, 2, 'one token event and one environment event')
})

test('2. five voters register back to back from one shared phone', async () => {
    // Persons A-E, the scenario a household phone creates. They are standing in
    // a queue, so they arrive one after another rather than spread over hours —
    // and that must be enough.
    const store = makeDeviceStore()
    const signals = { deviceId: 'device-x', ...SHARED_PHONE }

    for (const person of ['A', 'B', 'C', 'D', 'E']) {
        const result = await register(store, signals)
        assert.equal(result.allowed, true, `person ${person} must be able to register`)
        // 90 seconds each: about as fast as this form can honestly be filled in.
        store.advanceSeconds(90)
    }

    assert.equal(store.events.filter((e) => e.kind === 'token').length, 5)
})

test('2b. a registration desk works through forty voters in a day', async () => {
    // One laptop, one browser, one staff member assisting voter after voter.
    // Under the previous daily cap this stopped dead after five.
    const store = makeDeviceStore()
    const signals = { deviceId: 'desk-laptop', ...SHARED_PHONE }

    for (let i = 0; i < 40; i += 1) {
        const result = await register(store, signals)
        assert.equal(result.allowed, true, `voter ${i + 1} at the desk`)
        store.advanceSeconds(3 * 60)
    }

    assert.equal(store.events.filter((e) => e.kind === 'token').length, 40)
})

test('3. a sixth registration inside the burst window is refused', async () => {
    // Faster than five in ten minutes is faster than people fill in forms, so
    // this is where a script meets the wall.
    const store = makeDeviceStore()
    const signals = { deviceId: 'device-x', ...SHARED_PHONE }

    for (let i = 0; i < REGISTRATION_DEVICE_LIMITS.burst.device; i += 1) {
        assert.equal((await register(store, signals)).allowed, true)
        store.advanceSeconds(5)
    }

    const refused = await register(store, signals)

    assert.equal(refused.allowed, false)
    assert.equal(refused.reason, 'device_burst')
    assert.equal(refused.message, DEVICE_LIMIT_REACHED)
    assert.equal(
        store.events.filter((e) => e.kind === 'token').length,
        REGISTRATION_DEVICE_LIMITS.burst.device,
        'refusal records nothing'
    )
})

test('3b. a refused registration reports a wait, and it shrinks as the window rolls', async () => {
    const store = makeDeviceStore()
    const signals = { deviceId: 'device-x', ...SHARED_PHONE }

    for (let i = 0; i < REGISTRATION_DEVICE_LIMITS.burst.device; i += 1) {
        await register(store, signals)
    }

    const elapsed = 120
    store.advanceSeconds(elapsed)
    const refused = await register(store, signals)

    assert.equal(refused.allowed, false)
    assert.ok(refused.retryAfterSeconds > 0)
    assert.ok(
        refused.retryAfterSeconds <= REGISTRATION_DEVICE_LIMITS.burst.seconds - elapsed,
        'the wait must shrink as the window rolls forward'
    )
})

/**
 * Fills a device's whole daily allowance, paced so the burst window is never
 * the thing that refuses — which is what isolates the daily ceiling for the two
 * tests below.
 */
async function fillDailyAllowance(store, signals) {
    const { burst, daily } = REGISTRATION_DEVICE_LIMITS
    // Comfortably slower than the burst rate allows.
    const spacing = Math.ceil(burst.seconds / burst.device) + 10

    for (let i = 0; i < daily.device; i += 1) {
        const result = await register(store, signals)
        assert.equal(result.allowed, true, `registration ${i + 1} of the daily allowance`)
        store.advanceSeconds(spacing)
    }
}

test('4. the daily ceiling refuses only once it is genuinely reached', async () => {
    const store = makeDeviceStore()
    const signals = { deviceId: 'device-x', ...SHARED_PHONE }

    await fillDailyAllowance(store, signals)

    const overTheCeiling = await register(store, signals)

    assert.equal(overTheCeiling.allowed, false)
    assert.equal(overTheCeiling.reason, 'device_daily')
    assert.equal(overTheCeiling.message, DEVICE_LIMIT_REACHED)
    assert.equal(
        store.events.filter((e) => e.kind === 'token').length,
        REGISTRATION_DEVICE_LIMITS.daily.device
    )
})

test('5. a failed registration attempt consumes no capacity', async () => {
    // The check is read-only. A voter who mistypes their name, picks the wrong
    // constituency or is refused for any other reason must not have burned a
    // slot: the route only records after the voter row actually exists.
    const store = makeDeviceStore()
    const signals = { deviceId: 'device-x', ...SHARED_PHONE }

    for (let i = 0; i < 20; i += 1) {
        assert.equal((await checkDeviceEligibility(store, signals)).allowed, true)
    }

    assert.equal(store.registrations, 0, 'checking must never write')

    // And the full allowance is still there afterwards.
    for (let i = 0; i < 5; i += 1) {
        assert.equal((await register(store, signals)).allowed, true)
        store.advanceSeconds(3600)
    }
})

test('7. a duplicate-phone attempt cannot consume device capacity', async () => {
    // The register route returns ALREADY_REGISTERED before the device check
    // runs, so a duplicate never reaches this module at all. Even if that
    // ordering changed, reaching the check without reaching the record leaves
    // the allowance untouched — which is what this asserts.
    const store = makeDeviceStore()
    const signals = { deviceId: 'device-x', ...SHARED_PHONE }

    await register(store, signals)
    for (let i = 0; i < 10; i += 1) await checkDeviceEligibility(store, signals)

    assert.equal(store.events.filter((e) => e.kind === 'token').length, 1)
})

test('8. capacity returns as the burst window rolls past', async () => {
    const store = makeDeviceStore()
    const signals = { deviceId: 'device-x', ...SHARED_PHONE }

    for (let i = 0; i < REGISTRATION_DEVICE_LIMITS.burst.device; i += 1) {
        await register(store, signals)
    }
    assert.equal((await checkDeviceEligibility(store, signals)).allowed, false)

    // One second short of the window: still refused.
    store.advanceSeconds(REGISTRATION_DEVICE_LIMITS.burst.seconds - 1)
    assert.equal((await checkDeviceEligibility(store, signals)).allowed, false)

    store.advanceSeconds(2)
    assert.equal(
        (await checkDeviceEligibility(store, signals)).allowed,
        true,
        'the oldest events have aged out and their slots are free again'
    )
})

test('8b. capacity returns as the daily window rolls past', async () => {
    const store = makeDeviceStore()
    const signals = { deviceId: 'device-x', ...SHARED_PHONE }

    await fillDailyAllowance(store, signals)
    assert.equal((await checkDeviceEligibility(store, signals)).allowed, false)

    // A full day after the last registration, the device is clear again. This
    // is the behaviour the lifetime counters could not provide: a registration
    // drive in June no longer consumes capacity needed on polling day.
    store.advanceSeconds(REGISTRATION_DEVICE_LIMITS.daily.seconds)
    assert.equal((await checkDeviceEligibility(store, signals)).allowed, true)
})

test('a fresh browser on a shared connection is judged by the backstop, not the device limit', async () => {
    // Clearing cookies or opening a private window drops the token, so only the
    // environment digest applies. It has real headroom, so a queue of people at
    // a cybercafé gets through where the old lifetime limit of three did not.
    const store = makeDeviceStore()

    for (let i = 0; i < REGISTRATION_DEVICE_LIMITS.burst.environment; i += 1) {
        const result = await register(store, { deviceId: undefined, ...SHARED_PHONE })
        assert.equal(result.allowed, true, `registration ${i + 1} from a fresh browser`)
    }

    const refused = await register(store, { deviceId: undefined, ...SHARED_PHONE })
    assert.equal(refused.allowed, false)
    assert.equal(refused.reason, 'environment_burst')
    assert.equal(refused.message, ENVIRONMENT_LIMIT_REACHED)
})

test('two different device classes on one address do not share an allowance', async () => {
    // Carrier-grade NAT puts a whole town behind one address. The digest is
    // address *and* device class, so an iPhone user is not refused because
    // Android users nearby have been registering.
    const store = makeDeviceStore()

    for (let i = 0; i < REGISTRATION_DEVICE_LIMITS.burst.environment; i += 1) {
        await register(store, { deviceId: undefined, ip: '41.66.1.1', userAgent: CHROME_ANDROID })
    }

    const iphone = await register(store, {
        deviceId: undefined,
        ip: '41.66.1.1',
        userAgent: IPHONE,
    })
    assert.equal(iphone.allowed, true)
})

test('a request carrying neither signal is allowed without querying at all', async () => {
    const store = makeDeviceStore()
    const result = await checkDeviceEligibility(store, {
        deviceId: undefined,
        ip: 'unknown',
        userAgent: null,
    })

    assert.deepEqual(result, { allowed: true })
    assert.equal(store.calls.length, 0, 'must not hit the database with two null digests')
})

// ── Failure modes ────────────────────────────────────────────────────────────

test('a missing migration 0016 FAILS OPEN — registration must not stop', async () => {
    // The opposite of the rate limiter on purpose: this is an anti-abuse
    // heuristic behind a hard uniqueness constraint, so a broken check must
    // never stand between a citizen and the franchise.
    const result = await checkDeviceEligibility(
        { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }) },
        { deviceId: 'device-x', ...SHARED_PHONE }
    )
    assert.deepEqual(result, { allowed: true })
})

test('a database outage FAILS OPEN', async () => {
    const result = await checkDeviceEligibility(
        { rpc: async () => ({ data: null, error: { code: '08006', message: 'connection failed' } }) },
        { deviceId: 'device-x', ...SHARED_PHONE }
    )
    assert.deepEqual(result, { allowed: true })
})

test('a missing server secret disables the check rather than blocking anyone', async () => {
    const previous = process.env.VOTER_JWT_SECRET
    delete process.env.VOTER_JWT_SECRET
    try {
        assert.equal(deviceTokenHash('device-x'), null)
        const store = makeDeviceStore()
        const result = await checkDeviceEligibility(store, { deviceId: 'device-x', ...SHARED_PHONE })
        assert.deepEqual(result, { allowed: true })
        assert.equal(store.calls.length, 0)
    } finally {
        process.env.VOTER_JWT_SECRET = previous
    }
})

// ── The contract with Postgres ───────────────────────────────────────────────

const MIGRATION = readFileSync(
    path.join(process.cwd(), 'migrations', '0016_windowed_registration_devices.up.sql'),
    'utf8'
)

/** The declared parameter names of one function in the migration. */
function sqlParameterNames(source, functionName) {
    const declaration = new RegExp(
        `create or replace function ${functionName}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
        'i'
    ).exec(source)
    assert.ok(declaration, `${functionName} is not declared in the migration`)
    return declaration[1]
        .split(',')
        .map((param) => param.trim().split(/\s+/)[0])
        .filter(Boolean)
        .sort()
}

test('every argument the app sends matches a parameter the migration declares', async () => {
    // A renamed or missing parameter surfaces as PGRST202, which this module
    // treats as "migration not applied" and fails OPEN on — so a mismatch here
    // would silently switch the whole control off rather than raising an error.
    // That makes this cheap test worth more than it looks.
    const store = makeDeviceStore()
    await checkDeviceEligibility(store, { deviceId: 'device-x', ...SHARED_PHONE })
    await recordDeviceRegistration(store, { deviceId: 'device-x', ...SHARED_PHONE })

    const sent = (name) =>
        Object.keys(store.calls.find((call) => call.name === name).args).sort()

    assert.deepEqual(
        sent('check_registration_device'),
        sqlParameterNames(MIGRATION, 'check_registration_device')
    )
    assert.deepEqual(
        sent('record_registration_device'),
        sqlParameterNames(MIGRATION, 'record_registration_device')
    )
})

test('the migration cannot touch election data', () => {
    // 0016 creates its own table and functions and nothing else. If this ever
    // fails, the migration has grown the ability to alter the register, the
    // ballots, the candidates or the election schedule.
    //
    // Comments are stripped first: the prose above the statements discusses
    // voters at length, and matching on that would make this test meaningless
    // in one direction and unmaintainable in the other.
    const statements = MIGRATION.split('\n')
        .filter((line) => !line.trim().startsWith('--') && !line.trim().startsWith('*'))
        .join('\n')

    for (const table of ['election_settings', 'voters', 'votes', 'candidates', 'constituencies']) {
        assert.ok(
            !new RegExp(`\\b(from|join|into|update|table)\\s+${table}\\b`, 'i').test(statements),
            `migration 0016 must not read or write ${table}`
        )
    }
    assert.ok(!/\bdrop\s+table\b/i.test(statements), 'the up migration must drop no table')
})

test('the lifetime counters from 0014 are no longer consulted', () => {
    // The old table is left in place so the migration is reversible, but nothing
    // may read it: a stale lifetime count of 1 would refuse a voter under a
    // policy that no longer exists.
    const library = readFileSync(
        path.join(process.cwd(), 'src', 'lib', 'device-registration.js'),
        'utf8'
    )
    assert.ok(!library.includes('registration_devices'))
    assert.ok(!library.includes('registration_count'))
    assert.ok(!/DEVICE_REGISTRATION_LIMIT|ENVIRONMENT_REGISTRATION_LIMIT/.test(library))
})

// ── What voters are told ─────────────────────────────────────────────────────

test('refusal messages disclose no threshold and no duration', () => {
    for (const message of [DEVICE_LIMIT_REACHED, ENVIRONMENT_LIMIT_REACHED]) {
        assert.ok(!/\d/.test(message), `"${message}" must contain no numbers`)
        assert.ok(
            !/\b(two|three|five|twice|minute|minutes|hour|hours|day|days)\b/i.test(message),
            `"${message}" must not state a threshold or a window`
        )
    }

    // Neither may accuse the voter of having registered already: a shared phone
    // reaching a limit is a phone doing its job, and the environment digest can
    // be tripped by a stranger on the same network.
    for (const message of [DEVICE_LIMIT_REACHED, ENVIRONMENT_LIMIT_REACHED]) {
        assert.ok(!/already (been )?registered/i.test(message))
    }

    // Both must offer a way forward rather than a dead end.
    assert.match(DEVICE_LIMIT_REACHED, /Electoral Commission/)
    assert.match(ENVIRONMENT_LIMIT_REACHED, /Electoral Commission/)
})
