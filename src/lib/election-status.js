import { ELECTION_NAME } from '@/lib/election'

/**
 * The election's lifecycle, derived from `election_settings` and nothing else.
 *
 * Before this module existed, "is voting open?" was answered independently in
 * four places — the public status endpoint, cast_vote(), the ballot page and
 * the landing copy — and they did not all agree. The landing page in particular
 * described the election with a hardcoded string, so a poll that had closed
 * still advertised itself as upcoming until someone edited the source. The
 * admin settings row is the only thing that decides this now, and every screen
 * and route reads that decision from here.
 *
 * `deriveElectionStatus` is deliberately pure and takes `now`, because the
 * boundaries either side of an opening time are exactly what needs testing and
 * exactly what cannot be tested against a live clock.
 *
 * Nothing here imports the database client, so client components can share
 * these states and this copy without dragging the service-role client into a
 * browser bundle. The server-side read lives in `@/lib/election-server`.
 */

export const ELECTION_STATUS = {
    /** A window is published, but it has not opened yet. */
    SCHEDULED: 'scheduled',
    /** Voting is open right now. This is the only state in which a ballot may be cast. */
    OPEN: 'open',
    /** The published window has passed. */
    ENDED: 'ended',
    /** No usable window, or the master switch is off with nothing else to say. */
    CLOSED: 'closed',
}

/**
 * Voter-facing sentences for the states in which voting is refused.
 *
 * These are the exact words a voter sees whether they were stopped by the UI,
 * by an API route or by typing a ballot URL directly, so the platform never
 * gives two different accounts of the same situation.
 */
export const ELECTION_GATE_MESSAGES = {
    [ELECTION_STATUS.SCHEDULED]: 'The election has not started yet.',
    [ELECTION_STATUS.ENDED]: 'The election has ended.',
    [ELECTION_STATUS.CLOSED]: 'Voting is not currently open.',
}

/** Machine-readable codes so the browser can branch without matching prose. */
export const ELECTION_GATE_CODES = {
    [ELECTION_STATUS.SCHEDULED]: 'ELECTION_NOT_STARTED',
    [ELECTION_STATUS.ENDED]: 'ELECTION_ENDED',
    [ELECTION_STATUS.CLOSED]: 'ELECTION_CLOSED',
}

