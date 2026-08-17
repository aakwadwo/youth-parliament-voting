/**
 * A stand-in for the Supabase service-role client, returning the shapes the
 * migration-0009 functions produce.
 *
 * Lets the report builder and every export format be tested against known
 * figures — including the awkward cases a real election produces: a dead heat,
 * a constituency where nobody voted, and a candidate who polled zero.
 */

const CONSTITUENCIES = [
    { id: 'c1', name: 'Clear Win', region: 'Greater Accra', code: 1 },
    { id: 'c2', name: 'Dead Heat', region: 'Ashanti', code: 2 },
    { id: 'c3', name: 'No Ballots', region: 'Ashanti', code: 3 },
]

const RESULTS = [
    // Clear Win: decisive result, 100 ballots
    { constituency_id: 'c1', constituency_name: 'Clear Win', region: 'Greater Accra', candidate_id: 'd1', candidate_name: 'Winner One', is_active: true, votes: 70 },
    { constituency_id: 'c1', constituency_name: 'Clear Win', region: 'Greater Accra', candidate_id: 'd2', candidate_name: 'Runner Up', is_active: true, votes: 30 },
    // Dead Heat: exact tie, plus a candidate who polled nothing
    { constituency_id: 'c2', constituency_name: 'Dead Heat', region: 'Ashanti', candidate_id: 'd3', candidate_name: 'Tied A', is_active: true, votes: 20 },
    { constituency_id: 'c2', constituency_name: 'Dead Heat', region: 'Ashanti', candidate_id: 'd4', candidate_name: 'Tied B', is_active: true, votes: 20 },
    { constituency_id: 'c2', constituency_name: 'Dead Heat', region: 'Ashanti', candidate_id: 'd5', candidate_name: 'No Votes At All', is_active: true, votes: 0 },
    // No Ballots: candidates stood, nobody voted
    { constituency_id: 'c3', constituency_name: 'No Ballots', region: 'Ashanti', candidate_id: 'd6', candidate_name: 'Unvoted One', is_active: true, votes: 0 },
    { constituency_id: 'c3', constituency_name: 'No Ballots', region: 'Ashanti', candidate_id: 'd7', candidate_name: 'Unvoted Two', is_active: false, votes: 0 },
]

// get_constituency_turnout() is `from constituencies LEFT JOIN …`, so it
// returns every constituency including one nobody stood in. The fixture used to
// omit c4, which made it impossible to test the case that turns out to describe
// 132 of the 276 real seats.
const TURNOUT = [
    { constituency_id: 'c1', constituency_name: 'Clear Win', region: 'Greater Accra', code: 1, registered: 220, verified: 200, voted: 100, ballots: 100, candidates: 2 },
    { constituency_id: 'c2', constituency_name: 'Dead Heat', region: 'Ashanti', code: 2, registered: 100, verified: 80, voted: 40, ballots: 40, candidates: 3 },
    { constituency_id: 'c3', constituency_name: 'No Ballots', region: 'Ashanti', code: 3, registered: 50, verified: 40, voted: 0, ballots: 0, candidates: 2 },
    { constituency_id: 'c4', constituency_name: 'Nobody Standing', region: 'Ahafo', code: 4, registered: 30, verified: 25, voted: 0, ballots: 0, candidates: 0 },
]

const REGIONS = [
    { region: 'Ashanti', constituencies: 2, registered: 150, voted: 40, ballots: 40 },
    { region: 'Greater Accra', constituencies: 1, registered: 220, voted: 100, ballots: 100 },
]

const TOTAL_BALLOTS = RESULTS.reduce((sum, r) => sum + r.votes, 0) // 140

/**
 * The `candidates` table behind the same fixture election.
 *
 * Derived from RESULTS so the register and the results can never describe two
 * different fields of candidates, plus the cases the register has to survive
 * and the results do not: a candidate with no photograph at all, and one whose
 * constituency row has been deleted from under them.
 */
const CANDIDATES = [
    ...RESULTS.map((r, i) => ({
        id: r.candidate_id,
        full_name: r.candidate_name,
        constituency_id: r.constituency_id,
        // Every other candidate has a photograph, so both branches are covered.
        photo_url:
            i % 2 === 0
                ? `https://fixture.supabase.co/storage/v1/object/public/candidate-photos/${r.candidate_id}.jpg`
                : null,
        is_active: r.is_active,
    })),
    {
        id: 'd8',
        full_name: 'Orphaned Candidate',
        constituency_id: 'deleted-constituency',
        photo_url: null,
        is_active: true,
    },
]

// A constituency nobody is standing in — the exact thing a register review is
// meant to catch, and the exact thing a results export never shows.
const REGISTER_CONSTITUENCIES = [
    ...CONSTITUENCIES,
    { id: 'c4', name: 'Nobody Standing', region: 'Ahafo', code: 4 },
]

export function makeFakeSupabase({ votedOverride = null, settings = {} } = {}) {
    const stats = {
        total_registered: 370,
        total_verified: 320,
        total_voted: votedOverride ?? TOTAL_BALLOTS,
        total_ballots: TOTAL_BALLOTS,
        // Every constituency on the register, not only the contested ones —
        // `select count(*) from constituencies` in migration 0009.
        total_constituencies: REGISTER_CONSTITUENCIES.length,
        total_candidates: RESULTS.length,
        active_candidates: RESULTS.filter((r) => r.is_active).length,
        contested_constituencies: 3,
        first_vote_at: '2026-07-20T08:00:00.000Z',
        last_vote_at: '2026-07-24T17:00:00.000Z',
        first_registration_at: '2026-06-01T09:00:00.000Z',
    }

    const RPC = {
        get_election_stats: [stats],
        get_results: RESULTS,
        get_constituency_turnout: TURNOUT,
        get_regional_turnout: REGIONS,
    }

    const electionSettings = {
        id: 'settings-1',
        election_name: 'Test Election 2026',
        description: 'A fixture election.',
        is_active: false,
        voting_opens_at: '2026-07-20T08:00:00.000Z',
        voting_closes_at: '2026-07-24T18:00:00.000Z',
        ...settings,
    }

    const TABLES = {
        constituencies: REGISTER_CONSTITUENCIES,
        candidates: CANDIDATES,
    }

    return {
        from: (table) => ({
            select: () => {
                const rows = TABLES[table] ?? []
                // PostgREST builders are thenable and chainable; only the two
                // shapes the code under test actually uses are modelled —
                // `.maybeSingle()` for the settings row and `.order(column)`
                // for a list. `.order()` sorts, because the ordering the
                // register relies on is part of what is being tested.
                const result = {
                    maybeSingle: async () => ({ data: electionSettings, error: null }),
                    order: async (column) => ({
                        data: rows
                            .slice()
                            .sort((a, b) => String(a[column]).localeCompare(String(b[column]))),
                        error: null,
                    }),
                }
                return result
            },
        }),
        rpc: async (name) => ({ data: RPC[name] ?? [], error: null }),
    }
}
