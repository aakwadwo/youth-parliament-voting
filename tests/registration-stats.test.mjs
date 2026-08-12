import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { buildRegistrationReport, registrationReportFilename } from '@/lib/registration-report'
import { renderRegistrationStatsPdf } from '@/lib/export/registration-stats-pdf'
import { pdfText } from './fixtures/pdf-text.mjs'

/**
 * Registered voters by constituency: the admin figures and the PDF built from
 * them.
 *
 * The builder is a plain function over a Supabase client, so these are real
 * behavioural tests driven by a stub — the counts, the reconciliation and the
 * privacy guarantee are all exercised, not asserted from source. The PDF is
 * genuinely rendered and its text extracted, so "the report contains the
 * constituency names and no voter details" is checked against the bytes an
 * administrator would actually download.
 */

const ROOT = process.cwd()

// ── A stub register ──────────────────────────────────────────────────────────

/** Voters, as individual rows — the shape the database holds but never returns. */
const VOTERS = [
    { full_name: 'Ama Serwaa', constituency: 'c1' },
    { full_name: 'Kwame Mensah', constituency: 'c1' },
    { full_name: 'Yaw Boateng', constituency: 'c1' },
    { full_name: 'Akosua Danso', constituency: 'c2' },
    { full_name: 'Kofi Owusu', constituency: 'c2' },
    // c3 has candidates but nobody registered; c4 is brand new.
]

const CONSTITUENCIES = [
    { id: 'c1', name: 'Ablekuma Central', region: 'Greater Accra', code: 1 },
    { id: 'c2', name: 'Bantama', region: 'Ashanti', code: 2 },
    { id: 'c3', name: 'Cape Coast North', region: 'Central', code: 3 },
    { id: 'c4', name: 'Damongo', region: 'Savannah', code: 4 },
]

/**
 * Stands in for Postgres, computing the aggregates the way migration 0009 does:
 * `get_constituency_turnout` starts FROM constituencies and LEFT JOINs the
 * register, so a constituency with nobody registered still returns a row.
 */
function makeSupabase({ voters = VOTERS, constituencies = CONSTITUENCIES, totalOverride } = {}) {
    const calls = []

    const turnout = constituencies
        .map((c) => ({
            constituency_id: c.id,
            constituency_name: c.name,
            region: c.region,
            code: c.code,
            registered: voters.filter((v) => v.constituency === c.id).length,
            verified: voters.filter((v) => v.constituency === c.id).length,
            voted: 0,
            ballots: 0,
            candidates: 0,
        }))
        .sort((a, b) => a.constituency_name.localeCompare(b.constituency_name, 'en'))

    return {
        calls,
        from: () => ({
            select: () => ({
                maybeSingle: async () => ({
                    data: { election_name: 'Test Election 2026' },
                    error: null,
                }),
            }),
        }),
        rpc: async (name) => {
            calls.push(name)
            if (name === 'get_election_stats') {
                return {
                    data: [{ total_registered: totalOverride ?? voters.length }],
                    error: null,
                }
            }
            if (name === 'get_constituency_turnout') return { data: turnout, error: null }
            throw new Error(`unexpected rpc ${name}`)
        },
    }
}

const buildDefault = () => buildRegistrationReport(makeSupabase(), { generatedBy: 'ec@example.gh' })

// ── Counts ───────────────────────────────────────────────────────────────────

test('1. the total is the count of registered voters', async () => {
    const report = await buildDefault()
    assert.equal(report.summary.totalRegistered, 5)
})

test('2. each constituency carries its own count', async () => {
    const report = await buildDefault()
    const byName = Object.fromEntries(report.constituencies.map((c) => [c.name, c.registered]))

    assert.deepEqual(byName, {
        'Ablekuma Central': 3,
        Bantama: 2,
        'Cape Coast North': 0,
        Damongo: 0,
    })
})

