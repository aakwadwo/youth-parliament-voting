'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

export default function AdminError({ error, reset }) {
    useEffect(() => {
        console.error(error)
        Sentry.captureException(error)
    }, [error])

    return (
        <main className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
            <div className="max-w-sm w-full text-center space-y-4">
                <h2 className="text-xl font-semibold text-black">Something went wrong</h2>
                <p className="text-zinc-500 text-sm leading-relaxed">
                    An unexpected error occurred loading the admin portal.
                </p>
                <Button className="w-full h-11 bg-black text-white hover:bg-zinc-800" onClick={reset}>
                    Try again
                </Button>
            </div>
        </main>
    )
}
