import { ELECTION_NAME } from '@/lib/election'

/**
 * Registration figures, aggregated.
 *
 * The single source for both the admin screen and the PDF, for the same reason
 * `election-report.js` exists: two surfaces computing the same total from two
 * queries is how an official document ends up contradicting the dashboard it
 * was generated from. The screen and the export call this and nothing else.
 *
 * ── What this deliberately does not do ───────────────────────────────────────
 *
 * It never reads the `voters` table. Every figure comes from aggregates
 * computed inside Postgres (migration 0009), so no row describing a person
 * crosses into application memory, let alone into a browser or a PDF. There is
 * no query here that could be widened into a way to browse the register — the
 * shape of the data returned is constituency and a number, and nothing else.
 *
 * `registration_events` and `registration_devices` are not consulted either.
 * Those count *registration attempts charged to a device*, not people: one
 * successful registration writes two rows there, and a device shared by a
 * family writes several. Counting them as voters would overstate the register.
 */

/**
 * @param supabase    service-role client
 * @param generatedBy email of the administrator requesting the figures
 */
export async function buildRegistrationReport(supabase, { generatedBy = null } = {}) {
    const [settingsRes, statsRes, turnoutRes] = await Promise.all([
        supabase.from('election_settings').select('election_name').maybeSingle(),
        // count(*) over voters — the authoritative total.
        supabase.rpc('get_election_stats'),
        // Starts FROM constituencies and LEFT JOINs the register, so a
        // constituency where nobody has registered still appears, with zero.
        supabase.rpc('get_constituency_turnout'),
    ])

    const firstError = [settingsRes, statsRes, turnoutRes].find((r) => r.error)
    if (firstError) throw firstError.error

    const num = (value) => Number(value ?? 0)

    const stats = statsRes.data?.[0] ?? {}
    const totalRegistered = num(stats.total_registered)

    // Ordering is not applied here: get_constituency_turnout() already returns
    // rows `order by c.name asc`, which is the convention every constituency
    // listing in the admin portal follows. Re-sorting in JavaScript would
    // introduce a second opinion about collation for no benefit.
    const constituencies = (turnoutRes.data ?? []).map((row) => ({
        id: row.constituency_id,
        name: row.constituency_name,
        region: row.region ?? null,
        code: row.code ?? null,
        registered: num(row.registered),
    }))

    const assigned = constituencies.reduce((sum, c) => sum + c.registered, 0)

    /**
     * Voters counted in the total but belonging to no listed constituency.
     *
     * Should always be zero: `voters.constituency_id` carries a foreign key, so
     * it cannot point at a constituency that does not exist, and the
     * registration route always supplies one. It is computed and surfaced
     * anyway rather than assumed, because the alternative — showing a total
     * that silently disagrees with the sum of the rows beneath it — is exactly
     * the kind of discrepancy an election report must never hide. If it is ever
     * non-zero, the screen and the PDF both say so.
     */
    const unassigned = totalRegistered - assigned

    return {
        meta: {
            electionName: settingsRes.data?.election_name ?? ELECTION_NAME,
            generatedAt: new Date().toISOString(),
            generatedBy,
        },
        summary: {
            totalRegistered,
            assigned,
            unassigned,
            balanced: unassigned === 0,
            totalConstituencies: constituencies.length,
            constituenciesWithRegistrations: constituencies.filter((c) => c.registered > 0).length,
            constituenciesWithNone: constituencies.filter((c) => c.registered === 0).length,
        },
        constituencies,
    }
}

/** Filename stem for the export, matching the election report's convention. */
export function registrationReportFilename(report, extension) {
    const slug = report.meta.electionName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    const date = report.meta.generatedAt.slice(0, 10)
    return `${slug || 'election'}-registration-statistics-${date}.${extension}`
}