test('3. constituencies with nobody registered are still listed', async () => {
    const report = await buildDefault()

    assert.equal(report.constituencies.length, 4, 'every constituency appears')
    const empty = report.constituencies.filter((c) => c.registered === 0).map((c) => c.name)
    assert.deepEqual(empty, ['Cape Coast North', 'Damongo'])
    assert.equal(report.summary.constituenciesWithNone, 2)
    assert.equal(report.summary.constituenciesWithRegistrations, 2)
})

test('4. the constituency counts sum to the overall total', async () => {
    const report = await buildDefault()
    const sum = report.constituencies.reduce((n, c) => n + c.registered, 0)

    assert.equal(sum, report.summary.totalRegistered)
    assert.equal(report.summary.assigned, sum)
    assert.equal(report.summary.unassigned, 0)
    assert.equal(report.summary.balanced, true)
})

test('5. several voters in one constituency are counted correctly', async () => {
    const report = await buildDefault()
    const ablekuma = report.constituencies.find((c) => c.name === 'Ablekuma Central')
    assert.equal(ablekuma.registered, 3)
})

test('6. a voter contributes exactly one count', async () => {
    // Adding one voter moves the total by one and that constituency by one,
    // and nothing else moves.
    const before = await buildDefault()
    const after = await buildRegistrationReport(
        makeSupabase({ voters: [...VOTERS, { full_name: 'New Voter', constituency: 'c2' }] })
    )

    assert.equal(after.summary.totalRegistered, before.summary.totalRegistered + 1)

    const bantamaBefore = before.constituencies.find((c) => c.name === 'Bantama').registered
    const bantamaAfter = after.constituencies.find((c) => c.name === 'Bantama').registered
    assert.equal(bantamaAfter, bantamaBefore + 1)

    for (const name of ['Ablekuma Central', 'Cape Coast North', 'Damongo']) {
        assert.equal(
            after.constituencies.find((c) => c.name === name).registered,
            before.constituencies.find((c) => c.name === name).registered,
            `${name} must not move`
        )
    }
})

test('an empty register reports zero rather than failing', async () => {
    const report = await buildRegistrationReport(makeSupabase({ voters: [] }))
    assert.equal(report.summary.totalRegistered, 0)
    assert.equal(report.summary.constituenciesWithNone, 4)
    assert.equal(report.summary.balanced, true)
})

test('a voter belonging to no listed constituency is surfaced, not misattributed', async () => {
    // Should be impossible — voters.constituency_id carries a foreign key — but
    // if the total ever exceeds the sum of the rows, the discrepancy has to be
    // visible rather than quietly absorbed into a constituency.
    const report = await buildRegistrationReport(makeSupabase({ totalOverride: 7 }))

    assert.equal(report.summary.totalRegistered, 7)
    assert.equal(report.summary.assigned, 5)
    assert.equal(report.summary.unassigned, 2)
    assert.equal(report.summary.balanced, false)
    // And no constituency has been inflated to make the books balance.
    assert.deepEqual(
        report.constituencies.map((c) => c.registered),
        [3, 2, 0, 0]
    )
})

test('the ordering convention from the database is preserved', async () => {
    const report = await buildDefault()
    assert.deepEqual(
        report.constituencies.map((c) => c.name),
        ['Ablekuma Central', 'Bantama', 'Cape Coast North', 'Damongo']
    )

    // The order comes from the RPC, which is where every other constituency
    // listing in the portal gets it.
    const migration = readFileSync(
        path.join(ROOT, 'migrations', '0009_add_report_functions.up.sql'),
        'utf8'
    )
    const fn = migration.slice(migration.indexOf('create or replace function get_constituency_turnout'))
    assert.match(fn.slice(0, fn.indexOf('$$;')), /order by c\.name asc/)
})

// ── Privacy ──────────────────────────────────────────────────────────────────

