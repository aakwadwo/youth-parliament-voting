import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
    validateConstituencyName,
    escapeLikePattern,
    MAX_CONSTITUENCY_NAME_LENGTH,
} from '@/lib/constituency-name'
import { isValidName, normaliseName } from '@/lib/validation'

/**
 * Correcting a constituency's or a candidate's name from the admin portal.
 *
 * The property under test is that a correction is a RENAME and nothing else:
 * the record keeps its id, its relationships and every field the administrator
 * did not touch, and no second record appears. That property lives in the shape
 * of the two route handlers — an UPDATE filtered on the id, with a payload of
 * exactly one column — so alongside the unit tests of the validation rules,
 * these assert that shape against the source.
 *
 * Source-level assertions rather than live handler calls because the routes
 * import `next/server` and a service-role client and cannot be loaded by the
 * plain-Node runner. This is the same approach route-guards.test.mjs and
 * registration-vs-voting.test.mjs already take for the same reason. They prove
 * the mutation is an id-filtered single-column update and that nothing else is
 * written; they do not execute a query.
 */

const ROOT = process.cwd()
const read = (...parts) => readFileSync(path.join(ROOT, ...parts), 'utf8')

const CONSTITUENCY_ROUTE_PATH = ['src', 'app', 'api', 'admin', 'constituencies', '[id]', 'route.js']
const CANDIDATE_ROUTE_PATH = ['src', 'app', 'api', 'admin', 'candidates', '[id]', 'route.js']

const CONSTITUENCY_ROUTE = read(...CONSTITUENCY_ROUTE_PATH)
const CANDIDATE_ROUTE = read(...CANDIDATE_ROUTE_PATH)
const CONSTITUENCIES_UI = read('src', 'components', 'admin', 'Constituencies.jsx')
const CANDIDATES_UI = read('src', 'components', 'admin', 'Candidates.jsx')
const PROXY = read('src', 'proxy.js')

// ── Validation rules ─────────────────────────────────────────────────────────

test('a constituency name is accepted when it is a non-empty string', () => {
    for (const name of ['Accra Central', 'Tema West', 'Ho', 'A']) {
        assert.equal(validateConstituencyName(name), null, `${name} should be accepted`)
    }
})

test('constituency names keep the punctuation the real register uses', () => {
    // The register in production holds "Nalerigu/Gambaga", and the import
    // sample in the admin screen is "Sekondi, Takoradi". A rule that rejected
    // these would only ever fire on correct data.
    const punctuated = ['Nalerigu/Gambaga', 'Sekondi, Takoradi', 'Ho West (North)']

    for (const name of [...punctuated, 'Akim Oda-Swedru', "Ho'West"]) {
        assert.equal(validateConstituencyName(name), null, `${name} should be accepted`)
    }

    // And these are precisely the names the person-name rule throws out, which
    // is why the constituency route does not use it.
    for (const name of punctuated) {
        assert.equal(
            isValidName(name),
            false,
            `isValidName accepts ${name}, so this test no longer proves anything`
        )
    }
})

test('an empty or whitespace-only constituency name is refused', () => {
    for (const name of ['', '   ', '\t\n', null, undefined, 42, {}]) {
        assert.match(
            validateConstituencyName(name) ?? '',
            /required/,
            `${JSON.stringify(name)} should be refused`
        )
    }
})

test('an absurdly long constituency name is refused', () => {
    const tooLong = 'a'.repeat(MAX_CONSTITUENCY_NAME_LENGTH + 1)
    assert.match(validateConstituencyName(tooLong) ?? '', /longer than/)
    assert.equal(validateConstituencyName('a'.repeat(MAX_CONSTITUENCY_NAME_LENGTH)), null)
})

test('a constituency name is normalised before it is stored or compared', () => {
    assert.equal(normaliseName('  Accra   Central  '), 'Accra Central')
    // Leading/trailing space alone must not count as a change worth writing.
    assert.equal(normaliseName(' Ho '), 'Ho')
})

test('LIKE wildcards in a name are escaped before the duplicate check', () => {
    // Unescaped, a name containing % would match rows it should not and refuse
    // a rename that is perfectly valid.
    assert.equal(escapeLikePattern('100% Ho'), '100\\% Ho')
    assert.equal(escapeLikePattern('Ho_West'), 'Ho\\_West')
    assert.equal(escapeLikePattern('back\\slash'), 'back\\\\slash')
    assert.equal(escapeLikePattern('Accra Central'), 'Accra Central')
})

test('a candidate name still uses the person-name rule, unchanged', () => {
    assert.equal(isValidName('Kwame Mensah'), true)
    assert.equal(isValidName("N'Dri Kofi-Mensah"), true)
    assert.equal(isValidName('Robert Tables); DROP TABLE voters;--'), false)
    assert.equal(isValidName(''), false)
})