function toTime(value) {
    if (!value) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

/**
 * Maps a settings row onto one of the four states above.
 *
 * `is_active` is the master switch and is the only thing that can produce
 * OPEN: an administrator who switches the election off stops the poll
 * immediately, whatever the dates say. The dates then refine what an inactive
 * election is *called*, because "voting is currently closed" is a poor
 * description of an election whose published window ended last week, and a
 * worse one for an election whose window has been announced for next month.
 *
 * @param {object|null} row - election_settings row
 * @param {number} [now] - epoch ms, injectable for tests
 */
export function deriveElectionStatus(row, now = Date.now()) {
    const opensAt = toTime(row?.voting_opens_at)
    const closesAt = toTime(row?.voting_closes_at)

    if (row?.is_active) {
        if (opensAt !== null && opensAt > now) return ELECTION_STATUS.SCHEDULED
        if (closesAt !== null && closesAt < now) return ELECTION_STATUS.ENDED
        return ELECTION_STATUS.OPEN
    }

    // Inactive. Never OPEN, but say something true about where we are.
    if (closesAt !== null && closesAt < now) return ELECTION_STATUS.ENDED
    if (opensAt !== null && opensAt > now) return ELECTION_STATUS.SCHEDULED
    return ELECTION_STATUS.CLOSED
}

/**
 * The one colour each state is shown in, wherever a status pill appears.
 *
 * Green means one thing on this platform and one thing only: a ballot can be
 * cast right now. Every other state is the same neutral, because from a voter's
 * point of view they are the same fact — the poll is not open — and giving
 * "scheduled" its own amber treatment made an election that had simply not
 * started yet look like a warning, or worse, like something in progress.
 *
 * Kept here rather than beside each pill because the three surfaces that render
 * one — the landing panel, the election details page and the admin dashboard —
 * each had their own copy of this map, which is exactly how they came to
 * disagree.
 */
export const ELECTION_STATUS_TONE = {
    [ELECTION_STATUS.OPEN]: 'success',
    [ELECTION_STATUS.SCHEDULED]: 'neutral',
    [ELECTION_STATUS.ENDED]: 'neutral',
    [ELECTION_STATUS.CLOSED]: 'neutral',
}

export function electionStatusTone(status) {
    return ELECTION_STATUS_TONE[status] ?? ELECTION_STATUS_TONE[ELECTION_STATUS.CLOSED]
}

/** The one question every gate actually asks. */
export function isVotingOpen(status) {
    return status === ELECTION_STATUS.OPEN
}

export function electionGateMessage(status) {
    return ELECTION_GATE_MESSAGES[status] ?? ELECTION_GATE_MESSAGES[ELECTION_STATUS.CLOSED]
}

export function electionGateCode(status) {
    return ELECTION_GATE_CODES[status] ?? ELECTION_GATE_CODES[ELECTION_STATUS.CLOSED]
}

/**
 * Shapes a settings row into the object every public surface renders from.
 *
 * Only what a voter needs: the name, the description, the window and the
 * state. No counts, no results, nothing that could influence a vote in
 * progress.
 */
export function toPublicElection(row, now = Date.now()) {
    const status = deriveElectionStatus(row, now)
    return {
        electionName: row?.election_name ?? ELECTION_NAME,
        description: row?.description ?? null,
        status,
        isOpen: isVotingOpen(status),
        opensAt: row?.voting_opens_at ?? null,
        closesAt: row?.voting_closes_at ?? null,
    }
}

/** The settings columns every public surface is allowed to see. */
export const PUBLIC_ELECTION_COLUMNS =
    'election_name, description, is_active, voting_opens_at, voting_closes_at'

/** Ghana observes GMT all year; the platform never renders a reader-local zone. */
const ACCRA = 'Africa/Accra'

/**
 * Renders a timestamp for voters. Ghana keeps GMT year-round, so the platform
 * states one unambiguous zone rather than the reader's local one — an election
 * deadline that shifts depending on where the browser thinks it is would be
 * worse than useless.
 *
 * Lives here rather than in voter-client.js because server components need it
 * too, and exports from a 'use client' module cannot be called on the server.
 */
export function formatWhen(value) {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: ACCRA,
        }).format(new Date(value))
    } catch {
        return ''
    }
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A date written out in full: "14 March 2004".
 *
 * Used where a voter is being asked to *check* a date rather than glance at
 * it — chiefly their own date of birth on the registration receipt, where
 * "14/03/2004" and "03/14/2004" are the same eight characters arranged into
 * two different days and the reader cannot tell which convention was meant.
 *
 * A bare `YYYY-MM-DD` is deliberately not handed to `new Date()` and then
 * formatted in a zone. That parses as UTC midnight, and formatting UTC
 * midnight anywhere west of Greenwich yields the previous day — a voter's
 * date of birth silently off by one, on the exact screen that exists for them
 * to verify it. Date-only values are therefore rebuilt from their parts and
 * formatted in UTC, so the day that comes out is the day that went in.
 */
export function formatDateLong(value) {
    if (!value) return ''
    try {
        const parts = DATE_ONLY.exec(String(value))
        const date = parts
            ? new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
            : new Date(value)

        if (Number.isNaN(date.getTime())) return ''

        // Date.UTC silently rolls out-of-range components over: month 13 day 45
        // becomes 14 February the following year, which would put a confidently
        // wrong date in front of a voter on the very screen asking them to
        // check it. Only a value that survives the round trip is rendered.
        if (
            parts &&
            (date.getUTCFullYear() !== Number(parts[1]) ||
                date.getUTCMonth() !== Number(parts[2]) - 1 ||
                date.getUTCDate() !== Number(parts[3]))
        ) {
            return ''
        }

        return new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: parts ? 'UTC' : ACCRA,
        }).format(date)
    } catch {
        return ''
    }
}

/**
 * A full timestamp: "31 July 2026, 10:45 PM", or with `separator: ' at '`,
 * "15 August 2026 at 6:00 AM".
 *
 * Two formatters rather than one because no single locale gives both halves in
 * the form wanted: en-GB writes the date the way Ghana does but lowercases the
 * meridiem, while en-US uppercases the meridiem but puts the month first.
 */
export function formatDateTimeLong(value, { separator = ', ' } = {}) {
    if (!value) return ''
    try {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return ''

        const day = new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: ACCRA,
        }).format(date)

        const time = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: ACCRA,
        }).format(date)

        return `${day}${separator}${time}`
    } catch {
        return ''
    }
}
