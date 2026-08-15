import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, requireSameOrigin, noStore, rateLimitRefusal } from '@/lib/http'
import { jsonError, dbError, ERROR_CODES } from '@/lib/api-error'

/**
 * Feedback about the platform.
 *
 * The only unauthenticated write in this application that is not part of
 * casting a ballot, so what it is *not* allowed to touch matters more than what
 * it does. It writes one row to `platform_feedback` (migration 0017) and reads
 * nothing. It does not open the voters table, the votes table, the candidate
 * list or the election settings row, and the table it writes to has no column
 * that could reference any of them.
 *
 * Nothing identifying is stored — no IP, no user agent, no session, no name.
 * The IP is used for the rate limit and then discarded with the request. A
 * submission cannot be traced back to a voter, which is the same property the
 * ballot has and for the same reason: someone should be able to say the voting
 * screen confused them without that being attributable to them.
 *
 * ── Spam control ────────────────────────────────────────────────────────────
 *
 * Three layers, cheapest first:
 *
 *   1. Same-origin, so the form cannot be posted from another site.
 *   2. A per-IP rate limit (10/hour), consumed before the body is parsed.
 *   3. Length and range caps, enforced here AND as check constraints on the
 *      table, so a careless edit to this file cannot widen what lands in the
 *      database.
 *
 * There is no CAPTCHA. It would be the only third-party script on a government
 * voting platform, it would exclude exactly the low-end-device users whose
 * feedback is most worth having, and the cost of the abuse it would prevent
 * here is some rows in a table nothing depends on.
 */

/** Matches the check constraints in migration 0017. */
const MAX_TEXT = 4000
const MAX_PARTS = 12
const MAX_PART_LEN = 60
const MAX_DEVICE_LEN = 40

/** Trims, collapses an empty string to null, and caps length. */
function text(value, max = MAX_TEXT) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, max)
}

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    const ip = getClientIp(request)
    const limit = await rateLimit('feedback-ip', ip, RATE_LIMITS.feedbackIp)
    if (!limit.allowed) {
        return rateLimitRefusal(
            limit,
            'Thanks — we have already received several submissions from your connection. Please try again later.'
        )
    }

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400, ERROR_CODES.INVALID_BODY))
    }

    const { rating, parts, device, worked_well, problems, suggestions } = body ?? {}

    // 1..5, or absent. Anything else is discarded rather than refused: the
    // rating is one optional question and a malformed one is not worth losing
    // someone's written answers over.
    const parsedRating = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null

    const parsedParts = Array.isArray(parts)
        ? [...new Set(parts.filter((p) => typeof p === 'string' && p.trim()))]
              .slice(0, MAX_PARTS)
              .map((p) => p.trim().slice(0, MAX_PART_LEN))
        : []

    const row = {
        rating: parsedRating,
        parts: parsedParts,
        device: text(device, MAX_DEVICE_LEN),
        worked_well: text(worked_well),
        problems: text(problems),
        suggestions: text(suggestions),
    }

    // The same "not entirely empty" rule the table enforces, checked here so an
    // empty submission costs one round trip fewer and gets a sentence rather
    // than a constraint violation.
    const hasContent =
        row.rating !== null ||
        row.parts.length > 0 ||
        row.device !== null ||
        row.worked_well !== null ||
        row.problems !== null ||
        row.suggestions !== null

    if (!hasContent) {
        return noStore(
            jsonError(
                'Please answer at least one question before sending.',
                400,
                ERROR_CODES.MISSING_FIELDS
            )
        )
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('platform_feedback').insert(row)

    if (error) {
        return dbError(error, 'Could not save your feedback. Please try again.')
    }

    // Deliberately no id and no echo of what was stored: the sender knows what
    // they wrote, and a handle for an anonymous submission is a handle nobody
    // should have.
    return noStore(NextResponse.json({ received: true }))
}
