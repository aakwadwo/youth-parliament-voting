import {
    resolveWinners,
    percent,
    classifySeat,
    isElectedSeat,
    SEAT_STATUS,
    MIN_VOTES_TO_BE_ELECTED,
} from '@/lib/results-math'
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
    // Two reads, and the second one is load-bearing.
    //
    // `get_results()` is `from constituencies JOIN candidates` — an inner join —
    // so a constituency where nobody stood produces no rows and is invisible
    // here. For 132 of the 276 seats that was the whole story of the election,
    // and a published result that silently omits them is not the result.
    //
    // The constituency list is read separately rather than by widening
    // `get_results()` to a LEFT JOIN: that RPC is also the source for the
    // internal report and the three export formats, and changing its row shape
    // changes all of them at once. Only `id, name, region` is selected — the
    // register counts in `get_constituency_turnout()` would tell this page how
    // many voters live in each seat, which no public surface has ever exposed.
    const [{ data, error }, { data: allConstituencies, error: constituencyError }] =
        await Promise.all([
            supabase.rpc('get_results'),
            supabase.from('constituencies').select('id, name, region').order('name'),
        ])

    if (error) throw error
    if (constituencyError) throw constituencyError

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

    // Every constituency that fielded nobody, added with an empty field. They
    // are seats in this election that produced no member, which is exactly what
    // the seats above with a sub-threshold winner also are — so they belong in
    // the same list, classified by the same rule, rather than in a footnote.
    for (const constituency of allConstituencies ?? []) {
        if (byConstituency.has(constituency.id)) continue
        byConstituency.set(constituency.id, {
            name: constituency.name,
            region: constituency.region?.trim() || UNSPECIFIED_REGION,
            totalVotes: 0,
            candidates: [],
        })
    }

    const byRegion = new Map()
    let totalVotes = 0
    let declared = 0
    let reElection = 0
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

        // The eligibility rule, applied once, here. `resolveWinners` above is
        // untouched and still reports who led — this decides whether leading
        // produced a member.
        const seat = classifySeat({ candidateCount: candidates.length, winners })
        const elected = isElectedSeat(seat)

        // A seat going to a re-election has no winner to mark. The candidates
        // and their tallies stay exactly as counted; what is withdrawn is the
        // claim that one of them took the seat.
        const winnerKeys = new Set(elected ? winners.map((w) => w.key) : [])
        const tied = elected && winners.length > 1

        if (elected) declared += 1
        else reElection += 1
        if (tied) tiedCount += 1

        const shaped = {
            name: constituency.name,
            region: constituency.region,
            totalVotes: constituency.totalVotes,
            status: seat.status,
            reElection: seat.status === SEAT_STATUS.RE_ELECTION,
            reason: seat.reason,
            // A seat with no ballots has no winner, and a seat where the top
            // two are level has two. Neither is quietly resolved to one name.
            tied,
            winners: elected ? winners.map((w) => w.name) : [],
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
            // Now every constituency in the election, not only the ones that
            // fielded a candidate — the denominator a reader assumes when they
            // see "seats declared".
            totalConstituencies: byConstituency.size,
            declaredConstituencies: declared,
            reElectionConstituencies: reElection,
            tiedConstituencies: tiedCount,
            totalRegions: regions.length,
            minVotesToBeElected: MIN_VOTES_TO_BE_ELECTED,
        },
        regions,
    }
}
