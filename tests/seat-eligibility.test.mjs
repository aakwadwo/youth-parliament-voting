import test from 'node:test'
import assert from 'node:assert/strict'

import {
    classifySeat,
    isElectedSeat,
    resolveWinners,
    MIN_VOTES_TO_BE_ELECTED,
    SEAT_STATUS,
    SEAT_REASONS,
} from '@/lib/results-math'
import { buildPublicResults } from '@/lib/public-results'
import { buildElectionReport } from '@/lib/election-report'
import { resultRows, winnerRows, summaryRows } from '@/lib/export/report-sheets'
import { ELECTION_STATUS } from '@/lib/election-status'
import { makeFakeSupabase } from './fixtures/fake-supabase.mjs'

/**
 * The Commission's re-election rule.
 *
 * Two things are being protected here, and the second matters more than the
 * first. One: the threshold behaves correctly at its boundary. Two: the rule
 * lives in exactly one function, so the public page, the admin portal and the
 * three export formats cannot come to different conclusions about who holds a
 * seat — the disagreement that surfaces in a petition.
 *
 * The historical count is asserted as unchanged throughout. Withdrawing a seat
 * is not the same as editing the ballots, and nothing in this feature is
 * allowed to touch a tally.
 */

const ELECTION = {
    electionName: 'Test Election 2026',
    closesAt: '2026-07-24T18:00:00.000Z',
    status: ELECTION_STATUS.ENDED,
    resultsPublished: true,
    resultsPublishedAt: '2026-07-26T09:00:00.000Z',
}

const seatOf = (results, name) => {
    for (const region of results.regions) {
        const match = region.constituencies.find((c) => c.name === name)
        if (match) return match
    }
    throw new Error(`no constituency named ${name}`)
}

// ── The threshold itself ────────────────────────────────────────────────────

test('the minimum is 50 and is stated once', () => {
    assert.equal(MIN_VOTES_TO_BE_ELECTED, 50)
})

test('no candidate stood', () => {
    const seat = classifySeat({ candidateCount: 0, winners: [] })
    assert.equal(seat.status, SEAT_STATUS.RE_ELECTION)
    assert.equal(seat.reason, 'No candidate stood')
    assert.equal(isElectedSeat(seat), false)
})

test('candidates stood but nobody received a vote', () => {
    // This is Sene East: a candidate on the ballot paper, zero votes cast.
    // Distinct from "nobody stood", and the reason has to say so.
    const winners = resolveWinners([{ votes: 0 }, { votes: 0 }])
    assert.deepEqual(winners, [], 'resolveWinners returns nobody on an all-zero field')

    const seat = classifySeat({ candidateCount: 2, winners })
    assert.equal(seat.status, SEAT_STATUS.RE_ELECTION)
    assert.equal(seat.reason, 'Re-election required — no valid winner')
    assert.notEqual(seat.reason, SEAT_REASONS.NO_CANDIDATE)
})

test('49 votes is below the minimum', () => {
    const seat = classifySeat({ candidateCount: 2, winners: [{ votes: 49 }] })
    assert.equal(seat.status, SEAT_STATUS.RE_ELECTION)
    assert.equal(seat.reason, 'Re-election required — winner received fewer than 50 votes')
    assert.equal(seat.leadingVotes, 49)
})

test('50 votes meets the minimum — the boundary is inclusive', () => {
    // "Fewer than 50" excludes 50 itself. Getting this backwards would unseat a
    // member on exactly the threshold, so it is pinned explicitly.
    const seat = classifySeat({ candidateCount: 2, winners: [{ votes: 50 }] })
    assert.equal(seat.status, SEAT_STATUS.ELECTED)
    assert.equal(seat.reason, null)
    assert.equal(isElectedSeat(seat), true)
})

test('51 votes is elected', () => {
    const seat = classifySeat({ candidateCount: 3, winners: [{ votes: 51 }] })
    assert.equal(seat.status, SEAT_STATUS.ELECTED)
    assert.equal(seat.reason, null)
})

