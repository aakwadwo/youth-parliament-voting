import * as Sentry from '@sentry/nextjs'

import { createAdminClient } from '@/lib/supabase-admin'
import { getAdminFromRequest } from '@/lib/admin-session'
import { dbError } from '@/lib/api-error'
import { jsonNoStore } from '@/lib/http'
import { buildRegistrationReport } from '@/lib/registration-report'

/**
 * Registered voters, by constituency.
 *
 * Administrator-only: `proxy.js` refuses every `/api/admin/*` request without a
 * valid admin JWT before this handler runs, so there is no authorisation check
 * here — adding a second one would be a second thing to get wrong.
 *
 * Read-only, and aggregate by construction. The builder never touches the
 * `voters` table; the counts come from Postgres-side aggregates, so the largest
 * object this route can return is one row per constituency carrying a name, a
 * region, a code and a number. It is not, and must not become, a way to browse
 * the register.
 */
export async function GET(request) {
    const supabase = createAdminClient()
    const admin = await getAdminFromRequest(request)

    try {
        const report = await buildRegistrationReport(supabase, {
            generatedBy: admin?.email ?? null,
        })
        return jsonNoStore(report)
    } catch (error) {
        Sentry.captureException(error)
        return dbError(error, 'Could not load registration statistics.')
    }
}
