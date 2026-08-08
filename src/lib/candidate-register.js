import { ELECTION_NAME } from '@/lib/election'

/**
 * The complete candidate register, grouped region → constituency → candidate.
 *
 * This exists so the Commission can check the final register before a poll
 * opens: who is standing, where, and whether anyone is on the list who should
 * not be. That is a different question from "who won", so it deliberately does
 * not go anywhere near `votes` — nothing here reads a tally, and nothing here
 * reads a voter.
 *
 * Every candidate row in the database appears, including deactivated ones. A
 * register that silently omitted withdrawn candidates would be useless for the
 * one job it has: an administrator reviewing it cannot spot a candidate who
 * should not be there if the export hides candidates.
 *
 * Constituencies with no candidates at all are listed too, for the same
 * reason — an empty seat is exactly the kind of thing this review is meant to
 * catch, and a constituency that simply vanishes from the document reads as
 * "fine" rather than "nobody is standing here".
 */

const UNSPECIFIED_REGION = 'Region not set'

/** Sorts the way the admin candidate list and the results already do. */
const byName = (a, b) => a.name.localeCompare(b.name, 'en-GB')

/**
 * @param supabase    service-role client
 * @param generatedBy email of the administrator requesting the register
 */
export async function buildCandidateRegister(supabase, { generatedBy = null } = {}) {
    const [settingsRes, constituenciesRes, candidatesRes] = await Promise.all([
        supabase.from('election_settings').select('*').maybeSingle(),
        supabase.from('constituencies').select('id, name, region, code').order('name'),
        // Ordered by name to match `/api/candidates` and the admin candidate
        // table, so a candidate sits in the same place in the PDF as on the
        // screen the administrator is checking it against.
        //
        // No range or limit: the admin table paginates in the browser, and a
        // register that stopped at the first page would be worse than no
        // register at all.
        supabase
            .from('candidates')
            .select('id, full_name, photo_url, is_active, constituency_id')
            .order('full_name'),
    ])

    const firstError = [settingsRes, constituenciesRes, candidatesRes].find((r) => r.error)
    if (firstError) throw firstError.error

    const settings = settingsRes.data ?? {}

    const constituencies = new Map(
        (constituenciesRes.data ?? []).map((c) => [
            c.id,
            {
                id: c.id,
                name: c.name,
                code: c.code ?? null,
                region: c.region?.trim() || UNSPECIFIED_REGION,
                candidates: [],
            },
        ])
    )

    // A candidate whose constituency row has been deleted would otherwise
    // disappear from the register entirely. They are still in the database, so
    // they are still shown — under a heading that says exactly what is wrong.
    const orphans = []

    for (const row of candidatesRes.data ?? []) {
        const candidate = {
            id: row.id,
            name: row.full_name,
            photoUrl: row.photo_url ?? null,
            isActive: row.is_active !== false,
        }
        const constituency = constituencies.get(row.constituency_id)
        if (constituency) constituency.candidates.push(candidate)
        else orphans.push(candidate)
    }

    const byRegion = new Map()
    for (const constituency of constituencies.values()) {
        if (!byRegion.has(constituency.region)) {
            byRegion.set(constituency.region, { region: constituency.region, constituencies: [] })
        }
        byRegion.get(constituency.region).constituencies.push(constituency)
    }

    if (orphans.length > 0) {
        byRegion.set('Unassigned', {
            region: 'Unassigned',
            constituencies: [
                {
                    id: 'unassigned',
                    name: 'Constituency no longer exists',
                    code: null,
                    region: 'Unassigned',
                    candidates: orphans,
                },
            ],
        })
    }

    const regions = Array.from(byRegion.values())
        .map((r) => ({
            ...r,
            constituencies: r.constituencies.slice().sort(byName),
        }))
        .sort((a, b) => a.region.localeCompare(b.region, 'en-GB'))

    const totalCandidates = (candidatesRes.data ?? []).length

    return {
        meta: {
            electionName: settings.election_name ?? ELECTION_NAME,
            generatedAt: new Date().toISOString(),
            generatedBy,
        },
        summary: {
            regions: regions.length,
            constituencies: constituencies.size + (orphans.length > 0 ? 1 : 0),
            candidates: totalCandidates,
            activeCandidates: (candidatesRes.data ?? []).filter((c) => c.is_active !== false)
                .length,
            withPhoto: (candidatesRes.data ?? []).filter((c) => c.photo_url).length,
            emptyConstituencies: Array.from(constituencies.values()).filter(
                (c) => c.candidates.length === 0
            ).length,
        },
        regions,
    }
}

/** Filename stem for the register export. */
export function registerFilename(register, extension) {
    const slug = register.meta.electionName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    const date = register.meta.generatedAt.slice(0, 10)
    return `${slug || 'election'}-candidate-list-${date}.${extension}`
}
