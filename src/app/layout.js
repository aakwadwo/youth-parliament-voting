import { Inter } from 'next/font/google'
import './globals.css'
import { ELECTION_NAME, ORGANISATION_NAME } from '@/lib/election'
import { readElectionForMetadata } from '@/lib/election-server'

// One variable font, self-hosted and preloaded by next/font. Replaces the
// previous setup, which downloaded two Geist families that no CSS referenced
// plus three static @fontsource/inter weights — roughly 5 font files served
// for a single typeface.
const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-inter',
})

/**
 * Every page renders per request.
 *
 * This is load-bearing, not a performance oversight. src/proxy.js issues a CSP
 * of `script-src 'self' 'nonce-…' 'strict-dynamic'`, and under 'strict-dynamic'
 * a browser *ignores* 'self' — every script tag has to carry that request's
 * nonce or it is blocked. Next.js can only stamp the nonce onto its script tags
 * while rendering the request that produced it.
 *
 * Without this line every page in the app was prerendered at build time, so the
 * HTML shipped with no nonce at all while the response header carried a fresh
 * one. The result in production was a page whose JavaScript never executed —
 * silently, because a blocked script is a console warning, not a server error.
 * `/admin` was where it showed most plainly: the login form sits behind
 * useSearchParams(), so its HTML is a client-side-rendering bailout, and with
 * the scripts blocked the page rendered nothing at all.
 *
 * Dev never reproduced it: the dev CSP uses 'unsafe-inline' (React Refresh
 * needs it), which has no strict-dynamic and no nonce requirement.
 *
 * The cost is CDN caching of the four prose pages. That is genuinely all that
 * was static — every other screen is a client component driving an API.
 */
export const dynamic = 'force-dynamic'

const SITE_NAME = ORGANISATION_NAME

// Absolute URLs for social/preview images. NEXT_PUBLIC_SITE_URL is the
// canonical production domain; VERCEL_URL covers preview deployments, which
// each get their own hostname.
const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

/**
 * The election's name reaches the browser tab from the same settings row every
 * screen reads, not from a constant.
 *
 * This is the last place the name was written into the source. `title.default`
 * and `title.template` feed every page in the app — including the landing page,
 * which sets no title of its own — so an administrator who renamed the election
 * in Admin → Settings changed the headline of the front page while its tab, its
 * bookmarks and its share previews went on advertising the old name.
 *
 * `readElectionForMetadata` holds the answer for 15 seconds across requests —
 * the same freshness `/api/election` already promises the public. This layout
 * runs for every route in the app, including the policy pages and the admin
 * sign-in screen, none of which otherwise touch the database at all; without
 * the cache, naming a browser tab cost one Supabase round trip per page view.
 *
 * It is a separate function from `readElection` on purpose. Nothing that
 * decides whether a ballot may be cast may read a cached election state — see
 * the warning on `readElectionForMetadata`. This decides what a tab is called.
 *
 * A failed read is not an error worth breaking a page over: the constant is what
 * the platform calls an election it cannot currently look up, exactly as it is
 * on the pages themselves.
 */
export async function generateMetadata() {
    // Guarded, unlike the page-level reads. This one runs for *every* route,
    // including the policy pages and the admin sign-in screen, none of which
    // otherwise touch the database — and a metadata function that throws takes
    // the whole page down with it. A deployment with no database configured
    // must still be able to render its terms of use.
    let electionName = ELECTION_NAME
    try {
        const election = await readElectionForMetadata()
        electionName = election?.electionName ?? ELECTION_NAME
    } catch {
        /* fall back to the constant */
    }
    const title = `${electionName} — Official Voting Platform`
    const description =
        `The official voting platform for the ${electionName}. Register, verify your eligibility, ` +
        'and cast one secret ballot in your constituency.'

    return {
        metadataBase: new URL(siteUrl),
        title: {
            default: title,
            template: `%s — ${electionName}`,
        },
        description,
        applicationName: SITE_NAME,
        icons: {
            icon: [
                { url: '/favicon.ico', sizes: 'any' },
                { url: '/brand/icon-192.png', type: 'image/png', sizes: '192x192' },
                { url: '/brand/icon-512.png', type: 'image/png', sizes: '512x512' },
            ],
            apple: [{ url: '/brand/apple-icon.png', sizes: '180x180' }],
        },
        manifest: '/manifest.webmanifest',
        openGraph: {
            title,
            description,
            siteName: SITE_NAME,
            locale: 'en_GH',
            type: 'website',
            images: [
                { url: '/brand/icon-512.png', width: 512, height: 512, alt: `${SITE_NAME} logo` },
            ],
        },
        // The voter area is behind a session and holds personal data; there is
        // nothing here that should ever appear in a search index.
        robots: { index: false, follow: false },
    }
}

export const viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
        { media: '(prefers-color-scheme: dark)', color: '#101211' },
    ],
    width: 'device-width',
    initialScale: 1,
    // Deliberately not capping maximum-scale: voters must be able to pinch-zoom
    // a ballot (WCAG 1.4.4).
    viewportFit: 'cover',
}

export default function RootLayout({ children }) {
    return (
        <html lang="en-GH" className={`${inter.variable} h-full`}>
            <body className="bg-surface text-foreground flex min-h-full flex-col">
                <a
                    href="#main"
                    className="bg-primary text-primary-foreground focus:ring-ring sr-only rounded-lg px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:ring-2 focus:ring-offset-2"
                >
                    Skip to main content
                </a>
                {children}
            </body>
        </html>
    )
}
