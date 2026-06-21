import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export function jsonError(message, status = 400) {
    return NextResponse.json({ error: message }, { status })
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
    return jsonError(fallbackMessage, status)
}

export const PG_UNIQUE_VIOLATION = '23505'
export const PG_FOREIGN_KEY_VIOLATION = '23503'
