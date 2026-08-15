import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
    maskPhone,
    toAdminVoterView,
    parseVoterSearch,
    pickConstituencyUpdate,
    constituencyChangeAudit,
    ADMIN_VOTER_COLUMNS,
} from '@/lib/voter-admin'
import { AUDIT_ACTIONS } from '@/lib/audit-log'
import { RATE_LIMITS } from '@/lib/rate-limit'

/**
 * Admin voter management.
 *
 * Two properties are under test, and they are the two that would matter in an
 * election petition:
 *
 *   1. An administrator can see enough to identify the right voter, and no
 *      more. The credential a voter signs in with is their date of birth
 *      alongside their phone number, and this endpoint never returns both: the
 *      date of birth is exposed to superadmins so the Commission can read back
 *      what the register actually holds, and the phone number is masked to its
 *      last three digits so the pair is never complete.
 *
 *   2. The edit is a constituency correction and nothing else. The record keeps
 *      its id, name, number, date of birth, registration time, verification
 *      state and voting state, no voter is created, and none is deleted.
 *
 * The pure rules are exercised directly. The route shape is asserted against
 * the source, because the routes import `next/server` and a service-role client
 * and cannot be loaded by the plain-Node runner — the same approach
 * admin-name-edits.test.mjs and registration-vs-voting.test.mjs already take.
 */

const ROOT = process.cwd()
const read = (...parts) => readFileSync(path.join(ROOT, ...parts), 'utf8')

/**
 * The source with its prose removed.
 *
 * These files document what they deliberately do NOT do — "there is no upsert
 * here", "the date of birth is never shown" — so a test that greps the raw text
 * for a forbidden token finds the sentence promising not to use it and fails.
 * Only whole-line `//` comments are stripped, never trailing ones, so a `//`
 * inside a string literal cannot be mistaken for a comment.
 */
function codeOnly(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
}

const SEARCH_ROUTE = read('src', 'app', 'api', 'admin', 'voters', 'route.js')
const PATCH_ROUTE = read('src', 'app', 'api', 'admin', 'voters', '[id]', 'route.js')
const UI = read('src', 'components', 'admin', 'Voters.jsx')
const SEARCH_CODE = codeOnly(SEARCH_ROUTE)
const PATCH_CODE = codeOnly(PATCH_ROUTE)
const UI_CODE = codeOnly(UI)
const ADMIN_SESSION = read('src', 'lib', 'admin-session.js')
const PROXY = read('src', 'proxy.js')

/** A `voters` row as the routes select it, standing in for a real registration. */
const ROW = {
    id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Ama Serwaa',
    voter_phone: '0241234567',
    voter_dob: '2004-03-14',
    constituency_id: '22222222-2222-4222-8222-222222222222',
    registered_at: '2026-08-12T10:00:00.000Z',
    has_voted: false,
    is_verified: true,
    constituencies: { name: 'Tema West' },
}

// ── What an administrator may see ────────────────────────────────────────────

test('the phone number is masked to its last three digits', () => {
    assert.equal(maskPhone('0241234567'), '•••••••567')
    // Length is preserved, so a number of the wrong shape is visibly wrong.
    assert.equal(maskPhone('0241234567').length, '0241234567'.length)
    assert.equal(maskPhone('024 123 4567'), '•••••••567')
    assert.equal(maskPhone(''), '')
    assert.equal(maskPhone(null), '')
    assert.equal(maskPhone('12'), '••')
})

test('the voter view never carries a raw phone number', () => {
    const view = toAdminVoterView(ROW)
    const serialised = JSON.stringify(view)

    assert.ok(!('voter_phone' in view), 'the view exposes voter_phone')
    assert.ok(!serialised.includes('0241234567'), 'the full phone number reached the payload')
    assert.equal(view.phone_masked, '•••••••567')
})

