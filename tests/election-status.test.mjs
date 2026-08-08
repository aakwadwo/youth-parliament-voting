import test from 'node:test'
import assert from 'node:assert/strict'

import {
    ELECTION_STATUS,
    deriveElectionStatus,
    isVotingOpen,
    electionGateMessage,
    electionGateCode,
    electionStatusTone,
    toPublicElection,
    ELECTION_GATE_MESSAGES,
    ELECTION_STATUS_TONE,
    formatDateLong,
    formatDateTimeLong,
    electionActions,
} from '@/lib/election-status'

const NOW = Date.parse('2026-08-10T12:00:00Z')
const BEFORE = '2026-08-12T08:00:00Z'
const AFTER = '2026-08-08T08:00:00Z'

const row = (over = {}) => ({
    is_active: true,
    voting_opens_at: null,
    voting_closes_at: null,
    ...over,
})

test('an active election inside its window is open', () => {
    const status = deriveElectionStatus(
        row({ voting_opens_at: AFTER, voting_closes_at: BEFORE }),
        NOW
    )
    assert.equal(status, ELECTION_STATUS.OPEN)
    assert.equal(isVotingOpen(status), true)
})

test('an active election before its opening time is scheduled, not open', () => {
    const status = deriveElectionStatus(
        row({ voting_opens_at: BEFORE, voting_closes_at: '2026-08-20T08:00:00Z' }),
        NOW
    )
    assert.equal(status, ELECTION_STATUS.SCHEDULED)
    assert.equal(isVotingOpen(status), false)
})

test('an active election past its closing time has ended', () => {
    const status = deriveElectionStatus(
        row({ voting_opens_at: '2026-08-01T08:00:00Z', voting_closes_at: AFTER }),
        NOW
    )
    assert.equal(status, ELECTION_STATUS.ENDED)
    assert.equal(isVotingOpen(status), false)
})

test('an active election with no dates at all is open', () => {
    // is_active on its own is a deliberate "open until I say otherwise". An
    // administrator who flips the switch without setting dates has opened the
    // poll, and telling them it is closed would be the wrong surprise.
    assert.equal(deriveElectionStatus(row(), NOW), ELECTION_STATUS.OPEN)
})

test('is_active is a hard master switch: nothing inactive is ever open', () => {
    // The single most important property in this module. An administrator who
    // switches the election off has stopped the poll, whatever the dates say.
    const windows = [
        {},
        { voting_opens_at: AFTER, voting_closes_at: BEFORE },
        { voting_opens_at: BEFORE },
        { voting_closes_at: AFTER },
        { voting_opens_at: '2026-08-01T00:00:00Z', voting_closes_at: '2026-08-20T00:00:00Z' },
    ]
    for (const window of windows) {
        const status = deriveElectionStatus({ is_active: false, ...window }, NOW)
        assert.equal(isVotingOpen(status), false, `inactive election reported open: ${JSON.stringify(window)}`)
    }
})

test('an inactive election is still described by its dates where it has them', () => {
    // "Voting is currently closed" is a poor description of an election whose
    // published window ended last week, or whose window starts next month.
    assert.equal(
        deriveElectionStatus({ is_active: false, voting_closes_at: AFTER }, NOW),
        ELECTION_STATUS.ENDED
    )
    assert.equal(
        deriveElectionStatus({ is_active: false, voting_opens_at: BEFORE }, NOW),
        ELECTION_STATUS.SCHEDULED
    )
    assert.equal(deriveElectionStatus({ is_active: false }, NOW), ELECTION_STATUS.CLOSED)
})

test('a past close beats a future open when both are set on an inactive election', () => {
    // A window that has already run is the more relevant fact than one that
    // has been re-announced for later.
    assert.equal(
        deriveElectionStatus(
            { is_active: false, voting_opens_at: BEFORE, voting_closes_at: AFTER },
            NOW
        ),
        ELECTION_STATUS.ENDED
    )
})

test('the boundaries are inclusive of the whole published window', () => {
    const opens = '2026-08-10T12:00:00Z'
    const closes = '2026-08-10T12:00:00Z'

    // Exactly at the opening instant the poll is open, not still scheduled.
    assert.equal(
        deriveElectionStatus(row({ voting_opens_at: opens }), Date.parse(opens)),
        ELECTION_STATUS.OPEN
    )
    // Exactly at the closing instant it is open; a voter mid-submit at the
    // stroke of the deadline is not turned away by a rounding decision.
    assert.equal(
        deriveElectionStatus(row({ voting_closes_at: closes }), Date.parse(closes)),
        ELECTION_STATUS.OPEN
    )
    // One millisecond later it is not.
    assert.equal(
        deriveElectionStatus(row({ voting_closes_at: closes }), Date.parse(closes) + 1),
        ELECTION_STATUS.ENDED
    )
})