// ── The edit is an update, never an insert ───────────────────────────────────

for (const [label, source] of [
    ['constituency', CONSTITUENCY_ROUTE],
    ['candidate', CANDIDATE_ROUTE],
]) {
    test(`editing a ${label} cannot create a second record`, () => {
        assert.match(source, /\.update\(/, 'the edit must be an UPDATE')
        assert.ok(!/\.insert\(/.test(source), `${label} edit must never insert`)
        assert.ok(!/\.upsert\(/.test(source), `${label} edit must never upsert`)
    })

    test(`a ${label} edit is filtered on the record's own id`, () => {
        // Without the id filter an update rewrites every row in the table.
        assert.match(source, /\.eq\('id', id\)/, 'the update must target one row by id')
        assert.match(source, /isUUID\(id\)/, 'the id must be validated before it is used')
    })

    test(`a ${label} edit never writes the id itself`, () => {
        // Changing a primary key would orphan every row referencing it.
        assert.ok(
            !/update\(\{[^}]*\bid\b\s*:/s.test(source),
            'the update payload must not contain an id'
        )
    })

    test(`a ${label} edit touches no other table`, () => {
        const tables = [...source.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1])
        const expected = label === 'constituency' ? 'constituencies' : 'candidates'

        for (const table of tables) {
            assert.ok(
                table === expected || table === 'admin_audit_log',
                `${label} edit reads or writes ${table}, which it has no business touching`
            )
        }
        for (const forbidden of ['votes', 'voters', 'election_settings']) {
            assert.ok(
                !source.includes(`'${forbidden}'`),
                `${label} edit must never reference ${forbidden}`
            )
        }
    })
}

// ── Constituency: relationships and identity survive ─────────────────────────

test('the constituency route writes only the name', () => {
    // region, code and id are read back for the response but never assigned.
    assert.match(CONSTITUENCY_ROUTE, /\.update\(\{ name \}\)/)
    assert.ok(
        !/\.update\(\{[^}]*\b(code|region)\b\s*:/s.test(CONSTITUENCY_ROUTE),
        'a rename must not change the code or the region'
    )
})

test('a missing constituency is a 404, not a silent success', () => {
    assert.match(CONSTITUENCY_ROUTE, /jsonError\('Constituency not found\.', 404\)/)
})

test('a rename that clashes with another constituency is refused', () => {
    // Excluding self, so correcting only the capitalisation of a name is not
    // blocked by the row being renamed.
    assert.match(CONSTITUENCY_ROUTE, /\.neq\('id', id\)/)
    assert.match(CONSTITUENCY_ROUTE, /\.ilike\('name', escapeLikePattern\(name\)\)/)
    assert.match(CONSTITUENCY_ROUTE, /already called/)
})

test('renaming a constituency to its current name is a no-op, not an error', () => {
    assert.match(CONSTITUENCY_ROUTE, /before\.name === name/)
    assert.match(CONSTITUENCY_ROUTE, /unchanged: true/)
})

test('a constituency rename is recorded in the audit trail with the previous name', () => {
    assert.match(CONSTITUENCY_ROUTE, /AUDIT_ACTIONS\.CONSTITUENCY_UPDATED/)
    assert.match(CONSTITUENCY_ROUTE, /previous: \{ name: before\.name \}/)

    const auditLog = read('src', 'lib', 'audit-log.js')
    assert.match(auditLog, /CONSTITUENCY_UPDATED: 'constituency_updated'/)
})

// ── Candidate: relationships and identity survive ────────────────────────────

test('the candidate route only accepts an explicit allowlist of fields', () => {
    assert.match(
        CANDIDATE_ROUTE,
        /const ALLOWED_FIELDS = \['full_name', 'constituency_id', 'photo_url', 'is_active'\]/,
        'the allowlist is what stops a request setting a column the API never meant to expose'
    )
})

test('the candidate route leaves untouched every field it was not sent', () => {
    // The update object is built only from fields present in the body, so a
    // request carrying just full_name cannot disturb the photograph, the
    // standing status or the constituency.
    assert.match(CANDIDATE_ROUTE, /if \(body\?\.\[field\] !== undefined\) update\[field\] = body\[field\]/)
})

test('the candidate edit sends only the name, so the constituency cannot move', () => {
    assert.match(
        CANDIDATES_UI,
        /body: JSON\.stringify\(\{ full_name: fullName \}\)/,
        'the edit dialog must send the name alone'
    )
})

test('a candidate rename is normalised and validated server-side', () => {
    assert.match(CANDIDATE_ROUTE, /!isValidName\(update\.full_name\)/)
    assert.match(CANDIDATE_ROUTE, /update\.full_name = normaliseName\(update\.full_name\)/)
})

test('a missing candidate is a 404', () => {
    assert.match(CANDIDATE_ROUTE, /jsonError\('Candidate not found\.', 404\)/)
})

// ── Authorisation ────────────────────────────────────────────────────────────

test('both edit routes sit behind the existing admin gate', () => {
    // Replicating proxy.js's own predicate, so moving a route out from under
    // /api/admin — or adding it to the sign-in exemptions — fails here.
    const isAdminApi = (pathname) =>
        pathname.startsWith('/api/admin') &&
        pathname !== '/api/admin/login' &&
        pathname !== '/api/admin/logout'

    for (const pathname of [
        '/api/admin/constituencies/7c0a952e-daea-4d90-9134-8e0d0fc6ac21',
        '/api/admin/candidates/7c0a952e-daea-4d90-9134-8e0d0fc6ac21',
    ]) {
        assert.equal(isAdminApi(pathname), true, `${pathname} must be gated`)
    }

    // And the gate still refuses rather than redirecting for API paths.
    assert.match(PROXY, /if \(isAdminApi\) \{[\s\S]*?status: 401/)
    assert.match(PROXY, /await jwtVerify\(token, secret\)/)
})

test('an unauthenticated request never reaches either handler', () => {
    // proxy.js returns before calling next() when the admin token is absent or
    // invalid, so the handler is not merely refused — it does not run.
    assert.match(PROXY, /const token = request\.cookies\.get\('admin_token'\)\?\.value/)
    assert.match(PROXY, /catch \{\s*\/\/[^\n]*\n\s*\}/, 'an invalid token falls through to refusal')
})

test('both edit routes reject cross-origin mutations', () => {
    for (const [label, source] of [
        ['constituency', CONSTITUENCY_ROUTE],
        ['candidate', CANDIDATE_ROUTE],
    ]) {
        assert.match(
            source,
            /const crossOrigin = requireSameOrigin\(request\)\s*\n\s*if \(crossOrigin\) return crossOrigin/,
            `${label} edit is missing the CSRF origin check`
        )
    }
})

test('no edit control is exposed on a voter-facing page', () => {
    // The dialog and both routes are admin-only surfaces. If this fails, an
    // edit control has leaked onto a screen a voter can reach.
    for (const file of [
        ['src', 'app', 'register', 'page.jsx'],
        // The form was split out of page.jsx when the constituency list moved
        // to a server read; the guarantee has to follow it.
        ['src', 'app', 'register', 'RegisterForm.jsx'],
        ['src', 'app', 'login', 'LoginForm.jsx'],
        ['src', 'app', 'vote', 'candidates', 'Ballot.jsx'],
        ['src', 'app', 'results', 'page.jsx'],
    ]) {
        const source = read(...file)
        assert.ok(
            !source.includes('EditNameDialog'),
            `${file.join('/')} must not carry an edit control`
        )
        assert.ok(
            !/\/api\/admin\//.test(source),
            `${file.join('/')} must not call an admin API`
        )
    }
})

// ── The dialog itself ────────────────────────────────────────────────────────

test('the edit dialog is shared by both sections', () => {
    const dialog = read('src', 'components', 'admin', 'EditNameDialog.jsx')
    assert.match(dialog, /^'use client'/)
    assert.match(CONSTITUENCIES_UI, /import \{ EditNameDialog \}/)
    assert.match(CANDIDATES_UI, /import \{ EditNameDialog \}/)
})

test('the dialog resets between records rather than showing the previous name', () => {
    const dialog = read('src', 'components', 'admin', 'EditNameDialog.jsx')
    assert.match(dialog, /if \(recordId !== shownFor\)/)
    assert.match(CONSTITUENCIES_UI, /recordId=\{editing\?\.id \?\? null\}/)
    assert.match(CANDIDATES_UI, /recordId=\{editing\?\.id \?\? null\}/)
})

test('both sections report success and failure, and refresh the list', () => {
    for (const [label, source, reload] of [
        ['constituencies', CONSTITUENCIES_UI, 'reload()'],
        ['candidates', CANDIDATES_UI, 'reloadCandidates()'],
    ]) {
        assert.match(source, /setEditError\(data\.error \?\?/, `${label} shows the server's error`)
        assert.match(source, /setSuccessMessage\(/, `${label} shows a success message`)
        assert.ok(source.includes(reload), `${label} refreshes the list after saving`)
    }
})

test('the constituency dialog does not apply the person-name rule', () => {
    // Guards the specific regression: using isValidName here would refuse
    // "Nalerigu/Gambaga", a constituency the platform already serves.
    const dialogBlock = CONSTITUENCIES_UI.slice(CONSTITUENCIES_UI.indexOf('<EditNameDialog'))
    assert.ok(!dialogBlock.includes('isValidName'))
    assert.match(dialogBlock, /normaliseName\(value\)/)
})
