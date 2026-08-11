import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

process.env.VOTER_JWT_SECRET ??= 'test-secret-for-client-ip-only'

const { resolveClientIp, canonicaliseIp, UNRESOLVED_IP, resetIpWarnings } = await import(
    '@/lib/client-ip'
)
const { environmentHash } = await import('@/lib/device-registration')

/** A request's headers, as the resolver sees them. */
const headers = (values) => ({
    get: (name) => values[name.toLowerCase()] ?? null,
})

/** Deployments the resolver has to behave differently on. */
const ON_VERCEL = { VERCEL: '1' }
const BEHIND_OWN_PROXY = { TRUSTED_CLIENT_IP_HEADER: 'x-real-ip' }
const NOTHING_CONFIGURED = {}
const NOTHING_CONFIGURED_PROD = { NODE_ENV: 'production' }

const resolve = (values, env = NOTHING_CONFIGURED) => resolveClientIp(headers(values), env)

test.beforeEach(() => resetIpWarnings())

// ── The vulnerability this rewrite exists to close ───────────────────────────

test('a header is not trusted merely because of its name', () => {
    // Every one of these was returned unconditionally by the previous
    // implementation. On any deployment without the matching platform in front,
    // a voter sending one got a fresh rate-limit bucket per request and
    // defeated every IP limit in the platform at once.
    for (const spoofed of ['x-vercel-forwarded-for', 'cf-connecting-ip', 'x-real-ip']) {
        assert.equal(
            resolve({ [spoofed]: '9.9.9.9' }),
            UNRESOLVED_IP,
            `${spoofed} must not be trusted when nothing establishes that platform`
        )
    }
})

test('a forged platform header cannot override the real one on Vercel', () => {
    // On Vercel the edge overwrites x-vercel-forwarded-for, so what arrives is
    // authoritative. A voter's own cf-connecting-ip / x-real-ip must not win.
    const ip = resolve(
        {
            'x-vercel-forwarded-for': '41.66.1.1',
            'cf-connecting-ip': '9.9.9.9',
            'x-real-ip': '8.8.8.8',
            'x-forwarded-for': '7.7.7.7',
        },
        ON_VERCEL
    )
    assert.equal(ip, '41.66.1.1')
})

test('a forged header cannot beat the header the deployment actually configured', () => {
    const ip = resolve(
        { 'x-real-ip': '41.66.1.1', 'x-vercel-forwarded-for': '9.9.9.9' },
        BEHIND_OWN_PROXY
    )
    assert.equal(ip, '41.66.1.1')
})

test('an explicitly configured header outranks the Vercel default', () => {
    const ip = resolve(
        { 'x-real-ip': '41.66.1.1', 'x-vercel-forwarded-for': '9.9.9.9' },
        { ...ON_VERCEL, ...BEHIND_OWN_PROXY }
    )
    assert.equal(ip, '41.66.1.1')
})

test('a non-address in a header never becomes a rate-limit key', () => {
    // Otherwise a caller chooses their own bucket by sending text, and puts
    // arbitrary content into admin_audit_log.actor_ip.
    for (const junk of ['not-an-ip', '"; drop table voters; --', 'a'.repeat(5000), '999.1.1.1', '::gg']) {
        assert.equal(resolve({ 'x-vercel-forwarded-for': junk }, ON_VERCEL), UNRESOLVED_IP)
    }
})

// ── Which entry of a list is the client ──────────────────────────────────────

test('a platform header takes its FIRST entry', () => {
    // Platform-set, so anything after the client was added closer to us.
    assert.equal(
        resolve({ 'x-vercel-forwarded-for': '41.66.1.1, 10.0.0.5' }, ON_VERCEL),
        '41.66.1.1'
    )
})

test('the untrusted fallback takes the RIGHT-MOST entry', () => {
    // The opposite rule, deliberately: a client can prepend anything it likes,
    // so only the hop the nearest proxy appended is worth reading.
    assert.equal(resolve({ 'x-forwarded-for': '9.9.9.9, 41.66.1.1' }), '41.66.1.1')
})

test('the fallback skips unusable hops rather than giving up', () => {
    assert.equal(resolve({ 'x-forwarded-for': '41.66.1.1, _hidden_' }), '41.66.1.1')
})

test('a trusted header that is present but unusable falls back rather than failing', () => {
    assert.equal(
        resolve({ 'x-vercel-forwarded-for': 'nonsense', 'x-forwarded-for': '41.66.1.1' }, ON_VERCEL),
        '41.66.1.1'
    )
})

// ── Normalisation ────────────────────────────────────────────────────────────

test('IPv4 is returned as-is, and a port is stripped', () => {
    assert.equal(canonicaliseIp('41.66.1.1'), '41.66.1.1')
    assert.equal(canonicaliseIp('41.66.1.1:53124'), '41.66.1.1')
    assert.equal(canonicaliseIp('  41.66.1.1  '), '41.66.1.1')
})

test('bracketed IPv6, with or without a port, resolves to the same bucket', () => {
    const bare = canonicaliseIp('2001:db8::1')
    assert.equal(canonicaliseIp('[2001:db8::1]'), bare)
    assert.equal(canonicaliseIp('[2001:db8::1]:443'), bare)
})

test('one IPv6 address written two ways is one bucket', () => {
    // Two spellings meant two buckets before, and therefore twice the allowance.
    assert.equal(
        canonicaliseIp('2001:0db8:0000:0000:0000:0000:0000:0001'),
        canonicaliseIp('2001:db8::1')
    )
    assert.equal(canonicaliseIp('2001:DB8::1'), canonicaliseIp('2001:db8::1'))
})

