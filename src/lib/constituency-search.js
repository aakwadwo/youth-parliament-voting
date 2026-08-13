/**
 * The rule that decides whether a voter can find their own constituency.
 *
 * Kept out of the component for the same reason `constituency-name.js` is kept
 * out of its route: the component is a `.jsx` file that the plain-Node test
 * runner cannot load, and this is not a piece of logic that should only be
 * provable by clicking. Choosing the wrong constituency means voting in the
 * wrong race, so the matching has to be pinned by tests.
 */

/**
 * How many rows the picker puts in the DOM at once.
 *
 * All 276 constituencies used to be rendered on every open — roughly 1,400
 * elements and 276 inline SVG icons — and cmdk then re-scored every one of them
 * on each keystroke. On the mid-range Android phones most voters will use, that
 * is the difference between a picker that responds to typing and one that
 * stutters.
 *
 * 50 is comfortably more than fits on any screen, so scrolling never reaches
 * the end of the list before the next keystroke narrows it. Correctness does
 * not depend on the cap: matches are ranked before they are cut, so the closest
 * match to what has been typed is always among the rows kept, and typing one
 * more character narrows the set rather than paging through it.
 */
export const MAX_VISIBLE_CONSTITUENCIES = 50

/**
 * Scores one constituency against a search term.
 *
 * cmdk's default scorer is a fuzzy subsequence match, which ranked "Techiman
 * North" above "Tema West" for the search "Tema". On a ballot form matching has
 * to be predictable: substring only, with names that start with the search term
 * ranked above ones that merely contain it, and region matches last.
 *
 * @returns {number} 1 = prefix match, 0.5 = substring match, 0 = no match
 */
export function scoreConstituency(constituency, search) {
    const needle = String(search ?? '').trim().toLowerCase()
    if (!needle) return 1

    const name = String(constituency?.name ?? '').toLowerCase()
    const region = String(constituency?.region ?? '').toLowerCase()
    const haystack = `${name} ${region}`.trim()

    // The name leads, so a search for "Tema" prefers "Tema West" over a
    // constituency whose *region* merely starts with those letters.
    if (name.startsWith(needle)) return 1
    if (haystack.startsWith(needle)) return 1
    if (haystack.includes(needle)) return 0.5
    return 0
}

/**
 * Ranks the list against a search term and caps what is rendered.
 *
 * The sort is stable, so constituencies of equal score keep the order they
 * arrived in — which is `order by name` from the server. That is why the
 * ordering of the incoming list is part of the search behaviour rather than a
 * presentational detail.
 *
 * @returns {{ visible: Array, total: number, truncated: boolean }}
 *   `total` is how many matched, not how many are shown, so the UI can say when
 *   it is showing a subset instead of implying the list is complete.
 */
export function filterConstituencies(
    constituencies,
    search,
    limit = MAX_VISIBLE_CONSTITUENCIES
) {
    const scored = []

    for (const constituency of constituencies ?? []) {
        const score = scoreConstituency(constituency, search)
        if (score > 0) scored.push({ constituency, score })
    }

    scored.sort((a, b) => b.score - a.score)

    return {
        visible: scored.slice(0, limit).map((entry) => entry.constituency),
        total: scored.length,
        truncated: scored.length > limit,
    }
}
