import { jwtVerify } from 'jose'
import { NextResponse } from 'next/server'

const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET)

const isProd = process.env.NODE_ENV === 'production'

// Hosts the browser is allowed to reach directly. All Supabase database access
// happens server-side, so the only browser-facing Supabase traffic is candidate
// photos loaded from Storage.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : ''

let sentryOrigin = ''
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
        sentryOrigin = new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin
    } catch {
        sentryOrigin = ''
    }
}

/**
 * Content Security Policy.
 *
 * Scripts are allowed only via a per-request nonce plus 'strict-dynamic', so an
 * injected `<script>` cannot execute even if markup escaping were somehow
 * bypassed — the strongest practical XSS mitigation for an app that renders
 * people's names (candidates, voters, admin emails) on nearly every screen.
 *
 * Trade-off: a per-request nonce means pages can no longer be cached as static
 * HTML. That is a cheap price here — every screen in this app is either a
 * client component driving an API or a personalised session view, so there was
 * almost no static HTML to lose.
 *
 * 'unsafe-inline' survives on style-src only: React and Radix both emit inline
 * style attributes (tally-bar widths, popover positioning) that cannot carry a
 * nonce. Inline CSS is a far weaker vector than inline JS.
 */
function buildCsp(nonce) {
    const scriptSrc = isProd
        ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
        : // The dev server needs eval for React Refresh and hot reloading.
          `'self' 'unsafe-eval' 'unsafe-inline'`

    return [
        `default-src 'self'`,
        `script-src ${scriptSrc}`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' blob: data:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
        `font-src 'self' data:`,
        `connect-src 'self'${sentryOrigin ? ` ${sentryOrigin}` : ''}${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
        // Nothing here is ever framed, and nothing here ever frames anything.
        `frame-src 'none'`,
        `frame-ancestors 'none'`,
        `object-src 'none'`,
        // Stops an injected <base> repointing every relative URL, and stops a
        // form being redirected to an attacker's collector.
        `base-uri 'self'`,
        `form-action 'self'`,
        isProd ? 'upgrade-insecure-requests' : '',
    ]
        .filter(Boolean)
        .join('; ')
}

function applySecurityHeaders(response, csp) {
    response.headers.set('Content-Security-Policy', csp)
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    // Never leak a voter's path — which can identify a constituency — to a
    // third party, while keeping same-origin referrers intact.
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
    )
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')

    if (isProd) {
        response.headers.set(
            'Strict-Transport-Security',
            'max-age=63072000; includeSubDomains; preload'
        )
    }

    return response
}

export async function proxy(request) {
    const { pathname } = request.nextUrl

    const nonce = crypto.randomUUID().replaceAll('-', '')
    const csp = buildCsp(nonce)

    // Next.js reads the nonce off the incoming request headers and stamps it
    // onto the framework's own inline bootstrap scripts.
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', csp)

    const forward = () =>
        applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp)

    const isAdminApi =
        pathname.startsWith('/api/admin') &&
        pathname !== '/api/admin/login' &&
        pathname !== '/api/admin/logout'
    const isAdminPage = pathname.startsWith('/admin') && pathname !== '/admin/login'

    if (!isAdminApi && !isAdminPage) {
        return forward()
    }

    const token = request.cookies.get('admin_token')?.value

    if (token) {
        try {
            await jwtVerify(token, secret)
            return forward()
        } catch {
            // Expired or tampered token — fall through to unauthenticated handling.
        }
    }

    if (isAdminApi) {
        return applySecurityHeaders(
            NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
            csp
        )
    }

    // Send the admin back to where they were headed once they have signed in.
    const loginUrl = new URL('/admin/login', request.url)
    if (pathname !== '/admin') {
        loginUrl.searchParams.set('next', pathname)
    }
    return applySecurityHeaders(NextResponse.redirect(loginUrl), csp)
}

export const config = {
    // Runs on every document and API request so the security headers are
    // universal, while skipping build output and static assets, which are
    // served straight from the CDN and need no per-request work.
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|brand/|robots.txt|manifest.webmanifest).*)',
    ],
}
