import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The caching added to cut repeated database round trips, and — far more
 * importantly — the boundary it must not cross.
 *
 * The election state is read for two completely different purposes. One decides
 * what a browser tab is called. The other decides whether a ballot may be cast.
 * The first is cached for fifteen seconds; the second must never be cached at
 * all, because a stale answer there is a ballot accepted after the poll has
 * closed. These tests exist to make that separation something a change has to
 * break loudly.
 *
 * Source-level, because `election-server.js` imports `next/server` (via
 * `@/lib/http`) and cannot be loaded by the plain-Node runner.
 */

const ROOT = process.cwd()
const read = (...parts) => readFileSync(path.join(ROOT, ...parts), 'utf8')

const ELECTION_SERVER = read('src', 'lib', 'election-server.js')
const LAYOUT = read('src', 'app', 'layout.js')
const USE_FETCH = read('src', 'lib', 'useFetch.js')
const CONSTITUENCIES_UI = read('src', 'components', 'admin', 'Constituencies.jsx')
const CANDIDATES_UI = read('src', 'components', 'admin', 'Candidates.jsx')
const REGISTER_ROUTE = read('src', 'app', 'api', 'register', 'route.js')

/** Whole-line comments removed, so prose about a rule is not mistaken for it. */
function codeOnly(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
}

const ELECTION_SERVER_CODE = codeOnly(ELECTION_SERVER)

// ── The election metadata cache, and what it must not touch ──────────────────

test('the metadata read is cached for fifteen seconds', () => {
    assert.match(ELECTION_SERVER, /const METADATA_TTL_MS = 15 \* 1000/)
    assert.match(ELECTION_SERVER, /export async function readElectionForMetadata/)
    assert.match(ELECTION_SERVER_CODE, /metadataCache\.expiresAt > now/)
})

test('the voting gate is not cached, and does not go near the cached reader', () => {
    // The one assertion in this file that actually matters.
    const gate = ELECTION_SERVER_CODE.slice(
        ELECTION_SERVER_CODE.indexOf('export async function requireVotingOpen')
    )

    assert.ok(gate.length > 0, 'requireVotingOpen has moved or been renamed')
    assert.ok(
        !gate.includes('readElectionForMetadata'),
        'the voting gate reads the cached election state'
    )
    assert.ok(!gate.includes('metadataCache'), 'the voting gate touches the metadata cache')
    assert.match(gate, /await readElection\(client\)/)
})

test('nothing that gates a ballot uses the cached reader', () => {
    // Every server-side surface that decides whether voting is possible.
    for (const file of [
        ['src', 'app', 'api', 'vote', 'route.js'],
        ['src', 'app', 'api', 'login', 'route.js'],
        ['src', 'app', 'api', 'candidates', 'route.js'],
        ['src', 'app', 'vote', 'candidates', 'page.jsx'],
        ['src', 'app', 'login', 'page.jsx'],
        ['src', 'app', 'api', 'election', 'route.js'],
    ]) {
        const source = read(...file)
        assert.ok(
            !source.includes('readElectionForMetadata'),
            `${file.join('/')} reads a cached election state`
        )
    }
})

test('only the root layout uses the cached reader, and only for a title', () => {
    assert.match(LAYOUT, /readElectionForMetadata/)
    assert.ok(
        !LAYOUT.includes('isVotingOpen'),
        'the layout makes a voting-window decision from a cached value'
    )
    // The read is still guarded: a metadata function that throws takes the
    // whole page down, including pages that need no database at all.
    assert.match(LAYOUT, /try \{[\s\S]*readElectionForMetadata\(\)[\s\S]*\} catch/)
})

test('a failed metadata read is not cached', () => {
    // Caching a failure would hold the fallback name for fifteen seconds after
    // the database recovered.
    const fn = ELECTION_SERVER_CODE.slice(
        ELECTION_SERVER_CODE.indexOf('export async function readElectionForMetadata'),
        ELECTION_SERVER_CODE.indexOf('export function __resetElectionMetadataCache')
    )
    assert.match(fn, /if \(error\) return null/)
    // The assignment to the cache happens after the error check, not before.
    assert.ok(fn.indexOf('if (error) return null') < fn.indexOf('metadataCache = {'))
})

test('force-dynamic is still in place, because the CSP nonce depends on it', () => {
    // Removing this is how every page in the app silently ships without a nonce
    // and has its JavaScript blocked.
    assert.match(LAYOUT, /export const dynamic = 'force-dynamic'/)
})

// ── The admin fetch cache ────────────────────────────────────────────────────

