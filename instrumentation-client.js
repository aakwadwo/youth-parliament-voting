// Next.js loads instrumentation-client.js automatically before hydration.
// The actual Sentry.init() call (or no-op if NEXT_PUBLIC_SENTRY_DSN isn't
// set) lives in sentry.client.config.js.
import './sentry.client.config'
