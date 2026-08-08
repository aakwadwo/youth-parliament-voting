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

/**
 * Whether the count may be published.
 *
 * ENDED and nothing else. The temptation is to also allow CLOSED — the master
 * switch is off, so no more ballots can arrive — but CLOSED is the state for
 * an election with no usable window at all, including one that has not been
 * configured yet and one an administrator has switched off mid-poll to
 * investigate something. Publishing a running tally in either case would be a
 * partial result released while the election is still live, which is the exact
 * failure this gate exists to prevent. Results wait for a closing time that has
 * actually passed.
 *
 * A settings row that cannot be read yields no status and therefore no
 * results: this fails closed, like every other gate in the platform.
 */
export function areResultsPublic(status) {
    return status === ELECTION_STATUS.ENDED
}

/**
 * What the results page says when it is not showing results.
 *
 * Kept beside the states rather than in the page, so the sentence a voter reads
 * is derived from the same settings row that decides whether they see a tally —
 * a page that says "results will be published after voting ends" while the
 * gate has already opened would be its own kind of wrong.
 */
export const RESULTS_UNAVAILABLE = {
    [ELECTION_STATUS.SCHEDULED]: {
        title: 'Election results are not available yet',
        detail: 'Voting has not started. Results will be published on this page after voting ends.',
    },
    [ELECTION_STATUS.OPEN]: {
        title: 'Results will be available after voting ends',
        detail:
            'Voting is open. No totals, shares or partial counts are published while a ballot ' +
            'can still be cast — everyone sees the result for the first time at the same moment.',
    },
    [ELECTION_STATUS.CLOSED]: {
        title: 'Election results are not available',
        detail:
            'There is no published result at the moment. Results appear here once voting has ' +
            'closed and the Commission has completed the count.',
    },
}

export function resultsUnavailableMessage(status) {
    return RESULTS_UNAVAILABLE[status] ?? RESULTS_UNAVAILABLE[ELECTION_STATUS.CLOSED]
}

/**
 * What the platform offers a visitor to do, given where the election is.
 *
 * The landing page and the election details page both open with the same pair
 * of buttons, and both used to decide independently what those buttons should
 * say. That is how the front page came to offer "Sign in to vote" after the
 * poll closed — a button whose only destination is a refusal screen.
 *
 * The rule is that every action offered must lead somewhere that works:
 *
 * - **Open**: registering and signing in both do something, so both are shown.
 * - **Scheduled or closed**: the register genuinely is open, and the details
 *   page is where someone finds out when voting starts. Sign-in is not offered,
 *   because `/api/login` refuses before it even checks credentials.
 * - **Ended**: neither registering nor signing in leads anywhere any more, so
 *   neither is offered. The result is the only thing left, and it takes the
 *   whole call to action rather than being added as a third button beside two
 *   that no longer work.
 *
 * A failed settings read falls through to the open set, matching every other
 * surface: the routes gate themselves properly, so the worst case is a voter
 * reaching a screen that explains the position.
 *
 * @returns {Array<{ href: string, label: string }>} in priority order
 */
export function electionActions(status) {
    if (status === ELECTION_STATUS.ENDED) {
        return [{ href: '/results', label: 'View election results' }]
    }

    if (status === ELECTION_STATUS.OPEN || status == null) {
        return [
            { href: '/register', label: 'Register to vote' },
            { href: '/login', label: 'Sign in to vote' },
        ]
    }

    return [
        { href: '/register', label: 'Register to vote' },
        { href: '/election', label: 'View election details' },
    ]
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
