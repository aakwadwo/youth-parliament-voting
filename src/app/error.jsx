'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

export default function Error({ error, reset }) {
    useEffect(() => {
        console.error(error)
        Sentry.captureException(error)
    }, [error])

    return (
        <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="flex justify-center">
                    <div className="h-2 w-20 bg-[#CF0A0A]" />
                    <div className="h-2 w-20 bg-[#FCD20F]" />
                    <div className="h-2 w-20 bg-[#006B3F]" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-black">Something went wrong</h2>
                    <p className="text-zinc-500 text-base leading-relaxed">
                        An unexpected error occurred. Please try again, and contact support if the problem continues.
                    </p>
                </div>
                <Button className="w-full h-11 text-base bg-black text-white hover:bg-zinc-800" onClick={reset}>
                    Try again
                </Button>
            </div>
        </main>
    )
}