test('unparseable or missing dates never produce a false open', () => {
    // A corrupt timestamp must degrade to "no window", not to "open".
    assert.equal(
        deriveElectionStatus({ is_active: false, voting_opens_at: 'not-a-date' }, NOW),
        ELECTION_STATUS.CLOSED
    )
    assert.equal(deriveElectionStatus(null, NOW), ELECTION_STATUS.CLOSED)
    assert.equal(deriveElectionStatus(undefined, NOW), ELECTION_STATUS.CLOSED)
    assert.equal(isVotingOpen(deriveElectionStatus(null, NOW)), false)
})

test('every refusing state has a voter-facing sentence and a stable code', () => {
    for (const status of [
        ELECTION_STATUS.SCHEDULED,
        ELECTION_STATUS.ENDED,
        ELECTION_STATUS.CLOSED,
    ]) {
        assert.match(electionGateMessage(status), /\S/)
        assert.match(electionGateCode(status), /^[A-Z_]+$/)
    }
})

test('the two required gate sentences are exactly as specified', () => {
    assert.equal(
        ELECTION_GATE_MESSAGES[ELECTION_STATUS.SCHEDULED],
        'The election has not started yet.'
    )
    assert.equal(ELECTION_GATE_MESSAGES[ELECTION_STATUS.ENDED], 'The election has ended.')
})

/**
 * The status pill is the one thing on the front page a voter reads before
 * anything else, and colour is how they read it. Green has to mean "a ballot
 * can be cast right now" and nothing else, on every screen that shows a pill.
 */

test('only an open poll is shown in green', () => {
    assert.equal(electionStatusTone(ELECTION_STATUS.OPEN), 'success')
    for (const status of [
        ELECTION_STATUS.SCHEDULED,
        ELECTION_STATUS.ENDED,
        ELECTION_STATUS.CLOSED,
    ]) {
        assert.equal(
            electionStatusTone(status),
            'neutral',
            `${status} is not shown in the same neutral as a closed poll`
        )
    }
})

test('a scheduled election is not styled as a warning', () => {
    // It was amber, which put a caution colour on the ordinary state of an
    // election that has simply been announced and has not started yet.
    assert.notEqual(ELECTION_STATUS_TONE[ELECTION_STATUS.SCHEDULED], 'warning')
    assert.equal(
        ELECTION_STATUS_TONE[ELECTION_STATUS.SCHEDULED],
        ELECTION_STATUS_TONE[ELECTION_STATUS.ENDED]
    )
})

test('every state has a tone, and an unknown one falls back to neutral', () => {
    for (const status of Object.values(ELECTION_STATUS)) {
        assert.match(electionStatusTone(status), /\S/)
    }
    assert.equal(electionStatusTone('something-else'), 'neutral')
    assert.equal(electionStatusTone(undefined), 'neutral')
})

test('an unknown status falls back to the closed wording rather than undefined', () => {
    assert.equal(
        electionGateMessage('something-else'),
        ELECTION_GATE_MESSAGES[ELECTION_STATUS.CLOSED]
    )
    assert.ok(electionGateCode('something-else'))
})

test('the public shape carries the window and never leaks other settings', () => {
    const election = toPublicElection(
        {
            election_name: 'Test Election',
            description: 'A description.',
            is_active: true,
            voting_opens_at: AFTER,
            voting_closes_at: BEFORE,
            // Anything else on the row must not travel to a voter.
            id: 'secret-id',
            some_internal_column: 'nope',
        },
        NOW
    )

    assert.deepEqual(Object.keys(election).sort(), [
        'closesAt',
        'description',
        'electionName',
        'isOpen',
        'opensAt',
        'status',
    ])
    assert.equal(election.isOpen, true)
    assert.equal(election.status, ELECTION_STATUS.OPEN)
})

test('a missing settings row still yields a renderable election', () => {
    // A fresh deployment has no row. Public pages must not crash on it.
    const election = toPublicElection(null, NOW)
    assert.equal(election.isOpen, false)
    assert.equal(election.status, ELECTION_STATUS.CLOSED)
    assert.match(election.electionName, /\S/)
    assert.equal(election.opensAt, null)
    assert.equal(election.closesAt, null)
})

/**
 * The registration receipt exists so a voter can catch a mistyped date of
 * birth — which is half their sign-in credential — before polling day. A
 * formatter that shifts that date by a day would turn the one screen meant to
 * prevent a silent lockout into the thing that causes one.
 */

test('a date of birth is written out in words, never as ambiguous digits', () => {
    assert.equal(formatDateLong('2004-03-14'), '14 March 2004')
    assert.equal(formatDateLong('2003-10-12'), '12 October 2003')
})

