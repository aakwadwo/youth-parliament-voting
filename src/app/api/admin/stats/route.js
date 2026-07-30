import { createAdminClient } from '@/lib/supabase-admin'
import { dbError } from '@/lib/api-error'
import { jsonNoStore } from '@/lib/http'

/**
 * Dashboard figures.
 *
 * Everything is aggregated by Postgres in two calls (migration 0009) rather
 * than by counting rows in the route, so the dashboard costs the same whether
 * the register holds a thousand voters or a million.
 */
export async function GET() {
    const supabase = createAdminClient()

    const [statsRes, settingsRes, regionsRes] = await Promise.all([
        supabase.rpc('get_election_stats'),
        supabase.from('election_settings').select('*').maybeSingle(),
        supabase.rpc('get_regional_turnout'),
    ])

    const failure = [statsRes, settingsRes, regionsRes].find((r) => r.error)
    if (failure) return dbError(failure.error, 'Could not load dashboard statistics.')

    const stats = statsRes.data?.[0] ?? {}
    const settings = settingsRes.data ?? {}
    const num = (v) => Number(v ?? 0)

    const totalRegistered = num(stats.total_registered)
    const totalVerified = num(stats.total_verified)
    const totalBallots = num(stats.total_ballots)
    const denominator = totalVerified || totalRegistered

    const now = Date.now()
    const opensAt = settings.voting_opens_at ? new Date(settings.voting_opens_at).getTime() : null
    const closesAt = settings.voting_closes_at
        ? new Date(settings.voting_closes_at).getTime()
        : null

    let status = 'closed'
    if (settings.is_active) {
        if (opensAt && opensAt > now) status = 'scheduled'
        else if (closesAt && closesAt < now) status = 'ended'
        else status = 'open'
    }

    return jsonNoStore({
        election: {
            name: settings.election_name ?? null,
            isActive: Boolean(settings.is_active),
            status,
            opensAt: settings.voting_opens_at ?? null,
            closesAt: settings.voting_closes_at ?? null,
        },
        totals: {
            registered: totalRegistered,
            verified: totalVerified,
            voted: num(stats.total_voted),
            ballots: totalBallots,
            constituencies: num(stats.total_constituencies),
            contestedConstituencies: num(stats.contested_constituencies),
            candidates: num(stats.total_candidates),
            activeCandidates: num(stats.active_candidates),
            turnoutPct: denominator ? Math.round((totalBallots / denominator) * 1000) / 10 : 0,
        },
        timeline: {
            firstVoteAt: stats.first_vote_at ?? null,
            lastVoteAt: stats.last_vote_at ?? null,
            firstRegistrationAt: stats.first_registration_at ?? null,
        },
        // Surfaced on the dashboard, not just in the report: a voter marked as
        // having voted with no matching ballot is the single most important
        // integrity signal this system can raise.
        reconciliation: {
            votersMarkedVoted: num(stats.total_voted),
            ballotsRecorded: totalBallots,
            balanced: num(stats.total_voted) === totalBallots,
        },
        regions: (regionsRes.data ?? []).map((r) => ({
            region: r.region ?? 'Unspecified',
            constituencies: num(r.constituencies),
            registered: num(r.registered),
            voted: num(r.voted),
            ballots: num(r.ballots),
            turnoutPct: num(r.registered)
                ? Math.round((num(r.ballots) / num(r.registered)) * 1000) / 10
                : 0,
        })),
    })
}