test('a tie is classified on the shared tally, in both directions', () => {
    const below = classifySeat({ candidateCount: 2, winners: [{ votes: 20 }, { votes: 20 }] })
    assert.equal(below.status, SEAT_STATUS.RE_ELECTION)

    const above = classifySeat({ candidateCount: 2, winners: [{ votes: 60 }, { votes: 60 }] })
    assert.equal(above.status, SEAT_STATUS.ELECTED)
})

test('the threshold is injectable, so the rule is not welded to 50', () => {
    assert.equal(
        classifySeat({ candidateCount: 1, winners: [{ votes: 10 }], minVotes: 5 }).status,
        SEAT_STATUS.ELECTED
    )
    assert.equal(
        classifySeat({ candidateCount: 1, winners: [{ votes: 10 }], minVotes: 500 }).reason,
        'Re-election required — winner received fewer than 500 votes'
    )
})

test('resolveWinners is untouched by the eligibility rule', () => {
    // The arithmetic of the election still answers only "who led". A seat that
    // will go to a re-election still reports its leader here, which is what
    // keeps the 2026 tallies reproducible if the threshold ever changes.
    assert.deepEqual(resolveWinners([{ votes: 2 }, { votes: 1 }]), [{ votes: 2 }])
    assert.equal(resolveWinners([{ votes: 49 }]).length, 1)
    assert.equal(resolveWinners([{ votes: 0 }, { votes: 0 }]).length, 0)
})

// ── The rule reaching the public result ─────────────────────────────────────

test('a seat with no candidate appears in the public result', async () => {
    const results = await buildPublicResults(makeFakeSupabase(), ELECTION)
    const vacant = seatOf(results, 'Nobody Standing')

    assert.equal(vacant.reElection, true)
    assert.equal(vacant.reason, 'No candidate stood')
    assert.equal(vacant.candidates.length, 0)
    assert.equal(vacant.totalVotes, 0)
    assert.deepEqual(vacant.winners, [])
})

test('a sub-threshold seat keeps its candidates and its votes', async () => {
    const results = await buildPublicResults(makeFakeSupabase(), ELECTION)
    const tied = seatOf(results, 'Dead Heat')

    assert.equal(tied.reElection, true)
    assert.deepEqual(tied.winners, [], 'no winner is published')
    assert.equal(tied.candidates.every((c) => c.isWinner === false), true)

    // The point of the whole feature: the count is published, the seat is not.
    assert.deepEqual(
        tied.candidates.map((c) => [c.name, c.votes]),
        [
            ['Tied A', 20],
            ['Tied B', 20],
            ['No Votes At All', 0],
        ]
    )
    assert.equal(tied.totalVotes, 40)
})

test('an elected seat is unaffected', async () => {
    const results = await buildPublicResults(makeFakeSupabase(), ELECTION)
    const clear = seatOf(results, 'Clear Win')

    assert.equal(clear.reElection, false)
    assert.equal(clear.reason, null)
    assert.deepEqual(clear.winners, ['Winner One'])
    assert.equal(clear.candidates.find((c) => c.name === 'Winner One').isWinner, true)
})

test('every seat is either elected or going to a re-election', async () => {
    const results = await buildPublicResults(makeFakeSupabase(), ELECTION)
    const seats = results.regions.flatMap((r) => r.constituencies)

    assert.equal(seats.length, results.summary.totalConstituencies)
    assert.equal(
        seats.filter((s) => s.reElection).length,
        results.summary.reElectionConstituencies
    )
    assert.equal(
        seats.filter((s) => !s.reElection).length,
        results.summary.declaredConstituencies
    )
    assert.equal(
        results.summary.declaredConstituencies + results.summary.reElectionConstituencies,
        results.summary.totalConstituencies,
        'elected + re-election must equal the whole register'
    )
})

// ── Public, admin and exports must agree ────────────────────────────────────

