/**
 * The two calculations that decide what an election result *is*.
 *
 * Shared, not duplicated, because the admin report and the public results page
 * are two renderings of one count. A platform that rounds a share one way for
 * the Commission's PDF and another way for the page the public reads has
 * published two different results for the same election, and the discrepancy
 * would surface at the worst possible moment — a petition.
 *
 * Both are pure and take no client, so they are testable without a database.
 */

/**
 * A tie is a genuine election outcome, so this returns a list, not a value.
 *
 * Candidates on zero votes are excluded before the maximum is taken. Otherwise
 * a constituency where nobody voted would return every candidate as a joint
 * winner on nil, which is not a tie — it is an undeclared seat, and the caller
 * has to be able to tell the difference. An empty list means "no winner".
 */
export function resolveWinners(candidates) {
    const contested = candidates.filter((c) => c.votes > 0)
    if (contested.length === 0) return []
    const top = Math.max(...contested.map((c) => c.votes))
    return contested.filter((c) => c.votes === top)
}

/** One decimal place, and 0 rather than NaN when the denominator is zero. */
export function percent(part, whole) {
    if (!whole) return 0
    return Math.round((part / whole) * 1000) / 10
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Seat eligibility — the Commission's re-election rule.
 *
 * This sits AFTER `resolveWinners` and never inside it. That separation is the
 * whole design: `resolveWinners` answers "who got the most votes", which is a
 * property of the ballots and must keep meaning the same thing forever, in the
 * historical record and in any recount. `classifySeat` answers "does that
 * produce a sitting member", which is a policy decision the Commission took
 * after the count and could take differently next time.
 *
 * Collapsing the two would rewrite the arithmetic of the election to express an
 * administrative choice, and would make the 2026 tallies unreproducible the day
 * the threshold changes.
 *
 * Nothing here reads or writes the database. It takes a shape and returns a
 * label; the historical vote counts it is handed are passed through untouched.
 * ────────────────────────────────────────────────────────────────────────────*/

/**
 * The minimum number of votes a leading candidate must receive to take a seat.
 *
 * A Commission decision for the 2026 election, not a property of the ballot.
 * Named and exported so the threshold is stated once and every surface —
 * public page, admin portal, PDF, XLSX, CSV — reads the same number.
 */
export const MIN_VOTES_TO_BE_ELECTED = 50

export const SEAT_STATUS = {
    /** A candidate led on a tally at or above the minimum. */
    ELECTED: 'elected',
    /** No sitting member: the seat goes to a re-election. */
    RE_ELECTION: 're-election',
}

/**
 * Why a seat is going to a re-election.
 *
 * Three distinct causes, kept distinct. "Nobody stood" and "somebody stood and
 * received four votes" are the same outcome for the Parliament and completely
 * different facts about the election, and the published result has to be able
 * to tell a reader which one happened.
 */
export const SEAT_REASONS = {
    NO_CANDIDATE: 'No candidate stood',
    BELOW_MINIMUM: (min = MIN_VOTES_TO_BE_ELECTED) =>
        `Re-election required — winner received fewer than ${min} votes`,
    NO_VALID_WINNER: 'Re-election required — no valid winner',
}

/**
 * Classifies one seat.
 *
 * @param {object} seat
 * @param {number} seat.candidateCount how many candidates stood
 * @param {Array<{votes:number}>} seat.winners the output of `resolveWinners`
 * @param {number} [seat.minVotes] threshold override, for tests
 * @returns {{status: string, reason: string|null, leadingVotes: number}}
 */
export function classifySeat({
    candidateCount = 0,
    winners = [],
    minVotes = MIN_VOTES_TO_BE_ELECTED,
} = {}) {
    if (candidateCount <= 0) {
        return { status: SEAT_STATUS.RE_ELECTION, reason: SEAT_REASONS.NO_CANDIDATE, leadingVotes: 0 }
    }

    // Candidates stood but `resolveWinners` returned nobody, which it does only
    // when every candidate is on zero. Sene East is this case.
    if (winners.length === 0) {
        return {
            status: SEAT_STATUS.RE_ELECTION,
            reason: SEAT_REASONS.NO_VALID_WINNER,
            leadingVotes: 0,
        }
    }

    // Every winner is tied on the same tally by construction, so the first is
    // the leading figure for all of them.
    const leadingVotes = Number(winners[0]?.votes ?? 0)

    if (leadingVotes < minVotes) {
        return {
            status: SEAT_STATUS.RE_ELECTION,
            reason: SEAT_REASONS.BELOW_MINIMUM(minVotes),
            leadingVotes,
        }
    }

    return { status: SEAT_STATUS.ELECTED, reason: null, leadingVotes }
}

/** Convenience for the render paths, which ask this constantly. */
export function isElectedSeat(seat) {
    return seat?.status === SEAT_STATUS.ELECTED
}
