import test from 'node:test'
import assert from 'node:assert/strict'

import {
    ELECTION_STATUS,
    RESULTS_UNDER_REVIEW,
    areResultsPublic,
    canPublishResults,
    electionActions,
    electionResultsNotice,
    resultsUnavailableMessage,
    toPublication,
    toPublicElection,
} from '@/lib/election-status'
import { readPublicResults } from '@/lib/public-results'
import { makeFakeSupabase } from './fixtures/fake-supabase.mjs'

/**
 * Controlled release of the result.
 *
 * The property under test throughout: **voting ending does not publish
 * anything**. Until this existed, `areResultsPublic` was `status === 'ended'`,
 * which made the closing timestamp the publishing authority — the tally went up
 * the instant the window elapsed, before anyone at the Commission had checked
 * it against the register. Publication is now a separate, recorded decision,
 * and every state below is one an election really passes through on the day.
 */

const NOW = Date.parse('2026-08-10T12:00:00Z')
const PAST = '2026-08-08T08:00:00Z'
const FUTURE = '2026-08-12T08:00:00Z'
const DECLARED = '2026-08-09T10:00:00Z'

/** A settings row, as the database holds it. */
const row = (over = {}) => ({
    id: 'settings-1',
    election_name: 'Test Election 2026',
    is_active: false,
    voting_opens_at: null,
    voting_closes_at: null,
    results_published_at: null,
    ...over,
})

/** The four combinations of state and publication the platform has to survive. */
const SCHEDULED = row({ is_active: true, voting_opens_at: FUTURE, voting_closes_at: FUTURE })
const OPEN = row({ is_active: true, voting_opens_at: PAST, voting_closes_at: FUTURE })
const ENDED = row({ is_active: true, voting_opens_at: PAST, voting_closes_at: PAST })
const ENDED_PUBLISHED = row({
    is_active: true,
    voting_opens_at: PAST,
    voting_closes_at: PAST,
    results_published_at: DECLARED,
})

const publicElection = (settings) => toPublicElection(settings, NOW)

// --------------------------------------------------------------------------
// Permission to publish
// --------------------------------------------------------------------------

test('the Commission may only release the count once voting has ended', () => {
    assert.equal(canPublishResults(ELECTION_STATUS.ENDED), true)

    // CLOSED is refused deliberately: it covers an election switched off
    // mid-poll to investigate something, where a count exists but releasing it
    // would be a partial result published while the election is still live.
    for (const status of [
        ELECTION_STATUS.SCHEDULED,
        ELECTION_STATUS.OPEN,
        ELECTION_STATUS.CLOSED,
    ]) {
        assert.equal(canPublishResults(status), false, `${status} must not allow publication`)
    }

    // Fails closed on a status it has never heard of.
    assert.equal(canPublishResults(undefined), false)
    assert.equal(canPublishResults('something-new'), false)
})

// --------------------------------------------------------------------------
// The state machine, one case per row
// --------------------------------------------------------------------------

test('scheduled: nothing is published and nothing links to a result', () => {
    const election = publicElection(SCHEDULED)

    assert.equal(election.status, ELECTION_STATUS.SCHEDULED)
    assert.equal(election.resultsPublished, false)
    assert.equal(areResultsPublic(election), false)
    assert.equal(hasResultsLink(election), false)
    assert.equal(electionResultsNotice(election), null)
})

test('open: no result, no partial figures, no link, while a ballot can be cast', () => {
    const election = publicElection(OPEN)

    assert.equal(election.status, ELECTION_STATUS.OPEN)
    assert.equal(areResultsPublic(election), false)
    assert.equal(hasResultsLink(election), false)
})