test('a date-only value never shifts a day, whatever the server timezone', () => {
    // The trap: new Date('2004-01-01') parses as UTC midnight, and formatting
    // UTC midnight in a zone west of Greenwich yields 31 December 2003. These
    // are the boundary dates where that would show up.
    for (const [input, expected] of [
        ['2004-01-01', '1 January 2004'],
        ['2004-12-31', '31 December 2004'],
        ['2000-02-29', '29 February 2000'],
        ['1990-06-01', '1 June 1990'],
    ]) {
        assert.equal(formatDateLong(input), expected, `${input} formatted wrongly`)
    }
})

test('the day is stable across the timezones a server might run in', () => {
    const original = process.env.TZ
    try {
        for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Tokyo']) {
            process.env.TZ = zone
            assert.equal(
                formatDateLong('2004-03-14'),
                '14 March 2004',
                `date of birth shifted when TZ=${zone}`
            )
        }
    } finally {
        if (original === undefined) delete process.env.TZ
        else process.env.TZ = original
    }
})

test('a timestamp reads as a full date and a 12-hour time', () => {
    // Ghana is GMT year-round, so the instant and the rendered time agree.
    assert.equal(formatDateTimeLong('2026-07-31T22:45:00+00:00'), '31 July 2026, 10:45 PM')
    assert.equal(formatDateTimeLong('2026-08-15T06:00:00+00:00'), '15 August 2026, 6:00 AM')
})

test('the separator switches the same timestamp between receipt and prose', () => {
    assert.equal(
        formatDateTimeLong('2026-08-15T06:00:00+00:00', { separator: ' at ' }),
        '15 August 2026 at 6:00 AM'
    )
})

test('a timestamp is rendered in Accra, not in the reader or server zone', () => {
    // An election deadline that moves with the browser would be worse than
    // useless. 23:30 UTC must not become the next day.
    const original = process.env.TZ
    try {
        for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
            process.env.TZ = zone
            assert.equal(
                formatDateTimeLong('2026-08-15T23:30:00+00:00'),
                '15 August 2026, 11:30 PM',
                `timestamp shifted when TZ=${zone}`
            )
        }
    } finally {
        if (original === undefined) delete process.env.TZ
        else process.env.TZ = original
    }
})

test('missing and malformed values format to empty, never to "Invalid Date"', () => {
    // These land straight on a voter's confirmation screen, so the failure has
    // to be a blank row that the receipt drops, not a visible error string.
    for (const bad of [null, undefined, '', 'not-a-date', '2004-13-45', {}]) {
        assert.equal(formatDateLong(bad), '', `formatDateLong(${JSON.stringify(bad)})`)
        assert.equal(formatDateTimeLong(bad), '', `formatDateTimeLong(${JSON.stringify(bad)})`)
    }
})

// --------------------------------------------------------------------------
// What the platform offers a visitor to do
// --------------------------------------------------------------------------

test('an open poll offers registering and signing in, and nothing else', () => {
    assert.deepEqual(electionActions(ELECTION_STATUS.OPEN), [
        { href: '/register', label: 'Register to vote' },
        { href: '/login', label: 'Sign in to vote' },
    ])
})

test('before a poll opens, sign-in is not offered at all', () => {
    // /api/login refuses outside the window before it even checks credentials,
    // so offering it here would be a button whose only destination is a
    // refusal screen. The register genuinely is open, so that stays.
    for (const status of [ELECTION_STATUS.SCHEDULED, ELECTION_STATUS.CLOSED]) {
        assert.deepEqual(
            electionActions(status),
            [
                { href: '/register', label: 'Register to vote' },
                { href: '/election', label: 'View election details' },
            ],
            status
        )
    }
})

test('once voting has ended, the only action offered is the result', () => {
    const actions = electionActions(ELECTION_STATUS.ENDED)

    assert.deepEqual(actions, [{ href: '/results', label: 'View election results' }])

    // Specifically: neither of the two actions that now lead to a refusal.
    assert.equal(
        actions.some((a) => a.href === '/register' || a.href === '/login'),
        false,
        'a dead-end voting action survived past the close of the poll'
    )
})

test('no state offers more than two actions', () => {
    for (const status of Object.values(ELECTION_STATUS)) {
        assert.ok(
            electionActions(status).length <= 2,
            `${status} offers ${electionActions(status).length} actions`
        )
    }
})

test('an unreadable election falls back to the open set rather than nothing', () => {
    // A page with no call to action at all is a worse failure than one whose
    // buttons lead to a screen explaining the position — and the routes behind
    // them gate themselves regardless.
    for (const missing of [null, undefined]) {
        assert.deepEqual(electionActions(missing), electionActions(ELECTION_STATUS.OPEN))
    }
})
