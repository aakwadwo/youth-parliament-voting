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
import {
    resolveWinners,
    percent,
    classifySeat,
    isElectedSeat,
    SEAT_STATUS,
    MIN_VOTES_TO_BE_ELECTED,
} from '@/lib/results-math'

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

    // `get_results()` inner-joins candidates, so a constituency where nobody
    // stood is absent from it. `get_constituency_turnout()` is built the other
    // way round — `from constituencies LEFT JOIN` — so it already carries all
    // 276, and this report already fetches it. Driving the loop from that list
    // therefore adds the missing seats without a fourth query and without
    // touching `get_results()`, whose row shape the public builder and all
    // three export formats also depend on.
    for (const t of turnoutRes.data ?? []) {
        if (byConstituency.has(t.constituency_id)) continue
        byConstituency.set(t.constituency_id, {
            id: t.constituency_id,
            name: t.constituency_name,
            region: t.region ?? null,
            totalVotes: 0,
            candidates: [],
        })
    }

    const constituencies = Array.from(byConstituency.values()).map((c) => {
        const t = turnoutByConstituency.get(c.id)
        const registered = num(t?.registered)
        const verified = num(t?.verified)
        const denominator = verified || registered

        const candidates = c.candidates.map((cand) => ({
            ...cand,
            sharePct: percent(cand.votes, c.totalVotes),
        }))

        const winners = resolveWinners(candidates)

        // The same call the public builder makes, on the same shape. This is
        // the only reason the on-screen result and the exported one cannot
        // disagree about who holds a seat.
        const seat = classifySeat({ candidateCount: candidates.length, winners })
        const elected = isElectedSeat(seat)

        return {
            ...c,
            code: t?.code ?? null,
            candidates,
            // Emptied for a re-election seat so every downstream consumer —
            // the admin table, the PDF, the workbook, the CSV — stops marking a
            // winner without each having to know the rule. The tallies in
            // `candidates` above are untouched.
            winners: elected ? winners : [],
            status: seat.status,
            reElection: seat.status === SEAT_STATUS.RE_ELECTION,
            reason: seat.reason,
            // Preserved separately so an auditor can still see who led a seat
            // that is going to a re-election, and on what tally.
            leadingCandidates: winners.map((w) => ({ name: w.name, votes: w.votes })),
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

    // Was `totalVotes > 0`, which counted a seat as declared because ballots
    // were cast in it. Under the eligibility rule that is no longer the same
    // question: 39 seats received ballots and still produced no member. Counted
    // from the classification so this figure and the public page's cannot drift.
    const declared = constituencies.filter(isElectedSeat)
    const reElection = constituencies.filter((c) => c.status === SEAT_STATUS.RE_ELECTION)

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
            // Straight from SQL: constituencies where a candidate stood. Left
            // as it is on purpose — it describes the ballot paper, not the
            // outcome, and is still true after the eligibility rule.
            contestedConstituencies: num(stats.contested_constituencies),
            declaredConstituencies: declared.length,
            reElectionConstituencies: reElection.length,
            minVotesToBeElected: MIN_VOTES_TO_BE_ELECTED,
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
