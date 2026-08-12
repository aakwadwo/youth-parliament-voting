import * as Sentry from '@sentry/nextjs'

import { createAdminClient } from '@/lib/supabase-admin'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, noStore, rateLimitRefusal } from '@/lib/http'
import { jsonError } from '@/lib/api-error'
import { buildRegistrationReport, registrationReportFilename } from '@/lib/registration-report'

/**
 * The registration statistics as a PDF, for circulation to election officials
 * and candidates.
 *
 * Administrator-only, gated by `proxy.js` like every other `/api/admin/*` path.
 * Follows the candidate register's export shape exactly: the same `export` rate
 * limit so one administrator cannot queue dozens of renders, the same lazy
 * pdfkit import so font metrics are never bundled into a request that does not
 * draw a PDF, the same `Content-Disposition` handling, and the same audit entry.
 *
 * It builds from `buildRegistrationReport` — the identical call the on-screen
 * section makes — so the document and the dashboard cannot state different
 * totals.
 */

// Rendering a few hundred rows is quick, but the budget matches the other
// exports so a slow database read cannot be cut off mid-document.
export const maxDuration = 60

const FORMATS = {
    pdf: { extension: 'pdf', contentType: 'application/pdf' },
}

export async function GET(request) {
    const admin = await getAdminFromRequest(request)
    const ip = getClientIp(request)

    const limit = await rateLimit('export', admin?.id ?? ip, RATE_LIMITS.export)
    if (!limit.allowed) {
        return rateLimitRefusal(limit, 'Too many exports. Please wait a moment and try again.')
    }

    const format = (new URL(request.url).searchParams.get('format') ?? 'pdf').toLowerCase()
    const spec = FORMATS[format]

    if (!spec) {
        return noStore(jsonError('Unsupported export format. Use pdf.', 400))
    }

    const supabase = createAdminClient()

    let report
    try {
        report = await buildRegistrationReport(supabase, { generatedBy: admin?.email ?? null })
    } catch (error) {
        console.error('[registration-stats-export] failed to build report', error)
        Sentry.captureException(error)
        return noStore(
            jsonError('Could not build the registration statistics. Please try again.', 500)
        )
    }

    let body
    try {
        const { renderRegistrationStatsPdf } = await import('@/lib/export/registration-stats-pdf')
        body = await renderRegistrationStatsPdf(report)
    } catch (error) {
        console.error('[registration-stats-export] failed to render', format, error)
        Sentry.captureException(error)
        return noStore(
            jsonError('Could not generate the registration statistics. Please try again.', 500)
        )
    }

    await logAdminAction(supabase, AUDIT_ACTIONS.REGISTRATION_STATS_EXPORTED, {
        actor: admin?.email ?? null,
        ip,
        entity: 'registration_statistics',
        format,
        // The figures the exported document stated, so the audit trail records
        // what was circulated and not merely that something was.
        total_registered: report.summary.totalRegistered,
        constituencies: report.summary.totalConstituencies,
    })

    const filename = registrationReportFilename(report, spec.extension)

    return new Response(body, {
        headers: {
            'Content-Type': spec.contentType,
            'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
            'Content-Length': String(body.length),
            'Cache-Control': 'no-store, private',
            'X-Content-Type-Options': 'nosniff',
        },
    })
}
