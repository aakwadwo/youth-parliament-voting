import { isIP } from 'node:net'

/**
 * Resolving the address a request actually came from.
 *
 * This value is the key for every IP rate limit in the platform — registration,
 * voter sign-in, admin sign-in, report exports — it is half of the registration
 * device backstop's digest, and it is written to the audit trail as the address
 * an administrator acted from. If it can be chosen by the caller, all of that
 * becomes decoration.
 *
 * ── Why this is not simply "read a forwarding header" ────────────────────────
 *
 * The previous implementation preferred `x-vercel-forwarded-for`, then
 * `cf-connecting-ip`, then `x-real-ip`, and returned whichever was present. The
 * intention was right — prefer headers a platform sets over one a client can
 * write — but a header name carries no authority. `x-vercel-forwarded-for` is
 * only trustworthy on Vercel, where the edge overwrites it; anywhere else it is
 * an ordinary header that any client can send. On a deployment without Vercel
 * in front, one voter sending `x-vercel-forwarded-for: <anything>` got a fresh
 * rate-limit bucket per request, defeating every IP limit at once — and because
 * the same value feeds environmentHash(), the registration device backstop with
 * them. That is a far cheaper attack than changing network, and it was silent.
 *
 * A header is therefore trusted only when something establishes that the
 * platform which sets it is genuinely in front of us:
 *
 *   TRUSTED_CLIENT_IP_HEADER   names the header the deployment's own proxy sets
 *                              and overwrites. Explicit, and the only option
 *                              for a deployment that is not on Vercel.
 *
 *   VERCEL                     set to "1" by Vercel in every deployment. Its
 *                              presence is what makes x-vercel-forwarded-for
 *                              meaningful, so it is what gates trusting it. No
 *                              new variable to forget on the intended platform.
 *
 * With neither, nothing is trusted by name and the right-most `x-forwarded-for`
 * hop is used as a last resort — the entry appended by the nearest proxy rather
 * than whatever the client prepended. That is correct behind exactly one proxy
 * and is announced loudly, because a production deployment reaching this path
 * is misconfigured.
 *
 * ── Normalisation, and why the bucket is not always one address ──────────────
 *
 * Everything is canonicalised before it becomes a key, because two spellings of
 * one address are two buckets and therefore twice the allowance. Ports and
 * brackets are stripped, IPv4-mapped IPv6 is folded to its IPv4 form, and
 * anything that is not a valid address is discarded rather than used.
 *
 * IPv6 is bucketed by its /64 prefix rather than the full address. Every IPv6
 * subscriber is delegated a /64 at minimum — 18 quintillion addresses they
 * control outright — so limiting a single IPv6 address limits nothing at all: a
 * script rotates its source address within its own prefix and gets an unlimited
 * supply of fresh buckets without changing network or forging a header. A /64
 * is the smallest unit that corresponds to a subscriber rather than to a socket.
 * See ipv6Bucket() for why this is not widened to /48.
 */

/**
 * The value returned when no address can be established.
 *
 * Deliberately the string 'unknown', unchanged from the previous implementation,
 * because device-registration.js treats exactly that value as "no environment
 * signal" and returns a null digest for it. That matters: if unresolved requests
 * produced a real digest they would all share ONE registration backstop bucket,
 * and the first forty of them in ten minutes would lock every subsequent voter
 * out of registering nationally. Disabling the backstop is the lesser harm, and
 * it is the behaviour the constant already carries.
 */
export const UNRESOLVED_IP = 'unknown'

/** Warnings that describe a deployment, not a request, are worth saying once. */
const alreadyWarned = new Set()

function warnOnce(key, message) {
    if (alreadyWarned.has(key)) return
    alreadyWarned.add(key)
    console.error(message)
}

/** Test seam: lets a test observe first-time warnings without process state. */
export function resetIpWarnings() {
    alreadyWarned.clear()
}

/**
 * Removes the decoration a forwarding header may carry around an address:
 * `[2001:db8::1]:443`, `41.66.1.1:53124`, surrounding whitespace.
 *
 * A bare IPv6 address always contains at least two colons, so the single-colon
 * test cannot mistake one for a host:port pair.
 */
function stripPortAndBrackets(value) {
    const trimmed = String(value).trim()

    const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(trimmed)
    if (bracketed) return bracketed[1]

    const colonCount = (trimmed.match(/:/g) ?? []).length
    if (colonCount === 1) {
        const [host, port] = trimmed.split(':')
        if (/^\d+$/.test(port)) return host
    }

    return trimmed
}

/**
 * Expands an IPv6 address to its eight 16-bit groups.
 *
 * Only ever called on a string `isIP()` has already accepted, so this formats
 * rather than validates — but it still returns null on anything it cannot make
 * sense of, because a wrong bucket is worse than no bucket.
 */
