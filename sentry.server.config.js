import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        environment: process.env.NODE_ENV,
    })
} else {
    console.warn('[sentry] SENTRY_DSN not set — server-side error reporting is disabled.')
}
