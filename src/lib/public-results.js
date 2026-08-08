import { resolveWinners, percent } from '@/lib/results-math'
import { areResultsPublic } from '@/lib/election-status'

/**
 * The aggregate election result, in the only shape the public is ever shown.
 *
 * Deliberately a separate builder from `@/lib/election-report`, not a filtered
 * view of it. The report is an internal document and is allowed to grow new
 * fields — register sizes, reconciliation, who generated it, when the first
 * ballot landed. If the public page were a projection of that object, every
 * future field added to the report would be one careless spread away from
 * being published. This function can only emit what it explicitly writes, so
 * "what does the public see" is answerable by reading one object literal.
 *
 * What it reads: `get_results()` (migration 0009) and nothing else. That
 * function returns one row per candidate with a count — it never touches
 * `voters`, and `votes` rows carry no voter reference by schema, so there is
 * no voter-identifying data on this path to leak in the first place.
 *
 * Database UUIDs are not emitted. They are of no use to a reader and every
 * identifier published is one more thing an outside party can correlate
 * against; the keys below are positional and stable within one response.
 */

const UNSPECIFIED_REGION = 'Region not set'

/**
 * The gate and the builder, in that order, in one call.
 *
 * The page could ask `areResultsPublic()` itself and then call the builder —
 * and it used to — but that leaves the check and the query as two statements a
 * future edit can separate, in a file where separating them publishes an
 * election result early. Here the only way to obtain a tally is through the
 * function that refuses to produce one until the Commission has released it,
 * and `get_results()` is not reached at all while publication is off. An
 * unauthenticated request in that state costs one settings read and returns no
 * figures, because none were ever fetched.
 *
 * @param supabase service-role client
 * @param {object|null} election - the public election object from `readElection`
 * @returns {Promise<object|null>} the published result, or null if it is not public
 */
export async function readPublicResults(supabase, election) {
    if (!areResultsPublic(election)) return null
    return buildPublicResults(supabase, election)
}

/**
 * @param supabase service-role client
 * @param {object} election  the public election object from `readElection`
 */
export async function buildPublicResults(supabase, election) {
    const { data, error } = await supabase.rpc('get_results')
    if (error) throw error

    // get_results already orders by constituency, then votes descending, then
    // candidate name — the order the result is declared in. It is preserved
    // exactly; only the grouping is done here.
    const byConstituency = new Map()

    for (const row of data ?? []) {
        if (!byConstituency.has(row.constituency_id)) {
            byConstituency.set(row.constituency_id, {
                name: row.constituency_name,
                region: row.region?.trim() || UNSPECIFIED_REGION,
                totalVotes: 0,
                candidates: [],
            })
        }
        const entry = byConstituency.get(row.constituency_id)
        const votes = Number(row.votes ?? 0)
        entry.totalVotes += votes
        entry.candidates.push({
            name: row.candidate_name,
            isActive: row.is_active !== false,
            votes,
        })
    }

    const byRegion = new Map()
    let totalVotes = 0
    let declared = 0
    let tiedCount = 0

    for (const constituency of byConstituency.values()) {
        totalVotes += constituency.totalVotes

        // Share is of the ballots cast in *this* constituency, which is the
        // only denominator that means anything: these are single-member seats
        // counted separately, and a share of the national total would be a
        // different and meaningless number.
        const candidates = constituency.candidates.map((candidate, i) => ({
            key: `c${i}`,
            name: candidate.name,
            isActive: candidate.isActive,
            votes: candidate.votes,
            sharePct: percent(candidate.votes, constituency.totalVotes),
        }))

        const winners = resolveWinners(candidates)
        const winnerKeys = new Set(winners.map((w) => w.key))
        const tied = winners.length > 1

        if (winners.length > 0) declared += 1
        if (tied) tiedCount += 1

        const shaped = {
            name: constituency.name,
            region: constituency.region,
            totalVotes: constituency.totalVotes,
            // A seat with no ballots has no winner, and a seat where the top
            // two are level has two. Neither is quietly resolved to one name.
            tied,
            winners: winners.map((w) => w.name),
            candidates: candidates.map((c) => ({ ...c, isWinner: winnerKeys.has(c.key) })),
        }

        if (!byRegion.has(constituency.region)) {
            byRegion.set(constituency.region, {
                region: constituency.region,
                totalVotes: 0,
                constituencies: [],
            })
        }
        const region = byRegion.get(constituency.region)
        region.totalVotes += constituency.totalVotes
        region.constituencies.push(shaped)
    }

    // Sorted before the keys are assigned, so a key describes where a section
    // actually sits in the published document.
    const regions = Array.from(byRegion.values())
        .sort((a, b) => a.region.localeCompare(b.region, 'en-GB'))
        .map((region, i) => ({
            ...region,
            key: `r${i}`,
            constituencies: region.constituencies
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))
                .map((c, j) => ({ ...c, key: `r${i}c${j}` })),
        }))

    return {
        electionName: election?.electionName ?? null,
        closedAt: election?.closesAt ?? null,
        // When the Commission released these figures — a different fact from
        // when voting closed, and the one that dates the declaration.
        publishedAt: election?.resultsPublishedAt ?? null,
        summary: {
            totalVotes,
            totalConstituencies: byConstituency.size,
            declaredConstituencies: declared,
            tiedConstituencies: tiedCount,
            totalRegions: regions.length,
        },
        regions,
    }
}
