import { createAdminClient } from '@/lib/supabase-admin'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { jsonError, dbError, PG_UNIQUE_VIOLATION } from '@/lib/api-error'
import { getClientIp, requireSameOrigin, noStore, jsonNoStore } from '@/lib/http'

export async function GET() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('constituencies')
        .select('id, name, region, code, candidates(count)')
        .order('name')
    if (error) return dbError(error, 'Could not load constituencies.')
    return jsonNoStore(data)
}

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400))
    }

    const { name, region, code } = body ?? {}
    const codeNum = Number.parseInt(code, 10)

    if (
        typeof name !== 'string' ||
        !name.trim() ||
        typeof region !== 'string' ||
        !region.trim() ||
        !Number.isInteger(codeNum) ||
        codeNum < 0
    ) {
        return noStore(
            jsonError('A name, a region and a whole-number code are all required.', 400)
        )
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('constituencies')
        .insert({ name: name.trim(), region: region.trim(), code: codeNum })
        .select('id, name, region, code')
        .single()

    if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
            return noStore(jsonError('A constituency with this code already exists.', 409))
        }
        return dbError(error, 'Could not add the constituency.')
    }

    await logAdminAction(supabase, AUDIT_ACTIONS.CONSTITUENCY_CREATED, {
        actor: (await getAdminFromRequest(request))?.email ?? null,
        ip: getClientIp(request),
        entity: 'constituency',
        constituency_name: data.name,
        code: data.code,
    })

    return jsonNoStore(data)
}
