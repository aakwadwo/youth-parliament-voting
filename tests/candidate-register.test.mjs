import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCandidateRegister, registerFilename } from '@/lib/candidate-register'
import { makeFakeSupabase } from './fixtures/fake-supabase.mjs'

function build() {
    return buildCandidateRegister(makeFakeSupabase(), { generatedBy: 'clerk@example.test' })
}

/** Every candidate in the register, flattened, in document order. */
function allCandidates(register) {
    return register.regions.flatMap((r) => r.constituencies.flatMap((c) => c.candidates))
}

test('every candidate in the database appears exactly once', async () => {
    const register = await build()
    const names = allCandidates(register).map((c) => c.name)

    assert.equal(names.length, 8, 'all eight fixture candidates are present')
    assert.equal(new Set(names).size, names.length, 'nobody is listed twice')

    // Including the withdrawn one. A register that hid deactivated candidates
    // would be useless for spotting somebody who should not be on it.
    const withdrawn = allCandidates(register).filter((c) => c.isActive === false)
    assert.deepEqual(
        withdrawn.map((c) => c.name),
        ['Unvoted Two']
    )
})

test('candidates are grouped region → constituency, both alphabetical', async () => {
    const register = await build()

    assert.deepEqual(
        register.regions.map((r) => r.region),
        ['Ahafo', 'Ashanti', 'Greater Accra', 'Unassigned']
    )

    const ashanti = register.regions.find((r) => r.region === 'Ashanti')
    assert.deepEqual(
        ashanti.constituencies.map((c) => c.name),
        ['Dead Heat', 'No Ballots']
    )
})

test('candidates within a constituency are in name order', async () => {
    const register = await build()
    const deadHeat = register.regions
        .find((r) => r.region === 'Ashanti')
        .constituencies.find((c) => c.name === 'Dead Heat')

    assert.deepEqual(
        deadHeat.candidates.map((c) => c.name),
        ['No Votes At All', 'Tied A', 'Tied B']
    )
})

test('a constituency with nobody standing is listed, not omitted', async () => {
    const register = await build()
    const ahafo = register.regions.find((r) => r.region === 'Ahafo')

    assert.deepEqual(
        ahafo.constituencies.map((c) => c.name),
        ['Nobody Standing']
    )
    assert.deepEqual(ahafo.constituencies[0].candidates, [])
    assert.equal(register.summary.emptyConstituencies, 1)
})

test('a candidate whose constituency has been deleted still appears', async () => {
    const register = await build()
    const unassigned = register.regions.find((r) => r.region === 'Unassigned')

    assert.ok(unassigned, 'orphaned candidates get their own heading')
    assert.deepEqual(
        unassigned.constituencies[0].candidates.map((c) => c.name),
        ['Orphaned Candidate']
    )
})

test('candidates without a photograph are carried through as null', async () => {
    const register = await build()
    const withoutPhoto = allCandidates(register).filter((c) => c.photoUrl === null)

    assert.ok(withoutPhoto.length > 0, 'the fixture must exercise the no-photo path')
    assert.equal(
        allCandidates(register).every((c) => 'photoUrl' in c),
        true
    )
})

test('the summary counts what the cover page prints', async () => {
    const register = await build()

    assert.equal(register.summary.candidates, 8)
    assert.equal(register.summary.activeCandidates, 7)
    assert.equal(register.summary.regions, 4)
    // Four real constituencies plus the synthetic heading for the orphan.
    assert.equal(register.summary.constituencies, 5)
    assert.equal(
        register.summary.withPhoto,
        allCandidates(register).filter((c) => c.photoUrl).length
    )
})

test('the register carries no vote totals at all', async () => {
    const register = await build()

    // The register is circulated before a poll opens. A tally reaching it would
    // be an early release of a result, not a formatting mistake.
    //
    // Checked on the field names rather than on the serialised text, because a
    // candidate is perfectly entitled to be called "No Votes At All" and a
    // substring search would fail on their name rather than on a leak.
    const forbidden = ['votes', 'tally', 'turnout', 'winners', 'ballots', 'sharePct']

    const assertClean = (object, path) => {
        for (const key of Object.keys(object)) {
            assert.equal(
                forbidden.includes(key),
                false,
                `${path}.${key} would put a tally in the candidate register`
            )
        }
    }

    assertClean(register.summary, 'summary')
    assertClean(register.meta, 'meta')
    for (const region of register.regions) {
        assertClean(region, region.region)
        for (const constituency of region.constituencies) {
            assertClean(constituency, constituency.name)
            for (const candidate of constituency.candidates) {
                assertClean(candidate, candidate.name)
            }
        }
    }
})

test('the export is named after the election and the date it was generated', async () => {
    const register = await build()
    const filename = registerFilename(register, 'pdf')

    assert.match(filename, /^test-election-2026-candidate-list-\d{4}-\d{2}-\d{2}\.pdf$/)
})

test('the register records who generated it and when', async () => {
    const register = await build()

    assert.equal(register.meta.generatedBy, 'clerk@example.test')
    assert.equal(register.meta.electionName, 'Test Election 2026')
    assert.ok(!Number.isNaN(Date.parse(register.meta.generatedAt)))
})
