import { createAdminClient } from '@/lib/supabase-admin'
import { isUUID, normaliseName } from '@/lib/validation'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { jsonError, dbError } from '@/lib/api-error'
import { getClientIp, requireSameOrigin, noStore, jsonNoStore } from '@/lib/http'
import { validateConstituencyName, escapeLikePattern } from '@/lib/constituency-name'

/**
 * Correcting a constituency's name.
 *
 * Deliberately the only field this route will change. `code` is the conflict
 * target the CSV import upserts on and the column the unique constraint sits
 * on, so editing it here would silently re-point a future import at a different
 * row; `region` is not what this was asked for. A route that can only rewrite a
 * label cannot damage anything that references the constituency.
 *
 * The update is keyed on the id and is an UPDATE, never an upsert, so the row's
 * id, code, region and every candidate, voter and ballot pointing at it are
 * untouched by definition — a renamed constituency is the same constituency.
 *
 * Authorisation is the platform's existing one: proxy.js verifies the admin
 * session for every /api/admin path except sign-in and sign-out, before any
 * handler here runs.
 */

export async function PATCH(request, { params }) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    const { id } = await params

    if (!isUUID(id)) {
        return noStore(jsonError('Invalid constituency id', 400))
    }

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400))
    }

    const invalid = validateConstituencyName(body?.name)
    if (invalid) return noStore(jsonError(invalid, 400))

    const name = normaliseName(body.name)

    const supabase = createAdminClient()

    // Read first: this gives the 404, the previous value for the audit entry,
    // and the chance to recognise a no-op before writing anything.
    const { data: before, error: readError } = await supabase
        .from('constituencies')
        .select('id, name, region, code')
        .eq('id', id)
        .maybeSingle()

    if (readError) return dbError(readError, 'Could not load the constituency.')
    if (!before) return noStore(jsonError('Constituency not found.', 404))

    if (before.name === name) {
        // Nothing changed. Returning success rather than an error: the
        // administrator asked for this name and this name is what is stored.
        return jsonNoStore({ success: true, constituency: before, unchanged: true })
    }

    // A rename must not collide with a different constituency. Compared without
    // regard to case so that renaming "accra central" to "Accra Central" is not
    // blocked by the row being renamed, while a genuine clash with another row
    // still is.
    const { data: clash, error: clashError } = await supabase
        .from('constituencies')
        .select('id, name')
        .neq('id', id)
        .ilike('name', escapeLikePattern(name))
        .maybeSingle()

    if (clashError) return dbError(clashError, 'Could not check the constituency name.')
    if (clash) {
        return noStore(
            jsonError(`Another constituency is already called "${clash.name}".`, 409)
        )
    }

    const { data: updated, error } = await supabase
        .from('constituencies')
        .update({ name })
        .eq('id', id)
        .select('id, name, region, code')
        .maybeSingle()

    if (error) return dbError(error, 'Could not rename the constituency.')
    if (!updated) return noStore(jsonError('Constituency not found.', 404))

    await logAdminAction(supabase, AUDIT_ACTIONS.CONSTITUENCY_UPDATED, {
        actor: (await getAdminFromRequest(request))?.email ?? null,
        ip: getClientIp(request),
        entity: 'constituency',
        constituency_id: id,
        constituency_name: updated.name,
        previous: { name: before.name },
    })

    return jsonNoStore({ success: true, constituency: updated })
}
