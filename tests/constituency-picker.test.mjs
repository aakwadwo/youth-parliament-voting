import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
    scoreConstituency,
    filterConstituencies,
    MAX_VISIBLE_CONSTITUENCIES,
} from '@/lib/constituency-search'
import { readConstituencies } from '@/lib/constituencies-server'

/**
 * The constituency picker on the registration form.
 *
 * Two things are under test. First, that a voter can still find their own
 * constituency — the matching rule is unchanged from the version this replaces,
 * and capping what is rendered must not be able to hide a match. Choosing the
 * wrong constituency means voting in the wrong race, so this is not a
 * presentational concern.
 *
 * Second, that the list is in the page when it is served rather than fetched
 * afterwards. The picker used to sit behind HTML, then the JavaScript bundle,
 * then hydration, then a second HTTP round trip before it could show anything.
 */

const ROOT = process.cwd()
const read = (...parts) => readFileSync(path.join(ROOT, ...parts), 'utf8')

const PAGE = read('src', 'app', 'register', 'page.jsx')
const FORM = read('src', 'app', 'register', 'RegisterForm.jsx')
const COMBOBOX = read('src', 'components', 'ConstituencyCombobox.jsx')
const API_ROUTE = read('src', 'app', 'api', 'constituencies', 'route.js')

/** A slice of the real register, including the case that motivated the rule. */
const CONSTITUENCIES = [
    { id: '1', name: 'Ablekuma North', region: 'Greater Accra' },
    { id: '2', name: 'Ho Central', region: 'Volta' },
    { id: '3', name: 'Techiman North', region: 'Bono East' },
    { id: '4', name: 'Tema Central', region: 'Greater Accra' },
    { id: '5', name: 'Tema West', region: 'Greater Accra' },
    { id: '6', name: 'Nalerigu/Gambaga', region: 'North East' },
]

// ── The matching rule ────────────────────────────────────────────────────────

test('a prefix match outranks a mere substring match', () => {
    // The regression this rule exists for: cmdk's fuzzy subsequence scorer
    // ranked "Techiman North" above "Tema West" for the search "Tema".
    assert.equal(scoreConstituency({ name: 'Tema West', region: 'Greater Accra' }, 'Tema'), 1)
    assert.equal(
        scoreConstituency({ name: 'Techiman North', region: 'Bono East' }, 'Tema'),
        0,
        'Techiman North is not a substring match for "Tema" at all'
    )
})

test('searching "Tema" puts the Tema constituencies first', () => {
    const { visible } = filterConstituencies(CONSTITUENCIES, 'Tema')
    assert.deepEqual(
        visible.map((c) => c.name),
        ['Tema Central', 'Tema West']
    )
})

test('a constituency is findable by its region', () => {
    const { visible } = filterConstituencies(CONSTITUENCIES, 'Volta')
    assert.deepEqual(
        visible.map((c) => c.name),
        ['Ho Central']
    )
})

test('matching is case-insensitive and tolerates surrounding spaces', () => {
    for (const term of ['tema west', 'TEMA WEST', '  Tema West  ']) {
        const { visible } = filterConstituencies(CONSTITUENCIES, term)
        assert.equal(visible[0].name, 'Tema West', `"${term}" did not find Tema West`)
    }
})

test('names carrying the punctuation the real register uses are findable', () => {
    // The register holds "Nalerigu/Gambaga".
    for (const term of ['Nalerigu', 'Gambaga', 'Nalerigu/Gambaga']) {
        const { visible } = filterConstituencies(CONSTITUENCIES, term)
        assert.equal(visible[0]?.name, 'Nalerigu/Gambaga', `"${term}" did not find it`)
    }
})

test('a name match beats a region match', () => {
    const list = [
        { id: 'a', name: 'Somewhere Else', region: 'Ho' },
        { id: 'b', name: 'Ho Central', region: 'Volta' },
    ]
    const { visible } = filterConstituencies(list, 'Ho')
    assert.equal(visible[0].name, 'Ho Central')
})

test('a search matching nothing returns nothing, rather than everything', () => {
    const { visible, total, truncated } = filterConstituencies(CONSTITUENCIES, 'Zzzzz')
    assert.deepEqual(visible, [])
    assert.equal(total, 0)
    assert.equal(truncated, false)
})

test('an empty search keeps the incoming order', () => {
    // The server returns them `order by name`, and equal scores sort stably, so
    // the unsearched list is alphabetical.
    const { visible } = filterConstituencies(CONSTITUENCIES, '')
    assert.deepEqual(
        visible.map((c) => c.name),
        CONSTITUENCIES.map((c) => c.name)
    )
})

// ── The render cap ───────────────────────────────────────────────────────────

/** A register the size of the real one. */
const MANY = Array.from({ length: 276 }, (_, i) => ({
    id: String(i),
    name: `Constituency ${String(i).padStart(3, '0')}`,
    region: 'Region',
}))

test('only a capped number of rows is ever rendered', () => {
    const { visible, total, truncated } = filterConstituencies(MANY, '')
    assert.equal(visible.length, MAX_VISIBLE_CONSTITUENCIES)
    assert.equal(total, 276, 'the true match count must still be reported')
    assert.equal(truncated, true)
})

