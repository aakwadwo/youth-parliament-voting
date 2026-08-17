import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPublicResults } from '@/lib/public-results'
import { resolveWinners, percent } from '@/lib/results-math'
import { ELECTION_STATUS, resultsUnavailableMessage } from '@/lib/election-status'
import { makeFakeSupabase } from './fixtures/fake-supabase.mjs'

const ELECTION = {
    electionName: 'Test Election 2026',
    closesAt: '2026-07-24T18:00:00.000Z',
    status: ELECTION_STATUS.ENDED,
    resultsPublished: true,
    resultsPublishedAt: '2026-07-26T09:00:00.000Z',
}

function build() {
    return buildPublicResults(makeFakeSupabase(), ELECTION)
}

/** The one constituency in the fixture with a decisive result. */
function find(results, name) {
    for (const region of results.regions) {
        const match = region.constituencies.find((c) => c.name === name)
        if (match) return match
    }
    throw new Error(`no constituency named ${name}`)
}

// --------------------------------------------------------------------------
// The gate
//
// The gate itself — who may see a result, and when — is exercised in full in
// results-publication.test.mjs, including the server-side refusal. What is
// checked here is only that every state which refuses has words for it.
// --------------------------------------------------------------------------

test('every non-publishing state has a sentence explaining itself', () => {
    for (const status of [
        ELECTION_STATUS.SCHEDULED,
        ELECTION_STATUS.OPEN,
        ELECTION_STATUS.ENDED,
        ELECTION_STATUS.CLOSED,
        undefined,
    ]) {
        const message = resultsUnavailableMessage(status)
        assert.ok(message.title, `${status} needs a title`)
        assert.ok(message.detail, `${status} needs a detail`)
    }
})

// --------------------------------------------------------------------------
// Arithmetic
// --------------------------------------------------------------------------

test('percentages are a share of the constituency total, not the national one', async () => {
    const results = await build()
    const clearWin = find(results, 'Clear Win')

    // 100 ballots in this constituency; 140 nationally. A share computed
    // against the national total would give 50% and 21.4%.
    assert.equal(clearWin.totalVotes, 100)
    assert.deepEqual(
        clearWin.candidates.map((c) => [c.name, c.votes, c.sharePct]),
        [
            ['Winner One', 70, 70],
            ['Runner Up', 30, 30],
        ]
    )
})

test('percent rounds to one decimal place and never divides by zero', () => {
    assert.equal(percent(1, 3), 33.3)
    assert.equal(percent(2, 3), 66.7)
    assert.equal(percent(0, 0), 0)
    assert.equal(percent(5, 0), 0)
    assert.equal(percent(0, 10), 0)
})

// --------------------------------------------------------------------------
// Winners, ties and empty seats
// --------------------------------------------------------------------------

test('a decisive result names exactly one winner', async () => {
    const results = await build()
    const clearWin = find(results, 'Clear Win')

    assert.equal(clearWin.tied, false)
    assert.deepEqual(clearWin.winners, ['Winner One'])
    assert.deepEqual(
        clearWin.candidates.filter((c) => c.isWinner).map((c) => c.name),
        ['Winner One']
    )
})

test('a tie below the minimum goes to a re-election, and the tallies survive', async () => {
    const results = await build()
    const deadHeat = find(results, 'Dead Heat')

    // Tied A and Tied B are level on 20, which is under the 50-vote minimum, so
    // neither takes the seat. `resolveWinners` still found them — what changed
    // is the eligibility layer on top of it.
    assert.equal(deadHeat.reElection, true)
    assert.equal(deadHeat.reason, 'Re-election required — winner received fewer than 50 votes')
    assert.deepEqual(deadHeat.winners, [])
    assert.equal(deadHeat.tied, false, 'a seat with no elected member is not a declared tie')
    assert.equal(deadHeat.candidates.filter((c) => c.isWinner).length, 0)

    // The historical count is untouched: every candidate, every tally, every
    // share exactly as counted.
    assert.deepEqual(
        deadHeat.candidates.map((c) => [c.name, c.votes, c.sharePct]),
        [
            ['Tied A', 20, 50],
            ['Tied B', 20, 50],
            ['No Votes At All', 0, 0],
        ]
    )
    assert.equal(deadHeat.totalVotes, 40)
})

test('a constituency where nobody voted has no winner at all', async () => {
    const results = await build()
    const noBallots = find(results, 'No Ballots')

    assert.equal(noBallots.totalVotes, 0)
    assert.deepEqual(noBallots.winners, [])
    assert.equal(noBallots.tied, false)
    // Everyone who stood is still listed — including the withdrawn candidate.
    assert.equal(noBallots.candidates.length, 2)
    assert.equal(noBallots.candidates.every((c) => c.isWinner === false), true)
    assert.equal(
        noBallots.candidates.some((c) => c.isActive === false),
        true,
        'withdrawn candidates are shown, marked as such'
    )
})

