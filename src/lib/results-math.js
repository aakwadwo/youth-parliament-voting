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
