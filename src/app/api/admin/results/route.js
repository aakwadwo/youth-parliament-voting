import * as Sentry from '@sentry/nextjs'

import { createAdminClient } from '@/lib/supabase-admin'
import { getAdminFromRequest } from '@/lib/admin-session'
import { jsonError } from '@/lib/api-error'
import { jsonNoStore } from '@/lib/http'
import { buildElectionReport } from '@/lib/election-report'

/**
 * Live results for the admin portal.
 *
 * Deliberately built from the same report builder the PDF, Excel and CSV
 * exports use. The on-screen figures and the exported ones therefore cannot
 * drift apart — which matters most in the case where they would be compared
 * most closely: an election petition.
 *
 * All aggregation happens in Postgres (migration 0009), so this never reads
 * individual ballots and its cost does not grow with turnout.
 */
export async function GET(request) {
    const supabase = createAdminClient()
    const admin = await getAdminFromRequest(request)

    let report
    try {
        report = await buildElectionReport(supabase, { generatedBy: admin?.email ?? null })
    } catch (error) {
        console.error('[results] failed to build', error)
        Sentry.captureException(error)
        return jsonError('Could not load results.', 500)
    }

    return jsonNoStore({
        summary: report.summary,
        constituencies: report.constituencies,
        regions: report.regions,
    })
}