test('ended and unpublished: the count is withheld and the wait is explained', () => {
    const election = publicElection(ENDED)

    assert.equal(election.status, ELECTION_STATUS.ENDED)
    assert.equal(election.resultsPublished, false)
    assert.equal(areResultsPublic(election), false)

    // The regression this whole feature exists to prevent.
    assert.equal(
        hasResultsLink(election),
        false,
        'the landing page offered a result the Commission had not released'
    )

    // And it does not simply go quiet: it says what is happening and who is
    // doing it, on the front page and on the results page alike.
    assert.equal(electionResultsNotice(election), RESULTS_UNDER_REVIEW)
    assert.match(RESULTS_UNDER_REVIEW, /voting has ended/i)
    assert.match(RESULTS_UNDER_REVIEW, /reviewed by the .*Electoral Commission/i)
    assert.match(resultsUnavailableMessage(election.status).detail, /reviewed by the/i)
})

test('ended and published: the result is public and is the only thing offered', () => {
    const election = publicElection(ENDED_PUBLISHED)

    assert.equal(election.resultsPublished, true)
    assert.equal(election.resultsPublishedAt, DECLARED)
    assert.equal(areResultsPublic(election), true)
    assert.deepEqual(electionActions(election), [
        { href: '/results', label: 'View election results' },
    ])
    // Nothing left to explain once the figures are on the page.
    assert.equal(electionResultsNotice(election), null)
})

test('published, then withdrawn: the result disappears again immediately', () => {
    const published = publicElection(ENDED_PUBLISHED)
    assert.equal(areResultsPublic(published), true)

    // Unpublishing clears the column, which is the whole of the change.
    const withdrawn = publicElection(row({ ...ENDED_PUBLISHED, results_published_at: null }))

    assert.equal(withdrawn.resultsPublished, false)
    assert.equal(withdrawn.resultsPublishedAt, null)
    assert.equal(areResultsPublic(withdrawn), false)
    assert.equal(hasResultsLink(withdrawn), false)
    assert.equal(electionResultsNotice(withdrawn), RESULTS_UNDER_REVIEW)
})

test('reopening voting takes a published result back down without touching the column', () => {
    // An administrator who reopens the poll to accept late ballots has, by
    // that act, unpublished the result. Requiring them to remember to clear
    // the timestamp as well would leave a completed tally on public display
    // beside a ballot box that is open again.
    const reopened = publicElection(
        row({
            is_active: true,
            voting_opens_at: PAST,
            voting_closes_at: FUTURE,
            results_published_at: DECLARED,
        })
    )

    assert.equal(reopened.status, ELECTION_STATUS.OPEN)
    assert.equal(reopened.resultsPublished, false)
    assert.equal(areResultsPublic(reopened), false)
    // The declaration date does not leak either: a public surface must not be
    // able to tell that a result exists and is being held back.
    assert.equal(reopened.resultsPublishedAt, null)
})

// --------------------------------------------------------------------------
// The gate itself
// --------------------------------------------------------------------------

test('areResultsPublic refuses anything that is not a fully published election', () => {
    for (const election of [
        null,
        undefined,
        {},
        // A bare status, which is what every caller passed before this took an
        // object. Refused rather than silently publishing.
        ELECTION_STATUS.ENDED,
        { status: ELECTION_STATUS.ENDED },
        { status: ELECTION_STATUS.ENDED, resultsPublished: false },
        // Published, but voting is not over: both conditions are required, and
        // the second is re-checked here rather than trusted from the shaper.
        { status: ELECTION_STATUS.OPEN, resultsPublished: true },
        { status: ELECTION_STATUS.SCHEDULED, resultsPublished: true },
        { status: ELECTION_STATUS.CLOSED, resultsPublished: true },
        { resultsPublished: true },
    ]) {
        assert.equal(
            areResultsPublic(election),
            false,
            `results were published for ${JSON.stringify(election)}`
        )
    }

    assert.equal(
        areResultsPublic({ status: ELECTION_STATUS.ENDED, resultsPublished: true }),
        true
    )
})

// --------------------------------------------------------------------------
// Server-side enforcement: no figures are read while publication is off
// --------------------------------------------------------------------------

