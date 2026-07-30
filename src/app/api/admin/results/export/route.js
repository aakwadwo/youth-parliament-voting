import * as Sentry from '@sentry/nextjs'

import { createAdminClient } from '@/lib/supabase-admin'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, noStore } from '@/lib/http'
import { jsonError } from '@/lib/api-error'
import { buildElectionReport, reportFilename } from '@/lib/election-report'
import { buildWorkbookSheets, buildCsvRows } from '@/lib/export/report-sheets'
import { createWorkbook } from '@/lib/export/xlsx'
import { toCsv } from '@/lib/export/csv'

// Rendering a PDF is CPU-bound and can outlive the default serverless budget on
// a national-scale register.
export const maxDuration = 60

const FORMATS = {
    csv: { extension: 'csv', contentType: 'text/csv; charset=utf-8' },
    xlsx: {
        extension: 'xlsx',
        contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    pdf: { extension: 'pdf', contentType: 'application/pdf' },
}

export async function GET(request) {
    const admin = await getAdminFromRequest(request)
    const ip = getClientIp(request)

    const limit = await rateLimit('export', admin?.id ?? ip, RATE_LIMITS.export)
    if (!limit.allowed) {
        return noStore(jsonError('Too many exports. Please wait a moment and try again.', 429))
    }

    const format = (new URL(request.url).searchParams.get('format') ?? 'csv').toLowerCase()
    const spec = FORMATS[format]

    if (!spec) {
        return noStore(jsonError('Unsupported export format. Use csv, xlsx or pdf.', 400))
    }

    const supabase = createAdminClient()

    let report
    try {
        report = await buildElectionReport(supabase, { generatedBy: admin?.email ?? null })
    } catch (error) {
        console.error('[export] failed to build report', error)
        Sentry.captureException(error)
        return noStore(jsonError('Could not build the election report. Please try again.', 500))
    }

    let body
    try {
        if (format === 'csv') {
            body = Buffer.from(toCsv(buildCsvRows(report)), 'utf8')
        } else if (format === 'xlsx') {
            body = createWorkbook(buildWorkbookSheets(report))
        } else {
            // Imported lazily so pdfkit and its font metrics are never pulled
            // into the bundle for a CSV or Excel download.
            const { renderReportPdf } = await import('@/lib/export/pdf')
            body = await renderReportPdf(report)
        }
    } catch (error) {
        console.error('[export] failed to render', format, error)
        Sentry.captureException(error)
        return noStore(jsonError('Could not generate the export. Please try again.', 500))
    }

    // Who exported what, and when. An election report leaving the system is an
    // auditable event in its own right.
    await logAdminAction(supabase, AUDIT_ACTIONS.RESULTS_EXPORTED, {
        actor: admin?.email ?? null,
        ip,
        entity: 'election_report',
        format,
        ballots: report.summary.totalBallots,
    })

    const filename = reportFilename(report, spec.extension)

    return new Response(body, {
        headers: {
            'Content-Type': spec.contentType,
            // The filename is derived from the election name, so it is quoted
            // and also sent RFC 5987-encoded for non-ASCII characters.
            'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
            'Content-Length': String(body.length),
            'Cache-Control': 'no-store, private',
            'X-Content-Type-Options': 'nosniff',
        },
    })
}
