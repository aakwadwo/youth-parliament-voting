import { createAdminClient } from '@/lib/supabase-admin'
import { requireSuperadmin } from '@/lib/admin-session'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { jsonError, dbError, ERROR_CODES } from '@/lib/api-error'
import { getClientIp, noStore, jsonNoStore, rateLimitRefusal } from '@/lib/http'
import { parseVoterSearch, toAdminVoterView, ADMIN_VOTER_COLUMNS } from '@/lib/voter-admin'

/**
 * Finding one voter, by phone number, so an administrator can correct their
 * constituency.
 *
 * ── The scope, stated as narrowly as it is implemented ──────────────────────
 *
 * One exact phone match, at most one row, a fixed projection that omits the
 * date of birth and masks the number. There is no name search, no listing, no
 * pagination and no filter — none of which is an oversight. This is the first
 * endpoint in the platform that returns a row describing a person, and the
 * difference between "look up the voter who has just rung in" and "browse the
 * electoral register" is exactly the absence of those controls.
 *
 * The lookup resolves against the unique index on `voters.voter_phone`, so
 * "at most one row" is a property of the schema rather than of a LIMIT clause
 * a later edit could raise.
 *
 * ── Authorisation ───────────────────────────────────────────────────────────
 *
 * `proxy.js` has already refused this request without a valid admin session
 * before this handler runs. The role check below is a second gate specific to
 * voter data — see `requireSuperadmin`. Both have to pass.
 *
 * ── Read-only ───────────────────────────────────────────────────────────────
 *
 * This file contains no insert, update, upsert or delete, and must not grow
 * one. Writing lives in `[id]/route.js`, where it is one column wide.
 */
export async function GET(request) {
    const { admin, allowed } = await requireSuperadmin(request)

    if (!allowed) {
        return noStore(
            jsonError(
                'You do not have permission to look up voter records.',
                403,
                ERROR_CODES.FORBIDDEN
            )
        )
    }

    // Keyed by admin id rather than IP: this limit exists to bound what a single
    // compromised session can extract, and an attacker holding that session can
    // change address freely.
    const ip = getClientIp(request)
    const limit = await rateLimit('admin-voter-search', admin.id ?? ip, RATE_LIMITS.adminVoterSearch)
    if (!limit.allowed) {
        return rateLimitRefusal(limit, 'Too many voter lookups. Please wait a moment.')
    }

    const { searchParams } = new URL(request.url)
    const parsed = parseVoterSearch(searchParams.get('phone'))

    if (parsed.error) {
        return noStore(jsonError(parsed.error, 400, ERROR_CODES.VALIDATION_FAILED))
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('voters')
        .select(ADMIN_VOTER_COLUMNS)
        .eq('voter_phone', parsed.phone)
        .maybeSingle()

    // `dbError` reports to Sentry, and it is handed the Postgres error only —
    // never the row, and never the number that was searched for.
    if (error) return dbError(error, 'Could not search the register.')

    // A miss is a 200 with `voter: null`, not a 404. The endpoint exists and
    // answered; "no registration with that number" is the answer.
    return jsonNoStore({ voter: toAdminVoterView(data) })
}
