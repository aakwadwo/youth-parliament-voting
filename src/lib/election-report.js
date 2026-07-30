/**
 * The single source of truth for election figures.
 *
 * The dashboard, the on-screen results view, and the PDF, Excel and CSV
 * exports all derive from this one builder. Three export formats each
 * recomputing turnout independently is how an official report ends up
 * disagreeing with the dashboard it was generated from.
 *
 * Every aggregate is computed in Postgres (migration 0009); nothing here reads
 * individual ballots, so report cost is independent of turnout.
 */

import { ELECTION_NAME } from '@/lib/election'

/** A tie is a genuine election outcome, so winners is a list, not a value. */
function resolveWinners(candidates) {
    const contested = candidates.filter((c) => c.votes > 0)
    if (contested.length === 0) return []
    const top = Math.max(...contested.map((c) => c.votes))
    return contested.filter((c) => c.votes === top)
}

function percent(part, whole) {
    if (!whole) return 0
    return Math.round((part / whole) * 1000) / 10
}

/**
 * Fetches and shapes the complete report.
 *
 * @param supabase   service-role client
 * @param generatedBy email of the administrator requesting the report
 */
export async function buildElectionReport(supabase, { generatedBy = null } = {}) {
    const [settingsRes, statsRes, resultsRes, turnoutRes, regionsRes] = await Promise.all([
        supabase.from('election_settings').select('*').maybeSingle(),
        supabase.rpc('get_election_stats'),
        supabase.rpc('get_results'),
        supabase.rpc('get_constituency_turnout'),
        supabase.rpc('get_regional_turnout'),
    ])

    const firstError = [settingsRes, statsRes, resultsRes, turnoutRes, regionsRes].find(
        (r) => r.error
    )
    if (firstError) throw firstError.error

    const settings = settingsRes.data ?? {}
    const stats = statsRes.data?.[0] ?? {}
    const num = (v) => Number(v ?? 0)

    const totalRegistered = num(stats.total_registered)
    const totalVerified = num(stats.total_verified)
    const totalBallots = num(stats.total_ballots)
    const totalVoted = num(stats.total_voted)

    // Turnout is measured against verified voters, because that is the roll a
    // ballot could actually have been issued from. Falls back to the full
    // register if nothing has been verified yet, so the figure is never a
    // division by zero dressed up as 0%.
    const turnoutDenominator = totalVerified || totalRegistered

    // Group the flat per-candidate rows into constituencies.
    const byConstituency = new Map()
    for (const row of resultsRes.data ?? []) {
        if (!byConstituency.has(row.constituency_id)) {
            byConstituency.set(row.constituency_id, {
                id: row.constituency_id,
                name: row.constituency_name,
                region: row.region ?? null,
                totalVotes: 0,
                candidates: [],
            })
        }
        const entry = byConstituency.get(row.constituency_id)
        const votes = num(row.votes)
        entry.totalVotes += votes
        entry.candidates.push({
            id: row.candidate_id,
            name: row.candidate_name,
            isActive: row.is_active !== false,
            votes,
        })
    }

    const turnoutByConstituency = new Map(
        (turnoutRes.data ?? []).map((t) => [t.constituency_id, t])
    )

    const constituencies = Array.from(byConstituency.values()).map((c) => {
        const t = turnoutByConstituency.get(c.id)
        const registered = num(t?.registered)
        const verified = num(t?.verified)
        const denominator = verified || registered

        const candidates = c.candidates.map((cand) => ({
            ...cand,
            sharePct: percent(cand.votes, c.totalVotes),
        }))

        return {
            ...c,
            code: t?.code ?? null,
            candidates,
            winners: resolveWinners(candidates),
            registered,
            verified,
            turnoutPct: percent(c.totalVotes, denominator),
        }
    })

    const regions = (regionsRes.data ?? []).map((r) => ({
        region: r.region ?? 'Unspecified',
        constituencies: num(r.constituencies),
        registered: num(r.registered),
        voted: num(r.voted),
        ballots: num(r.ballots),
        turnoutPct: percent(num(r.ballots), num(r.registered)),
    }))

    const declared = constituencies.filter((c) => c.totalVotes > 0)

    return {
        meta: {
            electionName: settings.election_name ?? ELECTION_NAME,
            description: settings.description ?? null,
            opensAt: settings.voting_opens_at ?? null,
            closesAt: settings.voting_closes_at ?? null,
            isActive: Boolean(settings.is_active),
            generatedAt: new Date().toISOString(),
            generatedBy,
            firstVoteAt: stats.first_vote_at ?? null,
            lastVoteAt: stats.last_vote_at ?? null,
            firstRegistrationAt: stats.first_registration_at ?? null,
            // Stated explicitly so the report never implies a stronger identity
            // check than the platform actually performs.
            verificationMethod:
                'Self-declared: unique Ghanaian mobile number, date of birth within the 18–35 eligibility window, and a declared constituency.',
        },
        summary: {
            totalRegistered,
            totalVerified,
            totalVoted,
            totalBallots,
            turnoutPct: percent(totalBallots, turnoutDenominator),
            turnoutDenominator,
            totalConstituencies: num(stats.total_constituencies),
            contestedConstituencies: num(stats.contested_constituencies),
            declaredConstituencies: declared.length,
            totalCandidates: num(stats.total_candidates),
            activeCandidates: num(stats.active_candidates),
            // If these two ever differ, a voter is marked as having voted with
            // no matching ballot (or the reverse). Surfacing it in the report
            // is the point: it must be visible, not silently reconciled.
            ballotReconciliation: {
                votersMarkedVoted: totalVoted,
                ballotsRecorded: totalBallots,
                discrepancy: totalVoted - totalBallots,
                balanced: totalVoted === totalBallots,
            },
        },
        constituencies,
        regions,
    }
}

/** Filename stem shared by all three export formats. */
export function reportFilename(report, extension) {
    const slug = report.meta.electionName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    const date = report.meta.generatedAt.slice(0, 10)
    return `${slug || 'election'}-report-${date}.${extension}`
}

export function formatDateTime(value) {
    if (!value) return '—'
    // Ghana observes GMT year-round with no daylight saving, so the report
    // renders a single unambiguous timezone rather than the server's locale.
    return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Accra',
    }).format(new Date(value))
}