test('the cap reports the real total, so a partial list never looks complete', () => {
    const { visible, total, truncated } = filterConstituencies(MANY, 'Constituency 1')
    assert.ok(truncated)
    assert.ok(total > visible.length)
    // 'Constituency 1', 'Constituency 10'..'Constituency 19', 'Constituency 1xx'
    assert.equal(total, MANY.filter((c) => c.name.includes('Constituency 1')).length)
})

test('typing narrows the list rather than paging through it', () => {
    const broad = filterConstituencies(MANY, 'Constituency')
    const narrow = filterConstituencies(MANY, 'Constituency 007')

    assert.equal(broad.truncated, true)
    assert.equal(narrow.truncated, false)
    assert.deepEqual(
        narrow.visible.map((c) => c.name),
        ['Constituency 007']
    )
})

test('the cap cannot hide an exact match behind weaker ones', () => {
    // The property the cap rests on: ranking happens before slicing, so the
    // best match is always among the rows kept.
    const list = [
        ...Array.from({ length: 200 }, (_, i) => ({
            id: `x${i}`,
            name: `North Something ${i}`,
            region: 'Accra North',
        })),
        { id: 'target', name: 'Accra Central', region: 'Greater Accra' },
    ]

    const { visible } = filterConstituencies(list, 'Accra')
    assert.equal(visible[0].name, 'Accra Central', 'the prefix match was ranked below the rest')
})

test('the picker does not re-filter on top of the ranking', () => {
    // cmdk would otherwise apply its own fuzzy scorer to what has already been
    // chosen and reorder it.
    assert.match(COMBOBOX, /shouldFilter=\{false\}/)
    assert.match(COMBOBOX, /filterConstituencies\(constituencies, search\)/)
})

// ── The list reaches the page on the server ──────────────────────────────────

test('the registration route loads the constituency list on the server', () => {
    assert.equal(
        /^\s*['"]use client['"]/.test(PAGE),
        false,
        'the register route is a client component and cannot load anything before the page is sent'
    )
    assert.match(PAGE, /readConstituencies\(\)/)
    assert.match(PAGE, /<RegisterForm[\s\S]*constituencies=\{constituencies\}/)
})

test('the form no longer fetches the constituency list after hydration', () => {
    assert.match(FORM, /^'use client'/)
    assert.ok(
        !FORM.includes('/api/constituencies'),
        'the registration form still fetches the constituency list'
    )
    // The import, not a mention: the file's own comment explains that this used
    // to be a `useEffect`, and a hook is only usable if it is imported.
    assert.ok(
        !/import \{[^}]*useEffect/.test(FORM),
        'the form still imports useEffect, so it can still fetch on mount'
    )
    assert.ok(!FORM.includes('getJson'), 'the form still imports a GET helper')
    assert.match(FORM, /constituencies = \[\]/, 'the list should arrive as a prop')
})

test('registration is still not gated on the voting window', () => {
    // Making the route a server component is exactly how a voting gate gets
    // added by accident. The register must stay open before and after the poll.
    for (const forbidden of ['requireVotingOpen', 'isVotingOpen', 'VotingNotOpen']) {
        assert.ok(!PAGE.includes(forbidden), `the register page references ${forbidden}`)
    }
})

test('the register page reads nothing about any voter', () => {
    for (const forbidden of ["'voters'", 'voter_phone', 'voter_dob', 'has_voted']) {
        assert.ok(!PAGE.includes(forbidden), `the register page references ${forbidden}`)
    }
})

test('the public endpoint is kept, and is cacheable by a shared cache', () => {
    assert.match(API_ROUTE, /export async function GET/)
    assert.match(API_ROUTE, /s-maxage=300/)
    assert.match(API_ROUTE, /max-age=300/)
    assert.match(API_ROUTE, /stale-while-revalidate=60/)
})

test('the page and the endpoint read the list through the same function', () => {
    // Two copies of this query is how the picker on the form and the picker
    // anywhere else end up in different orders.
    assert.match(PAGE, /from '@\/lib\/constituencies-server'/)
    assert.match(API_ROUTE, /from '@\/lib\/constituencies-server'/)
})

// ── The shared loader ────────────────────────────────────────────────────────

test('the loader selects only the columns a voter needs, in name order', async () => {
    const calls = []
    const client = {
        from(table) {
            calls.push({ table })
            return {
                select(columns) {
                    calls.at(-1).columns = columns
                    return {
                        order: async (column) => {
                            calls.at(-1).order = column
                            return { data: CONSTITUENCIES, error: null }
                        },
                    }
                },
            }
        },
    }

    const { constituencies, error } = await readConstituencies(client)

    assert.equal(error, null)
    assert.equal(constituencies.length, CONSTITUENCIES.length)
    assert.deepEqual(calls, [
        { table: 'constituencies', columns: 'id, name, region', order: 'name' },
    ])
    // `code` is the CSV import's conflict target and of no use to a voter.
    assert.ok(!calls[0].columns.includes('code'))
})

test('a failed read returns an empty list rather than throwing', async () => {
    const client = {
        from: () => ({
            select: () => ({ order: async () => ({ data: null, error: { message: 'boom' } }) }),
        }),
    }

    const { constituencies, error } = await readConstituencies(client)

    // Both callers have to decide for themselves what to do, and the
    // registration page still has to render a usable form.
    assert.deepEqual(constituencies, [])
    assert.ok(error)
})
