import { createAdminClient } from '@/lib/supabase-admin'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { jsonError, dbError } from '@/lib/api-error'
import { getClientIp, requireSameOrigin, noStore, jsonNoStore } from '@/lib/http'

const MAX_ROWS = 500

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400))
    }

    const { constituencies } = body ?? {}

    if (!Array.isArray(constituencies) || constituencies.length === 0) {
        return noStore(jsonError('No data provided', 400))
    }
    if (constituencies.length > MAX_ROWS) {
        return noStore(jsonError(`Import at most ${MAX_ROWS} rows at a time.`, 400))
    }

    const sanitised = []
    const seenCodes = new Set()

    for (const [index, row] of constituencies.entries()) {
        const name = typeof row?.name === 'string' ? row.name.trim() : ''
        const region = typeof row?.region === 'string' ? row.region.trim() : ''
        const code = Number.parseInt(row?.code, 10)

        if (!name || !region || !Number.isInteger(code) || code < 0) {
            return noStore(
                jsonError(
                    `Row ${index + 1} needs a name, a region and a whole-number code.`,
                    400
                )
            )
        }
        // Postgres refuses an ON CONFLICT upsert whose own payload contains the
        // same conflict target twice, so a duplicated code in the file would
        // fail the entire import with an opaque database error. Catching it here
        // names the offending row instead.
        if (seenCodes.has(code)) {
            return noStore(jsonError(`Code ${code} appears more than once in this file.`, 400))
        }
        seenCodes.add(code)

        sanitised.push({ name, region, code })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
        .from('constituencies')
        .upsert(sanitised, { onConflict: 'code' })

    if (error) return dbError(error, 'Could not import the constituencies.')

    await logAdminAction(supabase, AUDIT_ACTIONS.CONSTITUENCY_IMPORTED, {
        actor: (await getAdminFromRequest(request))?.email ?? null,
        ip: getClientIp(request),
        entity: 'constituency',
        count: sanitised.length,
    })

    return jsonNoStore({ success: true, count: sanitised.length })
}
