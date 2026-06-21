import * as Sentry from '@sentry/nextjs'

// Next.js calls register() once on server startup. @sentry/nextjs v10+ no
// longer auto-loads sentry.server.config.js by convention, so we import it
// explicitly here — it contains the actual Sentry.init() call (or no-ops if
// SENTRY_DSN isn't set).
export async function register() {
    await import('./sentry.server.config')
}

export const onRequestError = Sentry.captureRequestError