test('7. the report exposes no voter information at all', async () => {
    const report = await buildDefault()
    const serialised = JSON.stringify(report)

    for (const voter of VOTERS) {
        assert.ok(!serialised.includes(voter.full_name), `${voter.full_name} leaked into the report`)
    }
    for (const field of ['phone', 'dob', 'date_of_birth', 'voter_id', 'voter_phone', 'has_voted']) {
        assert.ok(!serialised.includes(field), `${field} appears in the report`)
    }

    // Every constituency row carries exactly these keys and no others.
    for (const c of report.constituencies) {
        assert.deepEqual(Object.keys(c).sort(), ['code', 'id', 'name', 'region', 'registered'])
    }
})

test('the builder never queries the voters table or the device tables', async () => {
    const supabase = makeSupabase()
    await buildRegistrationReport(supabase)

    assert.deepEqual(supabase.calls.sort(), ['get_constituency_turnout', 'get_election_stats'])

    const source = readFileSync(path.join(ROOT, 'src', 'lib', 'registration-report.js'), 'utf8')
    for (const table of ['voters', 'registration_events', 'registration_devices', 'votes']) {
        assert.ok(
            !new RegExp(`from\\('${table}'\\)`).test(source),
            `the builder must not read ${table}`
        )
    }
})

// ── The PDF ──────────────────────────────────────────────────────────────────

test('9. the PDF states the title, the total and every constituency with its count', async () => {
    const report = await buildDefault()
    const pdf = await renderRegistrationStatsPdf(report)
    const text = pdfText(pdf)

    assert.ok(Buffer.isBuffer(pdf) && pdf.length > 1000, 'a document was produced')

    assert.ok(text.includes('Voter registration statistics'), 'report title')
    assert.ok(text.includes('Test Election 2026'), 'election name')
    assert.ok(text.includes('TOTAL REGISTERED VOTERS'), 'total row')
    assert.ok(/Generated/.test(text), 'generation time')

    for (const c of report.constituencies) {
        assert.ok(text.includes(c.name), `${c.name} missing from the PDF`)
    }
    // The counts, including the zeroes.
    assert.ok(text.includes('Ablekuma Central'), 'constituency name')
    assert.ok(/\b3\b/.test(text) && /\b2\b/.test(text) && /\b0\b/.test(text), 'the counts appear')
    assert.ok(text.includes('5'), 'the total appears')
})

test('the PDF shows only human-readable columns', async () => {
    const report = await buildDefault()
    const text = pdfText(await renderRegistrationStatsPdf(report))

    for (const header of ['Constituency', 'Region', 'Registered voters']) {
        assert.ok(text.includes(header), `the "${header}" column is missing`)
    }
    // The internal code sat immediately left of the count, so two right-aligned
    // numbers invited a reader to mistake the identifier for the figure.
    assert.ok(!/(^|\n)Code(\n|$)/.test(text), 'a Code column header is still rendered')
})

test('no constituency code is printed in the registration statistics PDF', async () => {
    // Codes chosen so they cannot be confused with any count in the fixture:
    // every registration figure is 0-5, and the total is 5.
    const constituencies = [
        { id: 'c1', name: 'Ablekuma Central', region: 'Greater Accra', code: 918273 },
        { id: 'c2', name: 'Bantama', region: 'Ashanti', code: 645102 },
        { id: 'c3', name: 'Cape Coast North', region: 'Central', code: 773410 },
        { id: 'c4', name: 'Damongo', region: 'Savannah', code: 502994 },
    ]
    const voters = [
        { full_name: 'Ama Serwaa', constituency: 'c1' },
        { full_name: 'Kwame Mensah', constituency: 'c1' },
        { full_name: 'Yaw Boateng', constituency: 'c1' },
        { full_name: 'Akosua Danso', constituency: 'c2' },
        { full_name: 'Kofi Owusu', constituency: 'c2' },
    ]

    const report = await buildRegistrationReport(makeSupabase({ constituencies, voters }))
    const text = pdfText(await renderRegistrationStatsPdf(report))

    for (const c of constituencies) {
        assert.ok(text.includes(c.name), `${c.name} should still be named`)
        assert.ok(!text.includes(String(c.code)), `code ${c.code} is printed in the PDF`)
    }

    // Removing the column changed nothing about the figures.
    assert.equal(report.summary.totalRegistered, 5)
    assert.equal(
        report.constituencies.reduce((n, c) => n + c.registered, 0),
        report.summary.totalRegistered
    )
    assert.ok(text.includes('TOTAL REGISTERED VOTERS'))
})

