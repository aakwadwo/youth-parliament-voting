'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

import { Button } from '@/components/ui/button'
import { PageShell, PageHeading } from '@/components/layout/PageShell'

export default function Error({ error, reset }) {
    useEffect(() => {
        console.error(error)
        Sentry.captureException(error)
    }, [error])

    return (
        <PageShell width="sm">
            <PageHeading
                title="Something went wrong"
                description="This page did not load. Your registration and any ballot you have already cast are unaffected."
            />

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={reset}>
                    Try again
                </Button>
                <Button asChild variant="outline" size="lg">
                    <Link href="/">Back to home</Link>
                </Button>
            </div>

            {/* The digest is what support needs to find this exact failure in
                the error log, so it is shown rather than hidden. */}
            {error?.digest ? (
                <p className="numeric mt-8 text-sm text-muted-foreground">
                    Reference: {error.digest}
                </p>
            ) : null}
        </PageShell>
    )
}
