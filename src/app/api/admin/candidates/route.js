import { createAdminClient } from '@/lib/supabase-admin'
import { isUUID, isValidName, normaliseName } from '@/lib/validation'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { jsonError, dbError, PG_FOREIGN_KEY_VIOLATION } from '@/lib/api-error'
import { getClientIp, requireSameOrigin, noStore, jsonNoStore } from '@/lib/http'
import { isAllowedPhotoUrl } from '@/lib/storage'

export async function GET() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('candidates')
        .select('id, full_name, photo_url, is_active, constituency_id, constituencies(name, region)')
        .order('full_name')
    if (error) return dbError(error, 'Could not load candidates.')
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

    const { full_name, constituency_id, photo_url } = body ?? {}

    if (!isValidName(full_name)) {
        return noStore(jsonError('Enter a valid candidate name.', 400))
    }
    if (!isUUID(constituency_id)) {
        return noStore(jsonError('Select a valid constituency.', 400))
    }
    // The photo URL ends up in an <img src> on the ballot. Restricting it to
    // our own Supabase Storage bucket stops an administrator account — or
    // anything that reaches this endpoint — pointing candidate images at an
    // arbitrary external host that could track or profile voters.
    if (photo_url != null && !isAllowedPhotoUrl(photo_url)) {
        return noStore(jsonError('Candidate photos must be uploaded through this portal.', 400))
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('candidates')
        .insert({
            full_name: normaliseName(full_name),
            constituency_id,
            photo_url: photo_url ?? null,
        })
        .select('id, full_name, photo_url, is_active, constituency_id')
        .single()

    if (error) {
        if (error.code === PG_FOREIGN_KEY_VIOLATION) {
            return noStore(jsonError('Select a valid constituency.', 400))
        }
        return dbError(error, 'Could not add the candidate.')
    }

    await logAdminAction(supabase, AUDIT_ACTIONS.CANDIDATE_CREATED, {
        actor: (await getAdminFromRequest(request))?.email ?? null,
        ip: getClientIp(request),
        entity: 'candidate',
        candidate_id: data.id,
        candidate_name: data.full_name,
    })

    return jsonNoStore(data)
}
