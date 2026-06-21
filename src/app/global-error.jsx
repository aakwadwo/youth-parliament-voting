'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// Catches errors thrown by the root layout itself, where the regular
// error.jsx boundary cannot apply. Must render its own <html>/<body>.
export default function GlobalError({ error, reset }) {
    useEffect(() => {
        console.error(error)
        Sentry.captureException(error)
    }, [error])

    return (
        <html lang="en">
            <body>
                <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Something went wrong</h2>
                    <p style={{ color: '#71717a', marginTop: '0.5rem' }}>Please refresh the page and try again.</p>
                    <button
                        onClick={reset}
                        style={{ marginTop: '1.5rem', padding: '0.625rem 1.5rem', borderRadius: '9999px', background: 'black', color: 'white', border: 'none' }}
                    >
                        Try again
                    </button>
                </main>
            </body>
        </html>
    )
}
