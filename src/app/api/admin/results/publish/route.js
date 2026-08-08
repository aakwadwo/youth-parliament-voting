import { createAdminClient } from '@/lib/supabase-admin'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { jsonError, dbError, ERROR_CODES } from '@/lib/api-error'
import { getClientIp, requireSameOrigin, noStore, jsonNoStore } from '@/lib/http'
import { readResultsPublication } from '@/lib/election-server'

/**
 * The Electoral Commission's release of the count.
 *
 * Its own route rather than a field on `PATCH /api/admin/settings`, because it
 * is a different kind of decision from the ones that live there. Settings is
 * where the election is configured — its name, its window, whether the poll is
 * running. This is the single act of putting the result in front of the public,
 * it has a precondition the other fields do not, and it is the one an election
 * petition will ask to see the audit entry for. Bundling it into the settings
 * form would also have meant an administrator could publish a result as a side
 * effect of correcting a spelling in the election's name.
 *
 * Gated by proxy.js like every other /api/admin route: an unauthenticated
 * caller never reaches this handler.
 */

/** The current publication state, for the admin control to render from. */
export async function GET() {
    const { publication, error } = await readResultsPublication()

    if (error) return noStore(dbError(error, 'Could not load the results publication status.'))

    return jsonNoStore(publication)
}

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400, ERROR_CODES.INVALID_BODY))
    }

    if (typeof body?.published !== 'boolean') {
        return noStore(
            jsonError('published must be true or false', 400, ERROR_CODES.VALIDATION_FAILED)
        )
    }

    const supabase = createAdminClient()
    const { publication, error: readError } = await readResultsPublication(supabase)

    if (readError) {
        return noStore(
            dbError(readError, 'Could not confirm the election status. Please try again.', 503)
        )
    }

    if (!publication?.id) {
        return noStore(
            jsonError(
                'This deployment has no election settings row to publish against.',
                409,
                ERROR_CODES.VALIDATION_FAILED
            )
        )
    }

    // The precondition, enforced here and not only in the button's disabled
    // state. Publishing while ballots can still be cast releases a partial
    // count, which is the one result that cannot be withdrawn once seen.
    // Withdrawing is never blocked: whatever state the election is in, an
    // administrator must always be able to take a published figure down.
    if (body.published && !publication.canPublish) {
        return noStore(
            jsonError(
                'Results can only be published once voting has ended.',
                409,
                ERROR_CODES.FORBIDDEN,
                { publication }
            )
        )
    }

    // Idempotent. Publishing an already-published result is not an error — two
    // administrators may well press the button at the same moment — but it must
    // not rewrite the declaration time or add a second audit entry saying the
    // result was declared again.
    if (body.published === publication.published) {
        return jsonNoStore(publication)
    }

    const publishedAt = body.published ? new Date().toISOString() : null

    const { error } = await supabase
        .from('election_settings')
        .update({ results_published_at: publishedAt })
        .eq('id', publication.id)

    if (error) return noStore(dbError(error, 'Could not change the results publication status.'))

    const admin = await getAdminFromRequest(request)

    await logAdminAction(
        supabase,
        body.published ? AUDIT_ACTIONS.RESULTS_PUBLISHED : AUDIT_ACTIONS.RESULTS_UNPUBLISHED,
        {
            actor: admin?.email ?? null,
            ip: getClientIp(request),
            entity: 'election_settings',
            published_at: publishedAt,
            previously_published_at: publication.publishedAt,
            election_status: publication.status,
        }
    )

    return jsonNoStore({
        ...publication,
        published: body.published,
        publishedAt,
        isPublic: body.published && publication.canPublish,
    })
}
