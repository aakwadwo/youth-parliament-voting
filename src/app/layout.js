import { Inter } from 'next/font/google'
import './globals.css'

// One variable font, self-hosted and preloaded by next/font. Replaces the
// previous setup, which downloaded two Geist families that no CSS referenced
// plus three static @fontsource/inter weights — roughly 5 font files served
// for a single typeface.
const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-inter',
})

const SITE_NAME = 'National Youth Parliament Ghana'
const DESCRIPTION =
    'The official voting platform for National Youth Parliament of Ghana elections. Register, verify your eligibility, and cast one secret ballot in your constituency.'

// Absolute URLs for social/preview images. NEXT_PUBLIC_SITE_URL is the
// canonical production domain; VERCEL_URL covers preview deployments, which
// each get their own hostname.
const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export const metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: `${SITE_NAME} — Official Voting Platform`,
        template: `%s — ${SITE_NAME}`,
    },
    description: DESCRIPTION,
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
        title: `${SITE_NAME} — Official Voting Platform`,
        description: DESCRIPTION,
        siteName: SITE_NAME,
        locale: 'en_GH',
        type: 'website',
        images: [{ url: '/brand/icon-512.png', width: 512, height: 512, alt: `${SITE_NAME} logo` }],
    },
    // The voter area is behind a session and holds personal data; there is
    // nothing here that should ever appear in a search index.
    robots: { index: false, follow: false },
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