test('IPv4-mapped IPv6 folds to its IPv4 form', () => {
    // ::ffff:41.66.1.1 and 41.66.1.1 are the same client and must not be two
    // buckets reachable by switching representation.
    assert.equal(canonicaliseIp('::ffff:41.66.1.1'), '41.66.1.1')
    assert.equal(canonicaliseIp('[::ffff:41.66.1.1]:443'), '41.66.1.1')
})

test('malformed values canonicalise to null, not to themselves', () => {
    for (const junk of ['', null, undefined, 'localhost', '41.66.1', '41.66.1.256', 'ffff::gg', '...']) {
        assert.equal(canonicaliseIp(junk), null, `${JSON.stringify(junk)} must not survive`)
    }
})

// ── IPv6 bucketing ───────────────────────────────────────────────────────────

test('IPv6 is bucketed by /64, so rotating within a prefix buys nothing', () => {
    // Every IPv6 subscriber holds a /64 outright. Limiting a single address
    // limits nothing: a script changes its source address and gets a fresh
    // allowance without changing network or forging a header.
    const first = canonicaliseIp('2001:db8:85a3:1::1')
    for (const sibling of ['2001:db8:85a3:1::2', '2001:db8:85a3:1:abcd:ef01:2345:6789']) {
        assert.equal(canonicaliseIp(sibling), first, `${sibling} shares the subscriber's /64`)
    }
})

test('different /64s remain different buckets', () => {
    // The other half of the trade: neighbours must not be collapsed into one
    // another's allowance, or a shared network refuses real voters.
    assert.notEqual(canonicaliseIp('2001:db8:85a3:1::1'), canonicaliseIp('2001:db8:85a3:2::1'))
    assert.notEqual(canonicaliseIp('2001:db8:85a3:1::1'), canonicaliseIp('2a00:1450:4009:81f::1'))
})

test('an IPv6 bucket key is stable and self-describing', () => {
    assert.equal(canonicaliseIp('2001:0db8:85a3:0001::1'), '2001:db8:85a3:1::/64')
    assert.equal(canonicaliseIp('::1'), '0:0:0:0::/64')
})

test('IPv4 and IPv6 never collide', () => {
    assert.notEqual(canonicaliseIp('41.66.1.1'), canonicaliseIp('2001:db8::1'))
})

// ── Failure behaviour ────────────────────────────────────────────────────────

test('no usable headers resolves to the unresolved sentinel', () => {
    assert.equal(resolve({}), UNRESOLVED_IP)
    assert.equal(resolve({ 'x-forwarded-for': '' }), UNRESOLVED_IP)
    assert.equal(resolve({}, ON_VERCEL), UNRESOLVED_IP)
})

test('the unresolved sentinel disables the device backstop instead of sharing one bucket', () => {
    // This is why the sentinel is still the literal 'unknown'. If it produced a
    // real digest, every unresolved request in the country would share ONE
    // registration backstop bucket and the first forty in ten minutes would
    // lock everyone else out. A disabled backstop is the lesser harm.
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1'
    assert.equal(environmentHash(UNRESOLVED_IP, ua), null)
    assert.notEqual(environmentHash('41.66.1.1', ua), null)
})

test('an unconfigured production deployment says so, once', () => {
    const errors = []
    const original = console.error
    console.error = (message) => errors.push(message)
    try {
        resolve({ 'x-forwarded-for': '41.66.1.1' }, NOTHING_CONFIGURED_PROD)
        resolve({ 'x-forwarded-for': '41.66.1.2' }, NOTHING_CONFIGURED_PROD)
    } finally {
        console.error = original
    }

    assert.equal(errors.length, 1, 'a deployment-level fault is reported once, not per request')
    assert.match(errors[0], /TRUSTED_CLIENT_IP_HEADER/)
})

test('a correctly configured deployment says nothing', () => {
    const errors = []
    const original = console.error
    console.error = (message) => errors.push(message)
    try {
        resolve({ 'x-vercel-forwarded-for': '41.66.1.1' }, { ...ON_VERCEL, NODE_ENV: 'production' })
    } finally {
        console.error = original
    }
    assert.deepEqual(errors, [])
})

// ── Wiring ───────────────────────────────────────────────────────────────────

test('http.js delegates rather than keeping a second copy of these rules', () => {
    // src/lib/http.js imports next/server and cannot be loaded here, so the
    // wiring is asserted from the source. Two implementations of this decision
    // is how one of them drifts.
    const http = readFileSync(path.join(process.cwd(), 'src', 'lib', 'http.js'), 'utf8')

    assert.match(http, /import \{ resolveClientIp \} from '@\/lib\/client-ip'/)
    assert.match(http, /export function getClientIp\(request\) \{\s*return resolveClientIp\(request\.headers\)\s*\}/)

    // The old header names must not linger anywhere in the wrapper.
    for (const header of ['x-vercel-forwarded-for', 'cf-connecting-ip', 'x-real-ip']) {
        assert.ok(!http.includes(header), `${header} must no longer be read in http.js`)
    }
})

test('client-ip stays loadable without a Next runtime', () => {
    // The whole reason this module exists separately. If it ever imports
    // next/server, every test above stops running and nothing says so.
    const source = readFileSync(path.join(process.cwd(), 'src', 'lib', 'client-ip.js'), 'utf8')
    assert.ok(!source.includes('next/server'))
    assert.ok(!source.includes('@sentry'))
})
