import { createAdminClient } from '@/lib/supabase-admin'
import { isUUID, isValidName, normaliseName } from '@/lib/validation'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { jsonError, dbError, PG_FOREIGN_KEY_VIOLATION } from '@/lib/api-error'
import { getClientIp, requireSameOrigin, noStore, jsonNoStore } from '@/lib/http'
import { isAllowedPhotoUrl } from '@/lib/storage'

// An explicit allowlist, so a request cannot set a column the API never meant
// to expose by including it in the body.
const ALLOWED_FIELDS = ['full_name', 'constituency_id', 'photo_url', 'is_active']

export async function PATCH(request, { params }) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    const { id } = await params

    if (!isUUID(id)) {
        return noStore(jsonError('Invalid candidate id', 400))
    }

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400))
    }

    const update = {}
    for (const field of ALLOWED_FIELDS) {
        if (body?.[field] !== undefined) update[field] = body[field]
    }

    if (Object.keys(update).length === 0) {
        return noStore(jsonError('No valid fields to update', 400))
    }
    if (update.full_name !== undefined && !isValidName(update.full_name)) {
        return noStore(jsonError('Enter a valid candidate name.', 400))
    }
    if (update.constituency_id !== undefined && !isUUID(update.constituency_id)) {
        return noStore(jsonError('Select a valid constituency.', 400))
    }
    if (update.is_active !== undefined && typeof update.is_active !== 'boolean') {
        return noStore(jsonError('is_active must be a boolean', 400))
    }
    if (
        update.photo_url !== undefined &&
        update.photo_url !== null &&
        !isAllowedPhotoUrl(update.photo_url)
    ) {
        return noStore(jsonError('Candidate photos must be uploaded through this portal.', 400))
    }
    if (update.full_name !== undefined) {
        update.full_name = normaliseName(update.full_name)
    }

    const supabase = createAdminClient()

    // Returning the updated row means the audit entry can name the candidate
    // without a second round trip.
    const { data: candidate, error } = await supabase
        .from('candidates')
        .update(update)
        .eq('id', id)
        .select('id, full_name, is_active, constituency_id')
        .maybeSingle()

    if (error) {
        if (error.code === PG_FOREIGN_KEY_VIOLATION) {
            return noStore(jsonError('Select a valid constituency.', 400))
        }
        return dbError(error, 'Could not update the candidate.')
    }

    if (!candidate) {
        return noStore(jsonError('Candidate not found.', 404))
    }

    const admin = await getAdminFromRequest(request)
    const ip = getClientIp(request)

    // Withdrawing a candidate changes what appears on a live ballot, so it is
    // logged as its own event rather than a generic update.
    const action =
        update.is_active === undefined
            ? AUDIT_ACTIONS.CANDIDATE_UPDATED
            : update.is_active
              ? AUDIT_ACTIONS.CANDIDATE_ACTIVATED
              : AUDIT_ACTIONS.CANDIDATE_DEACTIVATED

    await logAdminAction(supabase, action, {
        actor: admin?.email ?? null,
        ip,
        entity: 'candidate',
        candidate_id: id,
        candidate_name: candidate.full_name,
        fields: Object.keys(update),
    })

    return jsonNoStore({ success: true, candidate })
}