test('the voter view carries the stored date of birth, exactly as stored', () => {
    // Deliberately exposed to superadmins so the Commission can read back what
    // the register actually holds — a registration carrying a date of birth the
    // voter never chose cannot be diagnosed otherwise. It is the masked phone
    // number beside it that stops this being a usable credential pair.
    const view = toAdminVoterView(ROW)

    assert.equal(view.voter_dob, '2004-03-14')
    // Never reformatted, defaulted or derived on the way out: the value shown
    // has to be the value stored, or it cannot be used to resolve a mismatch.
    assert.equal(view.voter_dob, ROW.voter_dob)
    assert.equal(toAdminVoterView({ ...ROW, voter_dob: null }).voter_dob, null)
    assert.equal(toAdminVoterView({ ...ROW, voter_dob: undefined }).voter_dob, null)
})

test('the voter view carries exactly the fields needed to identify a registration', () => {
    const view = toAdminVoterView(ROW)

    // An allow-list, asserted as one. A new column on `voters` must not appear
    // here by accident.
    assert.deepEqual(Object.keys(view).sort(), [
        'constituency_id',
        'constituency_name',
        'full_name',
        'has_voted',
        'id',
        'is_verified',
        'phone_masked',
        'registered_at',
        'voter_dob',
    ])

    assert.equal(view.full_name, 'Ama Serwaa')
    assert.equal(view.constituency_name, 'Tema West')
    assert.equal(view.has_voted, false)
    assert.equal(view.is_verified, true)
    assert.equal(view.registered_at, '2026-08-12T10:00:00.000Z')
})

test('the voter view does not pass through unknown columns', () => {
    // The defence against "someone adds a column and it silently ships".
    const view = toAdminVoterView({ ...ROW, secret_note: 'should not appear', ssn: 'nope' })
    assert.ok(!('secret_note' in view))
    assert.ok(!('ssn' in view))
})

test('a missing row produces no view at all', () => {
    assert.equal(toAdminVoterView(null), null)
    assert.equal(toAdminVoterView(undefined), null)
})

test('the selected columns cover exactly what the view renders', () => {
    assert.ok(ADMIN_VOTER_COLUMNS.includes('voter_dob'), 'the date of birth is not selected')
    assert.ok(ADMIN_VOTER_COLUMNS.includes('voter_phone'), 'the number is needed to mask it')

    // The projection is what stops a column added to `voters` later riding out
    // on this endpoint. Asserted as a closed list for that reason.
    assert.deepEqual(
        ADMIN_VOTER_COLUMNS.split(',').map((c) => c.trim()).sort(),
        [
            'constituencies(name)',
            'constituency_id',
            'full_name',
            'has_voted',
            'id',
            'is_verified',
            'registered_at',
            'voter_dob',
            'voter_phone',
        ]
    )
})

// ── Search ───────────────────────────────────────────────────────────────────

test('search accepts a Ghana mobile number in the formats people type', () => {
    assert.deepEqual(parseVoterSearch('0241234567'), { phone: '0241234567' })
    assert.deepEqual(parseVoterSearch('024 123 4567'), { phone: '0241234567' })
    assert.deepEqual(parseVoterSearch('024-123-4567'), { phone: '0241234567' })
})

test('search refuses anything that is not a phone number', () => {
    for (const bad of ['', '   ', 'Ama Serwaa', '123', null, undefined, 42, {}]) {
        const result = parseVoterSearch(bad)
        assert.ok(result.error, `${JSON.stringify(bad)} should be refused`)
        assert.ok(!('phone' in result))
    }
})

test('there is no way to search the register by name', () => {
    // The scope guarantee. A name search over the register is a browsable
    // electoral roll, which is the thing the whole admin portal has been built
    // not to be.
    // `.or(` rather than `or(`, which is a substring of `jsonError(`.
    for (const forbidden of ['ilike', '.like(', 'textSearch', '.or(', 'full_name)']) {
        assert.ok(
            !SEARCH_CODE.includes(forbidden),
            `the search route references "${forbidden}"`
        )
    }
    assert.match(SEARCH_ROUTE, /\.eq\('voter_phone', parsed\.phone\)/)
    assert.match(SEARCH_ROUTE, /\.maybeSingle\(\)/)
})

