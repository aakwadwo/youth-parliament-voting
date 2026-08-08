import * as Sentry from '@sentry/nextjs'

import { createAdminClient } from '@/lib/supabase-admin'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, noStore, rateLimitRefusal } from '@/lib/http'
import { jsonError } from '@/lib/api-error'
import { buildCandidateRegister, registerFilename } from '@/lib/candidate-register'

/**
 * The complete candidate register as a PDF, for the Commission's review.
 *
 * Administrator-only, and it stays that way: `proxy.js` refuses every
 * `/api/admin/*` request without a valid admin JWT before this handler runs.
 * The register names every candidate standing in every constituency, which is
 * not something to publish from an unauthenticated endpoint before the
 * Commission has announced the field.
 *
 * `format` is a parameter rather than hardcoded so the register can grow a CSV
 * sibling later without the route or the button moving.
 */

// Fetching several hundred photographs and rendering them is CPU- and
// network-bound, and can outlive the default serverless budget.
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

    let register
    try {
        register = await buildCandidateRegister(supabase, { generatedBy: admin?.email ?? null })
    } catch (error) {
        console.error('[candidate-export] failed to build register', error)
        Sentry.captureException(error)
        return noStore(jsonError('Could not build the candidate list. Please try again.', 500))
    }

    let body
    try {
        // Imported lazily so pdfkit and its font metrics are never pulled into
        // the bundle for a request that does not render a PDF.
        const [{ fetchPhotos }, { renderCandidateListPdf }] = await Promise.all([
            import('@/lib/export/photos'),
            import('@/lib/export/candidate-list-pdf'),
        ])

        const photos = await fetchPhotos(
            register.regions.flatMap((r) =>
                r.constituencies.flatMap((c) => c.candidates.map((cand) => cand.photoUrl))
            )
        )

        // The image bytes are attached to the register here rather than inside
        // the builder, so the builder stays a pure database read that a test
        // can drive without a network.
        const withPhotos = {
            ...register,
            regions: register.regions.map((region) => ({
                ...region,
                constituencies: region.constituencies.map((constituency) => ({
                    ...constituency,
                    candidates: constituency.candidates.map((candidate) => ({
                        ...candidate,
                        photo: candidate.photoUrl ? (photos.get(candidate.photoUrl) ?? null) : null,
                    })),
                })),
            })),
        }

        body = await renderCandidateListPdf(withPhotos)
    } catch (error) {
        console.error('[candidate-export] failed to render', format, error)
        Sentry.captureException(error)
        return noStore(jsonError('Could not generate the candidate list. Please try again.', 500))
    }

    await logAdminAction(supabase, AUDIT_ACTIONS.CANDIDATE_LIST_EXPORTED, {
        actor: admin?.email ?? null,
        ip,
        entity: 'candidate_register',
        format,
        candidates: register.summary.candidates,
    })

    const filename = registerFilename(register, spec.extension)

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
