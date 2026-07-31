import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

/**
 * The codes the browser branches on. Adding one is cheap; changing the string
 * value of one already shipped breaks any client still deployed, so treat them
 * as fixed once released.
 */
export const ERROR_CODES = {
    INVALID_BODY: 'INVALID_BODY',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    MISSING_FIELDS: 'MISSING_FIELDS',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    ALREADY_REGISTERED: 'ALREADY_REGISTERED',
    ALREADY_VOTED: 'ALREADY_VOTED',
    DEVICE_LIMIT: 'DEVICE_LIMIT',
    RATE_LIMITED: 'RATE_LIMITED',
    FORBIDDEN: 'FORBIDDEN',
    SERVER_ERROR: 'SERVER_ERROR',
    UNAVAILABLE: 'UNAVAILABLE',
}

/**
 * Every API failure in this app leaves through here, in one shape:
 *
 *   { error: "<a sentence a voter can act on>", code: "<stable identifier>" }
 *
 * `error` is the only thing ever shown to a voter, so it must be plain English
 * and must never carry a Postgres message, a constraint name or a stack.
 *
 * `code` exists because the browser previously had to infer what had happened
 * from the status alone, and 403 covers both "the poll has not opened yet" and
 * "that request looked cross-origin" — situations needing completely different
 * screens. Matching on the prose instead would break the moment anyone rewords
 * a message. Codes are stable; messages are editorial.
 *
 * `extra` merges further context into the body for the cases where the client
 * needs it to render — chiefly the election state on a 403 from a voting
 * route, so the page can show the right screen without a follow-up request
 * that might return a different answer.
 */
export function jsonError(message, status = 400, code, extra) {
    return NextResponse.json({ error: message, ...(code ? { code } : {}), ...extra }, { status })
}

// Logs the real Supabase/Postgres error server-side and returns a safe,
// generic message to the client so internal schema/details are never exposed.
// This is the one place nearly every API route funnels failures through, so
// it's also the highest-value place to report to Sentry — React error
// boundaries never see server-side errors that are caught and turned into a
// JSON response like this.
export function dbError(error, fallbackMessage = 'Something went wrong. Please try again.', status = 500) {
    console.error('[db error]', error)
    Sentry.captureException(error)
    return jsonError(
        fallbackMessage,
        status,
        status === 503 ? ERROR_CODES.UNAVAILABLE : ERROR_CODES.SERVER_ERROR
    )
}

export const PG_UNIQUE_VIOLATION = '23505'
export const PG_FOREIGN_KEY_VIOLATION = '23503'