function expandIpv6(address) {
    let text = address.toLowerCase()

    // A trailing dotted quad carries the last 32 bits: ::ffff:41.66.1.1.
    const embedded = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text)
    if (embedded) {
        const octets = embedded[1].split('.').map(Number)
        if (octets.some((octet) => !Number.isInteger(octet) || octet > 255)) return null
        const high = ((octets[0] << 8) | octets[1]).toString(16)
        const low = ((octets[2] << 8) | octets[3]).toString(16)
        text = `${text.slice(0, embedded.index)}${high}:${low}`
    }

    const halves = text.split('::')
    if (halves.length > 2) return null

    const head = halves[0] ? halves[0].split(':') : []
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []

    let groups
    if (halves.length === 2) {
        const missing = 8 - head.length - tail.length
        if (missing < 0) return null
        groups = [...head, ...Array(missing).fill('0'), ...tail]
    } else {
        if (head.length !== 8) return null
        groups = head
    }

    const values = groups.map((group) => Number.parseInt(group || '0', 16))
    if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 0xffff)) {
        return null
    }

    return values
}

/**
 * The /64 an IPv6 address belongs to, as a stable key.
 *
 * Not widened to /56 or /48. Some providers delegate those, so an attacker
 * holding one still commands many /64s — but a campus or a mobile carrier also
 * places large numbers of unrelated subscribers inside a single /48, and
 * collapsing them into one allowance would refuse real voters in exactly the
 * shared-network situation this platform has to serve. /64 is the boundary that
 * bounds a subscriber without swallowing a neighbourhood, and the same trade-off
 * the IPv4 limits already accept for carrier-grade NAT.
 */
function ipv6Bucket(address) {
    const groups = expandIpv6(address)
    if (!groups) return null
    return `${groups
        .slice(0, 4)
        .map((group) => group.toString(16))
        .join(':')}::/64`
}

/**
 * A validated, canonical bucket key for one candidate address, or null when the
 * value is not an address at all.
 *
 * Returning null rather than the raw string is the point: without it, a caller
 * could put arbitrary text into a rate-limit key and into the audit trail's
 * actor_ip column simply by sending it in a header.
 */
export function canonicaliseIp(value) {
    if (!value) return null

    const host = stripPortAndBrackets(value)
    if (!host) return null

    // ::ffff:41.66.1.1 is an IPv4 address wearing an IPv6 hat. Folding it means
    // one client cannot occupy two buckets by switching representation.
    const mapped = /^::ffff:(.+)$/i.exec(host)
    if (mapped && isIP(mapped[1]) === 4) return mapped[1]

    const version = isIP(host)
    if (version === 4) return host
    if (version === 6) return ipv6Bucket(host)

    return null
}

/**
 * The header this deployment's platform sets and overwrites, or null when
 * nothing has established that there is one.
 */
function trustedHeaderName(env) {
    const configured = env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase()
    if (configured) return configured

    // Vercel sets VERCEL=1 in every deployment, and its edge overwrites
    // x-vercel-forwarded-for on the way in.
    if (env.VERCEL) return 'x-vercel-forwarded-for'

    return null
}

/**
 * The client address for rate limiting and audit.
 *
 * @param {{ get: (name: string) => string|null }} headers - request headers
 * @param {object} [env] - injectable environment, for tests
 * @returns {string} a canonical bucket key, or UNRESOLVED_IP
 */
export function resolveClientIp(headers, env = process.env) {
    const trusted = trustedHeaderName(env)

    if (trusted) {
        const raw = headers.get(trusted)
        if (raw) {
            // Platform-set, so the client is the FIRST entry: anything after it
            // was added by infrastructure closer to us. This is the opposite of
            // the untrusted fallback below, and deliberately so.
            const ip = canonicaliseIp(raw.split(',')[0])
            if (ip) return ip

            warnOnce(
                `trusted-header-unusable:${trusted}`,
                `[client-ip] ${trusted} is present but does not contain a usable address. ` +
                    'Falling back to x-forwarded-for.'
            )
        }
    } else if (env.NODE_ENV === 'production') {
        warnOnce(
            'no-trusted-source',
            '[client-ip] No trusted client-IP source is configured. Set TRUSTED_CLIENT_IP_HEADER ' +
                "to the header your proxy overwrites (on Vercel, VERCEL=1 is set for you). Until " +
                'then IP rate limits rest on x-forwarded-for, which only a proxy in front of this ' +
                'app can make trustworthy.'
        )
    }

    // Last resort. The right-most hop is the one appended by the nearest proxy,
    // rather than whatever a client prepended — correct behind exactly one
    // proxy, and the best available guess without one. Scanning right to left
    // skips a proxy that appended something unparseable instead of giving up.
    const forwarded = headers.get('x-forwarded-for')
    if (forwarded) {
        const hops = forwarded.split(',')
        for (let i = hops.length - 1; i >= 0; i -= 1) {
            const ip = canonicaliseIp(hops[i])
            if (ip) return ip
        }
    }

    warnOnce(
        'unresolved',
        '[client-ip] Could not establish a client address for a request. IP rate limiting and the ' +
            'registration device backstop are not effective for such requests.'
    )

    return UNRESOLVED_IP
}