/**
 * A client that fails the test if the results function is called at all.
 *
 * Stronger than asserting on the return value: it proves the tallies are never
 * fetched while the result is withheld, so an unauthenticated request in that
 * state cannot leak them through a log line, an error message or a future
 * careless render.
 */
function forbiddenSupabase() {
    return {
        rpc: async (name) => {
            throw new Error(`the database was queried (${name}) while results were unpublished`)
        },
    }
}

test('the server reads no tallies at all while the result is withheld', async () => {
    for (const settings of [SCHEDULED, OPEN, ENDED]) {
        const results = await readPublicResults(forbiddenSupabase(), publicElection(settings))
        assert.equal(results, null)
    }

    // And for the two failure modes the public page has to survive: an
    // election that could not be read, and one that does not exist.
    assert.equal(await readPublicResults(forbiddenSupabase(), null), null)
    assert.equal(await readPublicResults(forbiddenSupabase(), publicElection(null)), null)
})

test('an unauthenticated read while unpublished carries no result data whatsoever', async () => {
    const results = await readPublicResults(makeFakeSupabase(), publicElection(ENDED))

    assert.equal(results, null)

    // Nothing to serialise means nothing to leak: no candidate name, no count,
    // no share, no winner from the fixture election reaches a caller.
    assert.equal(JSON.stringify(results), 'null')
})

test('once published, the same call returns the full public result', async () => {
    const election = publicElection(ENDED_PUBLISHED)
    const results = await readPublicResults(makeFakeSupabase(), election)

    assert.ok(results, 'a published election returned no results')
    assert.equal(results.summary.totalVotes, 140)
    // Four: the three contested seats plus the one nobody stood in, which the
    // re-election rule brought into the published result.
    assert.equal(results.summary.totalConstituencies, 4)
    assert.equal(results.regions.length, 3)

    // The declaration is dated by when the Commission released it, not by when
    // voting closed — the page states both, and they are different instants.
    assert.equal(results.publishedAt, DECLARED)
    assert.equal(results.closedAt, election.closesAt)
})

// --------------------------------------------------------------------------
// The admin view of the same row
// --------------------------------------------------------------------------

test('the admin shape separates released, allowed and actually public', () => {
    assert.deepEqual(toPublication(ENDED_PUBLISHED, NOW), {
        id: 'settings-1',
        status: ELECTION_STATUS.ENDED,
        published: true,
        publishedAt: DECLARED,
        canPublish: true,
        isPublic: true,
    })

    assert.deepEqual(toPublication(ENDED, NOW), {
        id: 'settings-1',
        status: ELECTION_STATUS.ENDED,
        published: false,
        publishedAt: null,
        canPublish: true,
        isPublic: false,
    })

    // Voting is open: publication is not allowed, and nothing is public.
    const open = toPublication(OPEN, NOW)
    assert.equal(open.canPublish, false)
    assert.equal(open.isPublic, false)
})

test('a released result that voting has reopened over reads as withheld, not as unreleased', () => {
    // The administrator must be able to tell these two apart. The public
    // cannot, and must not.
    const publication = toPublication(
        row({
            is_active: true,
            voting_opens_at: PAST,
            voting_closes_at: FUTURE,
            results_published_at: DECLARED,
        }),
        NOW
    )

    assert.equal(publication.published, true)
    assert.equal(publication.publishedAt, DECLARED)
    assert.equal(publication.canPublish, false)
    assert.equal(publication.isPublic, false)
})

test('a deployment with no settings row can neither publish nor show anything', () => {
    const publication = toPublication(null, NOW)

    assert.equal(publication.id, null)
    assert.equal(publication.published, false)
    assert.equal(publication.canPublish, false)
    assert.equal(publication.isPublic, false)
})

/** Whether the platform would offer a link to the result in this state. */
function hasResultsLink(election) {
    return electionActions(election).some((action) => action.href === '/results')
}