test('the admin fetch cache is opt-in and off by default', () => {
    assert.match(USE_FETCH, /cacheTtl = 0/)
    assert.match(USE_FETCH, /if \(useCache && cacheTtl > 0\)/)
})

test('reload always bypasses the cache', () => {
    // "Try again" and the post-mutation refresh exist precisely to get a fresh
    // answer, so neither may be served a stored copy.
    assert.match(USE_FETCH, /const reload = useCallback\(\(\) => load\(\{ useCache: false \}\)/)
})

test('a failed read drops any stored copy', () => {
    assert.match(USE_FETCH, /if \(cacheTtl > 0\) cache\.delete\(url\)/)
})

test('the section that edits constituencies neither caches nor keeps a stale copy', () => {
    // Constituencies.jsx owns the list. It must read fresh, and it must drop the
    // copy the read-only sections share whenever it writes.
    const hook = CONSTITUENCIES_UI.slice(
        CONSTITUENCIES_UI.indexOf("useFetch('/api/admin/constituencies'"),
        CONSTITUENCIES_UI.indexOf("useFetch('/api/admin/constituencies'") + 300
    )
    assert.ok(!hook.includes('cacheTtl'), 'the editing section caches the list it edits')

    const invalidations = CONSTITUENCIES_UI.match(
        /invalidateFetch\('\/api\/admin\/constituencies'\)/g
    )
    const reloads = CONSTITUENCIES_UI.match(/\n\s*reload\(\)/g)
    assert.ok(invalidations, 'the editing section never invalidates the shared copy')
    assert.equal(
        invalidations.length,
        reloads.length,
        'every refresh after a write must also drop the shared copy'
    )
})

test('the read-only consumer of the constituency list does cache it', () => {
    assert.match(CANDIDATES_UI, /useFetch\('\/api\/admin\/constituencies', \{[\s\S]*?cacheTtl:/)
})

// ── Shared-cache headers on the voter-facing GET routes ──────────────────────

test('every cacheable voter-facing GET states s-maxage, not just max-age', () => {
    // `max-age` alone reliably reaches only the browser; `s-maxage` is what a
    // shared cache in front of the app keys on. The candidates list has one
    // variant per constituency, so without it a whole electorate voting in a
    // day produces roughly one origin request per voter rather than one per
    // constituency per minute.
    const ROUTES = {
        'api/candidates': [read('src', 'app', 'api', 'candidates', 'route.js'), 60],
        'api/election': [read('src', 'app', 'api', 'election', 'route.js'), 15],
        'api/constituencies': [read('src', 'app', 'api', 'constituencies', 'route.js'), 300],
    }

    for (const [name, [source, seconds]] of Object.entries(ROUTES)) {
        assert.match(
            source,
            new RegExp(`max-age=${seconds}, s-maxage=${seconds}`),
            `${name} does not pair max-age with a matching s-maxage`
        )
    }
})

test('a cached ballot paper can never produce an accepted ballot', () => {
    // The safety argument for caching the candidate list at all: the window is
    // re-checked inside the transaction that writes the vote, so a list served
    // from cache after the poll closed cannot turn into a counted ballot.
    const castVote = read('migrations', '0008_harden_cast_vote.up.sql')
    assert.match(castVote, /v_settings\.voting_closes_at < now\(\)/)
    assert.match(castVote, /return query select false, 'voting_ended'/)

    // And nothing that refuses a request is ever cacheable.
    const candidates = read('src', 'app', 'api', 'candidates', 'route.js')
    assert.match(candidates, /noStore\(\s*\n?\s*jsonError/)
    assert.match(candidates, /const \{ response: refusal \} = await requireVotingOpen\(\)/)
})

// ── One fewer round trip on the hottest path ─────────────────────────────────

test('registration no longer reads the voters table before writing to it', () => {
    const code = codeOnly(REGISTER_ROUTE)
    const voterStatements = code.match(/\.from\('voters'\)/g) ?? []
    assert.equal(voterStatements.length, 1, 'registration touches `voters` more than once')
    assert.match(code, /\.from\('voters'\)\s*\.insert\(\{/)
})

test('the duplicate-phone refusal is unchanged in wording, status and code', () => {
    assert.match(
        REGISTER_ROUTE,
        /const ALREADY_REGISTERED =\s*'This phone number is already registered\. Please sign in instead\.'/
    )
    assert.match(REGISTER_ROUTE, /error\.code === PG_UNIQUE_VIOLATION/)
    assert.match(REGISTER_ROUTE, /jsonError\(ALREADY_REGISTERED, 409, ERROR_CODES\.ALREADY_REGISTERED\)/)
})