test('public and internal builders classify every seat identically', async () => {
    const publicResults = await buildPublicResults(makeFakeSupabase(), ELECTION)
    const report = await buildElectionReport(makeFakeSupabase())

    const publicSeats = new Map(
        publicResults.regions
            .flatMap((r) => r.constituencies)
            .map((c) => [c.name, { reElection: c.reElection, reason: c.reason }])
    )
    const reportSeats = new Map(
        report.constituencies.map((c) => [c.name, { reElection: c.reElection, reason: c.reason }])
    )

    assert.equal(publicSeats.size, reportSeats.size, 'both builders must cover the same seats')
    for (const [name, shape] of publicSeats) {
        assert.deepEqual(
            reportSeats.get(name),
            shape,
            `${name} is classified differently by the public page and the report`
        )
    }

    // And the headline counts agree, which is what a reader comparing the page
    // with the PDF actually checks.
    assert.equal(
        publicResults.summary.declaredConstituencies,
        report.summary.declaredConstituencies
    )
    assert.equal(
        publicResults.summary.reElectionConstituencies,
        report.summary.reElectionConstituencies
    )
    assert.equal(publicResults.summary.totalConstituencies, report.summary.totalConstituencies)
})

test('the CSV and workbook rows carry the same outcome the page shows', async () => {
    const report = await buildElectionReport(makeFakeSupabase())
    const rows = resultRows(report, { styled: false })
    const [, ...body] = rows

    const outcomeFor = (constituency, candidate) =>
        body.find((r) => r[0] === constituency && r[3] === candidate)?.[6]

    assert.equal(outcomeFor('Clear Win', 'Winner One'), 'Elected')
    assert.equal(outcomeFor('Clear Win', 'Runner Up'), '')
    assert.equal(outcomeFor('Dead Heat', 'Tied A'), 'Re-election')
    assert.equal(outcomeFor('Dead Heat', 'Tied B'), 'Re-election')

    // No candidate stood, so there is no candidate row to hang the seat on —
    // it gets a row of its own rather than vanishing from the export.
    const vacantRow = body.find((r) => r[0] === 'Nobody Standing')
    assert.ok(vacantRow, 'a seat with no candidate must still appear in the export')
    assert.equal(vacantRow[6], 'No candidate stood')

    // Vote columns are the historical tallies, untouched.
    assert.equal(body.find((r) => r[3] === 'Tied A')[4], 20)
    assert.equal(body.find((r) => r[3] === 'Winner One')[4], 70)
})

test('the summary sheet states the threshold and the re-election count', async () => {
    const report = await buildElectionReport(makeFakeSupabase())
    const rows = summaryRows(report).map((r) => r.map((cell) => cell?.value ?? cell))

    const valueFor = (label) => rows.find((r) => r[0] === label)?.[1]

    assert.equal(valueFor('Seats declared (elected)'), report.summary.declaredConstituencies)
    assert.equal(
        valueFor('Constituencies requiring a re-election'),
        report.summary.reElectionConstituencies
    )
    assert.equal(valueFor('Minimum votes to be elected'), 50)
})

test('no ballot total is altered by the rule', async () => {
    const report = await buildElectionReport(makeFakeSupabase())
    const publicResults = await buildPublicResults(makeFakeSupabase(), ELECTION)

    // The national total is the sum of the fixture's tallies whatever the
    // eligibility rule decides about seats.
    assert.equal(publicResults.summary.totalVotes, 140)
    assert.equal(report.summary.totalBallots, 140)

    const reportVotes = report.constituencies
        .flatMap((c) => c.candidates)
        .reduce((sum, c) => sum + c.votes, 0)
    assert.equal(reportVotes, 140, 'per-candidate tallies still sum to the national total')

    // And reconciliation against the voter roll is unaffected.
    assert.equal(report.summary.ballotReconciliation.balanced, true)
})

test('a withdrawn-seat winner is still recoverable for audit', async () => {
    const report = await buildElectionReport(makeFakeSupabase())
    const tied = report.constituencies.find((c) => c.name === 'Dead Heat')

    // `winners` is empty because nobody was elected, but the election still
    // happened and somebody still led it. Losing that would make the report
    // unable to explain its own decision.
    assert.deepEqual(tied.winners, [])
    assert.equal(tied.leadingCandidates.length, 2)
    assert.ok(tied.leadingCandidates.every((w) => w.votes === 20))
})