test('the search endpoint is rate limited, keyed to the admin', () => {
    assert.match(SEARCH_ROUTE, /rateLimit\('admin-voter-search'/)
    assert.match(SEARCH_ROUTE, /RATE_LIMITS\.adminVoterSearch/)
    assert.ok(RATE_LIMITS.adminVoterSearch.limit > 0)
    assert.equal(RATE_LIMITS.adminVoterSearch.window, '15 m')
    // Keyed by admin id, not IP: an attacker holding a stolen session can move
    // address freely, so an IP-keyed limit would bound nothing.
    assert.match(SEARCH_ROUTE, /admin\.id \?\? ip/)
})

// ── What an administrator may write ──────────────────────────────────────────

test('the update accepts a constituency id and nothing else', () => {
    const id = '22222222-2222-4222-8222-222222222222'
    assert.deepEqual(pickConstituencyUpdate({ constituency_id: id }), { constituencyId: id })
})

test('the update refuses a body naming any other column', () => {
    const id = '22222222-2222-4222-8222-222222222222'

    // Every field the feature promises never to touch, each attempted
    // alongside a legitimate constituency change.
    for (const field of [
        'has_voted',
        'is_verified',
        'verification_method',
        'voter_phone',
        'voter_dob',
        'full_name',
        'registered_at',
        'id',
    ]) {
        const result = pickConstituencyUpdate({ constituency_id: id, [field]: 'anything' })
        assert.ok(result.error, `a body carrying ${field} was accepted`)
        assert.ok(
            result.error.includes(field),
            `the refusal should name the offending field (${field})`
        )
        assert.ok(!('constituencyId' in result), `${field} produced a usable update anyway`)
    }
})

test('the update refuses a body with no valid constituency id', () => {
    for (const bad of [
        {},
        { constituency_id: '' },
        { constituency_id: 'not-a-uuid' },
        { constituency_id: 123 },
        { constituency_id: null },
    ]) {
        assert.ok(pickConstituencyUpdate(bad).error, `${JSON.stringify(bad)} was accepted`)
    }

    for (const bad of [null, undefined, 'string', 42, []]) {
        assert.ok(pickConstituencyUpdate(bad).error, `${JSON.stringify(bad)} was accepted`)
    }
})

test('the route issues exactly one write, and it is one column filtered on the id', () => {
    // The property the whole feature rests on, asserted against the source.
    assert.match(
        PATCH_ROUTE,
        /\.from\('voters'\)\s*\.update\(\{ constituency_id: picked\.constituencyId \}\)\s*\.eq\('id', id\)/,
        'the update is not a single-column, id-filtered UPDATE'
    )

    const updates = PATCH_ROUTE.match(/\.update\(/g) ?? []
    assert.equal(updates.length, 1, 'more than one update statement')
})

test('the route can neither create nor delete a voter', () => {
    for (const forbidden of ['.insert(', '.upsert(', '.delete(', '.rpc(']) {
        assert.ok(!PATCH_CODE.includes(forbidden), `the route performs ${forbidden}`)
        assert.ok(!SEARCH_CODE.includes(forbidden), `the search route performs ${forbidden}`)
    }
})

test('the route never touches ballots', () => {
    for (const source of [PATCH_CODE, SEARCH_CODE]) {
        assert.ok(!source.includes("'votes'"), 'a voter route references the votes table')
        assert.ok(!source.includes('cast_vote'), 'a voter route references cast_vote')
        assert.ok(!source.includes('has_voted:'), 'a voter route writes has_voted')
    }
})

test('a voter who has already voted cannot be moved', () => {
    assert.match(PATCH_ROUTE, /if \(before\.has_voted === true\)/)
    assert.match(PATCH_ROUTE, /409,\s*ERROR_CODES\.ALREADY_VOTED/)
    // And the refusal is decided before the update is reached.
    assert.ok(
        PATCH_ROUTE.indexOf('before.has_voted === true') < PATCH_ROUTE.indexOf('.update({'),
        'the has_voted refusal must precede the write'
    )
})

test('the target constituency is verified to exist before the voter is moved', () => {
    const lookup = PATCH_ROUTE.indexOf("from('constituencies')")
    const update = PATCH_ROUTE.indexOf('.update({')
    assert.ok(lookup > 0 && update > 0 && lookup < update)
    assert.match(PATCH_ROUTE, /That constituency does not exist\./)
})

test('the record is read before it is written, so the audit has the previous value', () => {
    const readIndex = PATCH_ROUTE.indexOf("from('voters')\n        .select(ADMIN_VOTER_COLUMNS)")
    const update = PATCH_ROUTE.indexOf('.update({')
    assert.ok(readIndex > 0 && readIndex < update, 'the route writes before it reads')
})

// ── Authorisation ────────────────────────────────────────────────────────────

test('both routes are superadmin-only, on top of the session gate in middleware', () => {
    for (const [label, source] of [['search', SEARCH_ROUTE], ['patch', PATCH_ROUTE]]) {
        assert.match(source, /requireSuperadmin\(request\)/, `${label} has no role check`)
        assert.match(source, /if \(!allowed\)/, `${label} does not act on the role check`)
        assert.match(source, /403/, `${label} does not refuse with a 403`)
    }

    assert.match(ADMIN_SESSION, /export const SUPERADMIN_ROLE = 'superadmin'/)
    assert.match(ADMIN_SESSION, /admin\?\.role === SUPERADMIN_ROLE/)

    // The middleware gate the role check sits behind is still in place.
    assert.match(PROXY, /pathname\.startsWith\('\/api\/admin'\)/)
    assert.match(PROXY, /jwtVerify\(token, secret\)/)
})

test('the write is refused cross-origin', () => {
    assert.match(
        PATCH_ROUTE,
        /const crossOrigin = requireSameOrigin\(request\)\s*\n\s*if \(crossOrigin\) return crossOrigin/
    )
    // And it is the very first thing the handler does.
    assert.ok(
        PATCH_CODE.indexOf('requireSameOrigin(request)') <
            PATCH_CODE.indexOf('requireSuperadmin(request)')
    )
})

test('the id in the URL must be a UUID before anything is read', () => {
    assert.match(PATCH_ROUTE, /if \(!isUUID\(id\)\)/)
    assert.ok(PATCH_ROUTE.indexOf('isUUID(id)') < PATCH_ROUTE.indexOf("from('voters')"))
})

test('neither route may be cached anywhere', () => {
    // Voter data must never be held by a CDN, a proxy or the back/forward cache
    // on a shared machine.
    for (const [label, source] of [['search', SEARCH_ROUTE], ['patch', PATCH_ROUTE]]) {
        assert.match(source, /jsonNoStore\(/, `${label} returns a cacheable success`)
        assert.match(source, /noStore\(/, `${label} returns a cacheable error`)
        assert.ok(!codeOnly(source).includes('max-age'), `${label} sets a cache lifetime`)
    }
})

// ── Audit ────────────────────────────────────────────────────────────────────

test('the change is recorded with the previous and the new constituency', () => {
    const entry = constituencyChangeAudit({
        voterId: ROW.id,
        before: { constituency_id: 'old-id', constituency_name: 'Tema West' },
        after: { constituency_id: 'new-id', constituency_name: 'Ho Central' },
    })

    assert.equal(entry.entity, 'voter')
    assert.equal(entry.voter_id, ROW.id)
    assert.deepEqual(entry.previous, {
        constituency_id: 'old-id',
        constituency_name: 'Tema West',
    })
    assert.deepEqual(entry.next, { constituency_id: 'new-id', constituency_name: 'Ho Central' })
})

test('the audit entry carries nothing that identifies the voter', () => {
    const entry = constituencyChangeAudit({
        voterId: ROW.id,
        before: { ...toAdminVoterView(ROW), constituency_name: 'Tema West' },
        after: { constituency_id: 'new-id', constituency_name: 'Ho Central' },
    })
    const serialised = JSON.stringify(entry)

    // The audit log is served wholesale by /api/admin/audit-log and rendered in
    // the Settings section. A name or a number in `details` would turn a log
    // viewer into the register browser this feature is designed not to be.
    assert.ok(!serialised.includes('Ama Serwaa'), 'the voter name reached the audit entry')
    assert.ok(!serialised.includes('0241234567'), 'the phone number reached the audit entry')
    assert.ok(!serialised.includes('567'), 'even the masked number reached the audit entry')
    assert.ok(!serialised.includes('2004-03-14'), 'the date of birth reached the audit entry')
})

test('the action is registered, and the write is audited with the acting admin', () => {
    assert.equal(AUDIT_ACTIONS.VOTER_CONSTITUENCY_CHANGED, 'voter_constituency_changed')
    assert.match(PATCH_ROUTE, /AUDIT_ACTIONS\.VOTER_CONSTITUENCY_CHANGED/)
    assert.match(PATCH_ROUTE, /actor: admin\?\.email \?\? null/)
    assert.match(PATCH_ROUTE, /ip: getClientIp\(request\)/)
    // Audited after the write succeeded, never before.
    assert.ok(PATCH_CODE.indexOf('.update({') < PATCH_CODE.indexOf('await logAdminAction('))
})

test('a no-op is not audited', () => {
    // An entry recording a change that did not happen makes the trail harder to
    // read in the one situation it exists for.
    const noop = PATCH_CODE.indexOf('unchanged: true')
    const audit = PATCH_CODE.indexOf('await logAdminAction(')
    assert.ok(noop > 0 && noop < audit, 'the no-op path should return before the audit')
})

test('no voter data is handed to Sentry', () => {
    // `dbError` reports the Postgres error and is given nothing else; nothing
    // in either route passes a row or a search term into a capture call.
    for (const source of [SEARCH_CODE, PATCH_CODE]) {
        assert.ok(!source.includes('captureException'), 'a route reports to Sentry directly')
        assert.ok(!source.includes('setContext'), 'a route attaches Sentry context')
        assert.ok(!source.includes('setUser'), 'a route attaches a Sentry user')
    }
})

// ── The screen ───────────────────────────────────────────────────────────────

test('the admin screen cannot display a full phone number', () => {
    // The half of the credential that stays hidden. Showing the date of birth
    // beside a masked number is a record; showing it beside a full number would
    // be a working sign-in.
    assert.ok(!UI_CODE.includes('voter_phone'), 'the screen references voter_phone')
    assert.match(UI, /phone_masked/)
})

test('the admin screen shows the stored date of birth, read-only', () => {
    assert.match(UI_CODE, /Date of birth/, 'the date of birth is not labelled on screen')
    assert.match(UI_CODE, /voter\.voter_dob/, 'the date of birth is not read from the record')

    // Displayed, never edited. The only writable control on this screen is the
    // constituency picker, and the PATCH body is asserted below to be one key.
    assert.ok(
        !/onChange=\{[^}]*voter_dob/.test(UI_CODE),
        'the date of birth is wired to a change handler'
    )
    assert.ok(!/name="voter_dob"/.test(UI_CODE), 'the date of birth is rendered as a form field')
    assert.ok(!/type="date"/.test(UI_CODE), 'the screen renders a date input')
})

test('the screen sends a body of exactly one key', () => {
    assert.match(UI, /JSON\.stringify\(\{ constituency_id: pendingConstituency\.id \}\)/)
    assert.match(UI, /method: 'PATCH'/)
})

test('the screen offers no way to create or delete a voter', () => {
    for (const forbidden of ["method: 'POST'", "method: 'DELETE'", "method: 'PUT'"]) {
        assert.ok(!UI.includes(forbidden), `the screen issues ${forbidden}`)
    }
})

test('a consequential change is confirmed before it is sent', () => {
    assert.match(UI, /ConfirmDialog/)
    assert.match(UI, /onConfirm=\{handleConfirmChange\}/)
})

test('the section is reachable from the admin portal', () => {
    const page = read('src', 'app', 'admin', 'page.jsx')
    assert.match(page, /import Voters from '@\/components\/admin\/Voters'/)
    assert.match(page, /key: 'voters'.*Component: Voters/)
})

test('nothing about voter lookup leaked onto a voter-facing page', () => {
    for (const file of [
        ['src', 'app', 'register', 'page.jsx'],
        ['src', 'app', 'register', 'RegisterForm.jsx'],
        ['src', 'app', 'login', 'LoginForm.jsx'],
        ['src', 'app', 'vote', 'candidates', 'Ballot.jsx'],
        ['src', 'app', 'results', 'page.jsx'],
        ['src', 'app', 'page.js'],
    ]) {
        const source = read(...file)
        assert.ok(
            !source.includes('/api/admin/'),
            `${file.join('/')} calls an admin API`
        )
        assert.ok(
            !/from '@\/components\/admin\//.test(source),
            `${file.join('/')} imports an admin component`
        )
    }
})