test('the code stays on the report object for the application to use', async () => {
    // Hidden from the document, not dropped from the data: the admin screen
    // still shows it and the CSV import still keys on it.
    const report = await buildDefault()

    assert.deepEqual(
        report.constituencies.map((c) => c.code),
        [1, 2, 3, 4]
    )
    for (const c of report.constituencies) {
        assert.ok(c.id, 'the internal id is still carried')
        assert.deepEqual(Object.keys(c).sort(), ['code', 'id', 'name', 'region', 'registered'])
    }

    const ui = readFileSync(
        path.join(ROOT, 'src', 'components', 'admin', 'RegistrationStats.jsx'),
        'utf8'
    )
    assert.match(ui, /Code \{c\.code\}/, 'the admin screen should still show the code')
})

test('10. the PDF contains no voter name or any other personal detail', async () => {
    const report = await buildDefault()
    const text = pdfText(await renderRegistrationStatsPdf(report))

    for (const voter of VOTERS) {
        assert.ok(!text.includes(voter.full_name), `${voter.full_name} appears in the PDF`)
        // Also each name part on its own, in case of a line break.
        for (const part of voter.full_name.split(' ')) {
            assert.ok(!text.includes(part), `"${part}" appears in the PDF`)
        }
    }

    for (const forbidden of [
        '024',
        '+233',
        'Date of birth',
        'Phone',
        'Mobile',
        'voter_id',
        'device_id',
        'Device',
        'IP address',
        'has_voted',
    ]) {
        assert.ok(!text.includes(forbidden), `"${forbidden}" appears in the PDF`)
    }

    // And it states plainly that it is aggregate.
    assert.ok(text.includes('aggregate report'), 'the PDF should say what it is')
})

test('the PDF renders a large register across pages without losing the total', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
        id: `x${i}`,
        name: `Constituency ${String(i).padStart(3, '0')}`,
        region: 'Greater Accra',
        code: i,
    }))
    const voters = many.flatMap((c, i) =>
        Array.from({ length: i % 5 }, (_, n) => ({ full_name: `V${i}-${n}`, constituency: c.id }))
    )

    const report = await buildRegistrationReport(
        makeSupabase({ constituencies: many, voters })
    )
    const text = pdfText(await renderRegistrationStatsPdf(report))

    assert.equal(report.summary.totalRegistered, voters.length)
    assert.ok(text.includes('Constituency 000'), 'first row')
    assert.ok(text.includes('Constituency 119'), 'last row survives pagination')
    assert.ok(text.includes('TOTAL REGISTERED VOTERS'))
    assert.ok(/Page \d+ of \d+/.test(text), 'pages are numbered')
})

test('the discrepancy notice reaches the PDF when the figures disagree', async () => {
    const report = await buildRegistrationReport(makeSupabase({ totalOverride: 7 }))
    const text = pdfText(await renderRegistrationStatsPdf(report))
    assert.ok(text.includes('Figures do not reconcile'))
})

test('the export filename names the election and the date', async () => {
    const report = await buildDefault()
    const name = registrationReportFilename(report, 'pdf')
    assert.match(name, /^test-election-2026-registration-statistics-\d{4}-\d{2}-\d{2}\.pdf$/)
})

// ── Wiring, authorisation and scope ──────────────────────────────────────────

const STATS_ROUTE = readFileSync(
    path.join(ROOT, 'src', 'app', 'api', 'admin', 'registration-stats', 'route.js'),
    'utf8'
)
const EXPORT_ROUTE = readFileSync(
    path.join(ROOT, 'src', 'app', 'api', 'admin', 'registration-stats', 'export', 'route.js'),
    'utf8'
)
const UI = readFileSync(
    path.join(ROOT, 'src', 'components', 'admin', 'RegistrationStats.jsx'),
    'utf8'
)

