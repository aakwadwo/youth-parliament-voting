'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TricolourRule } from '@/components/brand/BrandMark'

export default function AdminError({ error, reset }) {
    useEffect(() => {
        console.error(error)
        Sentry.captureException(error)
    }, [error])

    return (
        <div className="flex min-h-dvh flex-col bg-surface">
            <TricolourRule />
            <main className="flex flex-1 items-center justify-center px-4 py-10">
                <div className="w-full max-w-sm space-y-6 text-center">
                    <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger-surface text-destructive">
                        <AlertTriangle aria-hidden="true" className="size-7" />
                    </span>
                    <div className="space-y-2">
                        <h1 className="text-title font-semibold">Something went wrong</h1>
                        <p className="leading-relaxed text-muted-foreground">
                            The admin portal could not load this section. Election data is
                            unaffected.
                        </p>
                    </div>
                    {error?.digest ? (
                        <p className="numeric text-xs text-muted-foreground">
                            Reference: {error.digest}
                        </p>
                    ) : null}
                    <Button size="lg" className="w-full" onClick={reset}>
                        Try again
                    </Button>
                </div>
            </main>
        </div>
    )
}
