import { createAdminClient } from '@/lib/supabase-admin'
import { requireSuperadmin } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { isUUID } from '@/lib/validation'
import { jsonError, dbError, ERROR_CODES, PG_FOREIGN_KEY_VIOLATION } from '@/lib/api-error'
import { getClientIp, requireSameOrigin, noStore, jsonNoStore } from '@/lib/http'
import {
    pickConstituencyUpdate,
    toAdminVoterView,
    constituencyChangeAudit,
    ADMIN_VOTER_COLUMNS,
} from '@/lib/voter-admin'

/**
 * Correcting the constituency on one registration.
 *
 * ── What this route can do, and why it cannot do anything else ──────────────
 *
 * It issues exactly one write: an UPDATE of exactly one column, filtered on the
 * voter's id. That is not a convention this file follows, it is the only
 * statement present. There is no insert, no upsert and no delete anywhere in
 * it, so a voter cannot be created or removed through this feature however it
 * is called. `.upsert()` in particular is absent on purpose: a mistyped or
 * missing id would turn it into a row-creating operation.
 *
 * The payload is taken from `pickConstituencyUpdate`, which refuses a body
 * carrying any key other than `constituency_id` rather than ignoring the
 * extras. So `has_voted`, `is_verified`, `voter_phone`, `voter_dob`,
 * `full_name`, `registered_at` and `id` are unreachable from here — a request
 * naming one is answered with a 400, not a partial success.
 *
 * Ballots are untouched by construction: `votes` is never referenced, and it
 * carries no reference back to a voter to be updated in the first place.
 *
 * ── Why a voter who has already voted cannot be moved ───────────────────────
 *
 * `votes` rows carry the constituency the ballot was cast in. Moving a voter
 * afterwards leaves the ballot counted in the old constituency while the voter
 * counts as registered in the new one, permanently desynchronising the
 * registered-versus-ballots reconciliation the dashboard reports as its
 * integrity signal. There is no correction to make at that point either: the
 * ballot has been cast in the race the voter was shown. Refused with a 409.
 *
 * ── Authorisation ───────────────────────────────────────────────────────────
 *
 * Three gates, all of which must pass: `proxy.js` verifies the admin session
 * before this handler runs; `requireSameOrigin` refuses a cross-site POST that
 * rode in on the cookie; and `requireSuperadmin` refuses an administrator whose
 * role does not carry voter access.
 */
export async function PATCH(request, { params }) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    const { admin, allowed } = await requireSuperadmin(request)

    if (!allowed) {
        return noStore(
            jsonError(
                'You do not have permission to change voter records.',
                403,
                ERROR_CODES.FORBIDDEN
            )
        )
    }

    const { id } = await params

    if (!isUUID(id)) {
        return noStore(jsonError('Invalid voter id.', 400, ERROR_CODES.VALIDATION_FAILED))
    }

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body.', 400, ERROR_CODES.INVALID_BODY))
    }

    const picked = pickConstituencyUpdate(body)
    if (picked.error) {
        return noStore(jsonError(picked.error, 400, ERROR_CODES.VALIDATION_FAILED))
    }

    const supabase = createAdminClient()

    // Read first. This gives the 404, the previous constituency for the audit
    // entry, the has_voted refusal, and the chance to recognise a no-op before
    // writing anything — the same order the constituency rename route uses.
    const { data: before, error: readError } = await supabase
        .from('voters')
        .select(ADMIN_VOTER_COLUMNS)
        .eq('id', id)
        .maybeSingle()

    if (readError) return dbError(readError, 'Could not load the voter record.')
    if (!before) return noStore(jsonError('Voter not found.', 404, ERROR_CODES.VALIDATION_FAILED))

    if (before.has_voted === true) {
        return noStore(
            jsonError(
                'This voter has already cast a ballot, so their constituency can no longer be changed.',
                409,
                ERROR_CODES.ALREADY_VOTED
            )
        )
    }

    const beforeView = toAdminVoterView(before)

    if (beforeView.constituency_id === picked.constituencyId) {
        // Already where the administrator is asking for it to be. Reported as
        // success rather than an error, and deliberately not audited: an entry
        // recording a change that did not happen makes the trail harder to read
        // during the one situation it exists for.
        return jsonNoStore({ success: true, voter: beforeView, unchanged: true })
    }

    // The target must exist. The foreign key would refuse a bad id anyway, but
    // catching it here turns a 500-shaped database error into a plain sentence,
    // and gives the audit entry the constituency's name rather than just a UUID.
    const { data: target, error: targetError } = await supabase
        .from('constituencies')
        .select('id, name')
        .eq('id', picked.constituencyId)
        .maybeSingle()

    if (targetError) return dbError(targetError, 'Could not load the constituency.')
    if (!target) {
        return noStore(
            jsonError('That constituency does not exist.', 404, ERROR_CODES.VALIDATION_FAILED)
        )
    }

    // The only write in this file: one column, filtered on the id.
    const { data: updated, error } = await supabase
        .from('voters')
        .update({ constituency_id: picked.constituencyId })
        .eq('id', id)
        .select(ADMIN_VOTER_COLUMNS)
        .maybeSingle()

    if (error) {
        if (error.code === PG_FOREIGN_KEY_VIOLATION) {
            return noStore(
                jsonError('That constituency does not exist.', 400, ERROR_CODES.VALIDATION_FAILED)
            )
        }
        return dbError(error, 'Could not update the voter’s constituency.')
    }

    if (!updated) return noStore(jsonError('Voter not found.', 404, ERROR_CODES.VALIDATION_FAILED))

    const afterView = toAdminVoterView(updated)

    await logAdminAction(supabase, AUDIT_ACTIONS.VOTER_CONSTITUENCY_CHANGED, {
        actor: admin?.email ?? null,
        ip: getClientIp(request),
        ...constituencyChangeAudit({
            voterId: id,
            before: beforeView,
            after: afterView,
        }),
    })

    return jsonNoStore({ success: true, voter: afterView })
}
