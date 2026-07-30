import { createAdminClient } from '@/lib/supabase-admin'
import { isUUID } from '@/lib/validation'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { jsonError, dbError } from '@/lib/api-error'
import { getClientIp, requireSameOrigin, noStore, jsonNoStore } from '@/lib/http'

export async function GET() {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('election_settings').select('*').maybeSingle()
    if (error) return dbError(error, 'Could not load election settings.')
    return jsonNoStore(data)
}

export async function PATCH(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400))
    }

    if (!isUUID(body?.id)) {
        return noStore(jsonError('Invalid settings id', 400))
    }
    if (
        body.election_name !== undefined &&
        (typeof body.election_name !== 'string' || !body.election_name.trim())
    ) {
        return noStore(jsonError('The election name cannot be empty.', 400))
    }
    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
        return noStore(jsonError('is_active must be a boolean', 400))
    }
    for (const field of ['voting_opens_at', 'voting_closes_at']) {
        if (
            body[field] !== undefined &&
            body[field] !== null &&
            Number.isNaN(new Date(body[field]).getTime())
        ) {
            return noStore(jsonError('Invalid date provided', 400))
        }
    }
    if (
        body.voting_opens_at &&
        body.voting_closes_at &&
        new Date(body.voting_opens_at) >= new Date(body.voting_closes_at)
    ) {
        return noStore(jsonError('Voting must open before it closes.', 400))
    }

    const supabase = createAdminClient()

    const { data: before } = await supabase
        .from('election_settings')
        .select('is_active, election_name, voting_opens_at, voting_closes_at')
        .eq('id', body.id)
        .maybeSingle()

    const { error } = await supabase
        .from('election_settings')
        .update({
            election_name: body.election_name,
            voting_opens_at: body.voting_opens_at,
            voting_closes_at: body.voting_closes_at,
            is_active: body.is_active,
        })
        .eq('id', body.id)

    if (error) return dbError(error, 'Could not save election settings.')

    const admin = await getAdminFromRequest(request)
    const ip = getClientIp(request)

    // Opening or closing the poll is the single most consequential action in
    // the system, so it is logged as its own event, with the previous value.
    if (before && before.is_active !== body.is_active) {
        await logAdminAction(
            supabase,
            body.is_active ? AUDIT_ACTIONS.VOTING_OPENED : AUDIT_ACTIONS.VOTING_CLOSED,
            { actor: admin?.email ?? null, ip, entity: 'election_settings', was: before.is_active }
        )
    }

    const detailsChanged =
        before &&
        (before.election_name !== body.election_name ||
            before.voting_opens_at !== body.voting_opens_at ||
            before.voting_closes_at !== body.voting_closes_at)

    if (detailsChanged) {
        await logAdminAction(supabase, AUDIT_ACTIONS.SETTINGS_CHANGED, {
            actor: admin?.email ?? null,
            ip,
            entity: 'election_settings',
            election_name: body.election_name,
            voting_opens_at: body.voting_opens_at,
            voting_closes_at: body.voting_closes_at,
            previous: {
                election_name: before.election_name,
                voting_opens_at: before.voting_opens_at,
                voting_closes_at: before.voting_closes_at,
            },
        })
    }

    return jsonNoStore({ success: true })
}