test('resolveWinners treats an all-zero field as undeclared, not a universal tie', () => {
    assert.deepEqual(resolveWinners([{ votes: 0 }, { votes: 0 }]), [])
    assert.equal(resolveWinners([{ votes: 3 }, { votes: 3 }, { votes: 1 }]).length, 2)
    assert.equal(resolveWinners([]).length, 0)
})

// --------------------------------------------------------------------------
// Shape and grouping
// --------------------------------------------------------------------------

test('constituencies are grouped by region, both sorted alphabetically', async () => {
    const results = await build()

    // Ahafo appears because "Nobody Standing" now reaches the public result.
    // Before the re-election rule it was invisible: get_results() inner-joins
    // candidates, so a seat nobody contested produced no rows at all.
    assert.deepEqual(
        results.regions.map((r) => r.region),
        ['Ahafo', 'Ashanti', 'Greater Accra']
    )
    assert.deepEqual(
        results.regions[0].constituencies.map((c) => c.name),
        ['Nobody Standing']
    )
    assert.deepEqual(
        results.regions[1].constituencies.map((c) => c.name),
        ['Dead Heat', 'No Ballots']
    )

    // Region totals are the sum of their constituencies.
    assert.equal(results.regions[0].totalVotes, 0)
    assert.equal(results.regions[1].totalVotes, 40)
    assert.equal(results.regions[2].totalVotes, 100)
})

test('candidate order within a constituency is the declaration order', async () => {
    const results = await build()
    // get_results returns votes descending; the builder must not re-sort it.
    for (const region of results.regions) {
        for (const constituency of region.constituencies) {
            const votes = constituency.candidates.map((c) => c.votes)
            assert.deepEqual(
                votes,
                votes.slice().sort((a, b) => b - a),
                `${constituency.name} is not in descending order`
            )
        }
    }
})

test('the summary counts seats, declarations and ties', async () => {
    const results = await build()

    assert.deepEqual(results.summary, {
        totalVotes: 140,
        // All four constituencies, including the one nobody stood in.
        totalConstituencies: 4,
        // Only "Clear Win" (70 votes) clears the 50-vote minimum. "Dead Heat"
        // is tied on 20, "No Ballots" has no winner, "Nobody Standing" had no
        // candidate — all three go to a re-election.
        declaredConstituencies: 1,
        reElectionConstituencies: 3,
        // The tie is below the minimum, so it produces no elected member and
        // is not counted as a declared tie.
        tiedConstituencies: 0,
        totalRegions: 3,
        minVotesToBeElected: 50,
    })

    // The invariant that must hold for any election: every constituency is
    // either elected or going to a re-election, and nothing is both or neither.
    assert.equal(
        results.summary.declaredConstituencies + results.summary.reElectionConstituencies,
        results.summary.totalConstituencies
    )
})

// --------------------------------------------------------------------------
// Privacy: what must never appear in a public response
// --------------------------------------------------------------------------

test('the public payload carries no database identifiers', async () => {
    const results = await build()
    const serialised = JSON.stringify(results)

    // The fixture's candidate and constituency ids. None may survive into the
    // response — a reader needs a name and a number, nothing else.
    for (const id of ['c1', 'c2', 'c3', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']) {
        assert.ok(
            !JSON.parse(serialised).regions.some((r) =>
                r.constituencies.some((c) =>
                    c.candidates.some((cand) => cand.name === id || cand.id === id)
                )
            ),
            `${id} leaked into the public results`
        )
    }

    // No field on any object is an id, and no uuid-shaped string appears.
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    assert.equal(uuid.test(serialised), false, 'a uuid reached the public payload')

    for (const region of results.regions) {
        for (const constituency of region.constituencies) {
            assert.equal('id' in constituency, false)
            for (const candidate of constituency.candidates) {
                assert.equal('id' in candidate, false)
            }
        }
    }
})

test('the public payload carries nothing about voters or the register', async () => {
    const results = await build()
    const serialised = JSON.stringify(results).toLowerCase()

    // Turnout is derived from the voter register. A public results summary is
    // aggregate vote counts only, so none of these words belong in it.
    for (const forbidden of [
        'voter',
        'registered',
        'verified',
        'has_voted',
        'turnout',
        'reconciliation',
        'generatedby',
        'phone',
        'dob',
        'audit',
    ]) {
        assert.equal(
            serialised.includes(forbidden),
            false,
            `"${forbidden}" appears in the public results payload`
        )
    }
})