test('11. the screen and the PDF are built from the same call', async () => {
    // One builder, two callers. Two queries is how a document ends up
    // contradicting the dashboard it was generated from.
    assert.match(STATS_ROUTE, /buildRegistrationReport\(supabase/)
    assert.match(EXPORT_ROUTE, /buildRegistrationReport\(supabase/)
    assert.match(UI, /'\/api\/admin\/registration-stats'/)
    assert.match(UI, /'\/api\/admin\/registration-stats\/export\?format=pdf'/)
})

test('8. both endpoints sit behind the existing admin gate', () => {
    // proxy.js's own predicate, replicated: moving either route out from under
    // /api/admin, or naming it like the sign-in exemptions, fails here.
    const isAdminApi = (pathname) =>
        pathname.startsWith('/api/admin') &&
        pathname !== '/api/admin/login' &&
        pathname !== '/api/admin/logout'

    for (const pathname of [
        '/api/admin/registration-stats',
        '/api/admin/registration-stats/export',
    ]) {
        assert.equal(isAdminApi(pathname), true, `${pathname} must be gated`)
    }

    const proxy = readFileSync(path.join(ROOT, 'src', 'proxy.js'), 'utf8')
    assert.match(proxy, /if \(isAdminApi\) \{[\s\S]*?status: 401/)
    assert.match(proxy, /await jwtVerify\(token, secret\)/)

    // No second authorisation mechanism was introduced.
    for (const source of [STATS_ROUTE, EXPORT_ROUTE]) {
        assert.ok(!/ADMIN_JWT_SECRET|jwtVerify/.test(source), 'routes must not re-check the JWT')
    }
})

test('the export is rate limited like the other exports', () => {
    assert.match(EXPORT_ROUTE, /rateLimit\('export', admin\?\.id \?\? ip, RATE_LIMITS\.export\)/)
    assert.match(EXPORT_ROUTE, /AUDIT_ACTIONS\.REGISTRATION_STATS_EXPORTED/)
})

test('this is a read-only feature', () => {
    for (const [name, source] of [
        ['stats route', STATS_ROUTE],
        ['export route', EXPORT_ROUTE],
        ['builder', readFileSync(path.join(ROOT, 'src', 'lib', 'registration-report.js'), 'utf8')],
    ]) {
        for (const mutation of ['.insert(', '.update(', '.upsert(', '.delete(']) {
            assert.ok(!source.includes(mutation), `${name} performs ${mutation}`)
        }
    }
})

test('the section never offers a way to browse the register', () => {
    // The scope guarantee, as an assertion: no control that would turn an
    // aggregate view into a voter lookup.
    for (const forbidden of [
        'View voters',
        'voter list',
        'voters?',
        '/api/admin/voters',
        'full_name',
        'voter_phone',
        'voter_dob',
    ]) {
        assert.ok(!UI.includes(forbidden), `the section references "${forbidden}"`)
    }
})

test('nothing was added to a voter-facing page', () => {
    for (const file of [
        ['src', 'app', 'register', 'page.jsx'],
        ['src', 'app', 'login', 'LoginForm.jsx'],
        ['src', 'app', 'vote', 'candidates', 'Ballot.jsx'],
        ['src', 'app', 'results', 'page.jsx'],
        ['src', 'app', 'page.js'],
    ]) {
        const source = readFileSync(path.join(ROOT, ...file), 'utf8')
        assert.ok(
            !source.includes('registration-stats') && !source.includes('RegistrationStats'),
            `${file.join('/')} references the admin statistics feature`
        )
    }
})

test('the section is reachable from the admin portal', () => {
    const page = readFileSync(path.join(ROOT, 'src', 'app', 'admin', 'page.jsx'), 'utf8')
    assert.match(page, /import RegistrationStats from '@\/components\/admin\/RegistrationStats'/)
    assert.match(page, /key: 'registration'.*Component: RegistrationStats/)
})
