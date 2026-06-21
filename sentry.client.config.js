import * as Sentry from '@sentry/nextjs'

// Next.js only exposes NEXT_PUBLIC_-prefixed env vars to client bundles, so
// this reads NEXT_PUBLIC_SENTRY_DSN even though the server config reads the
// plain SENTRY_DSN — set both to the same value. If neither is set, Sentry
// is never initialized and this file is a no-op (errors still go to the
// console via the existing error boundaries).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        environment: process.env.NODE_ENV,
    })
}
