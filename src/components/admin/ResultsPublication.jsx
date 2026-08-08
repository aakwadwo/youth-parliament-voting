'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { StatusPill } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/feedback'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useFetch } from '@/lib/useFetch'
import { formatDateTimeLong } from '@/lib/election-status'
import { ELECTORAL_COMMISSION } from '@/lib/election'

/**
 * The control that releases the count to the public.
 *
 * Sits at the foot of Admin → Results, after the figures rather than beside
 * them, because that is the order the decision is made in: an administrator
 * reads the constituency tallies, checks them against the register in Reports,
 * and only then declares. A publish button at the top of the page is one an
 * administrator can press before scrolling.
 *
 * Fetches its own state instead of taking it from the results payload above.
 * The two answer different questions of different tables, and coupling them
 * would mean a failure to build the tallies also removed the only way to
 * withdraw a result that is currently public — the exact moment that control
 * matters most.
 */
export default function ResultsPublication() {
    const {
        data: publication,
        setData: setPublication,
        loading,
        error: loadError,
        reload,
    } = useFetch('/api/admin/results/publish', {
        errorMessage: 'Could not load the results publication status.',
    })

    const [pending, setPending] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [error, setError] = useState('')

    async function confirmToggle() {
        const next = !publication.published

        setPending(true)
        setError('')

        try {
            const res = await fetch('/api/admin/results/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ published: next }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error ?? 'Request failed')
            // The server's answer, not an optimistic guess: it holds the
            // declaration time, and it is the only thing that decides whether
            // the public can actually see the result.
            setPublication(data)
        } catch (err) {
            setError(err.message ?? 'Could not change the results publication status.')
        } finally {
            setPending(false)
            setConfirming(false)
        }
    }

    if (loading && !publication) {
        return <Skeleton className="h-40 w-full rounded-xl" />
    }

    if (loadError) {
        return (
            <Alert variant="danger" title="Could not load the publication status">
                <p>{loadError}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
                    <RefreshCw aria-hidden="true" />
                    Try again
                </Button>
            </Alert>
        )
    }

    if (!publication) return null

    const { published, publishedAt, canPublish, isPublic } = publication

    // Published, but voting is open again — so the public sees nothing. Saying
    // "Published" alone here would be a lie about what the country can read.
    const withheldByState = published && !canPublish

    return (
        <Card>
            <CardContent className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                        <h2 className="font-semibold">Public results</h2>
                        <p className="text-sm text-muted-foreground">
                            {isPublic
                                ? 'Anyone can read the results at /results, without signing in.'
                                : 'The results are not publicly available. Only this portal can see them.'}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <StatusPill variant={isPublic ? 'success' : 'neutral'}>
                            {published ? 'Published' : 'Not published'}
                        </StatusPill>
                        <Button
                            variant={published ? 'destructive' : 'default'}
                            onClick={() => setConfirming(true)}
                            disabled={!published && !canPublish}
                            pending={pending}
                            pendingLabel="Updating…"
                        >
                            {published ? 'Unpublish results' : 'Publish results'}
                        </Button>
                    </div>
                </div>

                {error ? (
                    <Alert variant="danger" title="Could not change the publication status">
                        {error}
                    </Alert>
                ) : null}

                {withheldByState ? (
                    <Alert variant="warning" title="Not visible to the public">
                        The results are marked as published, but voting is not in an ended state,
                        so the public results page is refusing them. They will reappear when voting
                        has closed again.
                    </Alert>
                ) : null}

                {!published && !canPublish ? (
                    <Alert variant="info">
                        Results can be published once voting has ended. Close the poll or let the
                        published voting window elapse first.
                    </Alert>
                ) : null}

                <p className="text-sm leading-relaxed text-muted-foreground">
                    {published && publishedAt
                        ? `Released ${formatDateTimeLong(publishedAt)}. `
                        : null}
                    Publishing makes the constituency-by-constituency result readable by anyone,
                    with no sign-in, and is how the {ELECTORAL_COMMISSION} declares this election.
                    It publishes vote counts and shares only — never voter records, turnout or
                    reconciliation figures. Publishing and unpublishing are both recorded in the
                    audit log.
                </p>
            </CardContent>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={published ? 'Unpublish the results?' : 'Publish the results?'}
                description={
                    published
                        ? 'The public results page will stop showing the result immediately and will say the count is being reviewed.'
                        : 'The full constituency-by-constituency result becomes readable by anyone at /results, without signing in.'
                }
                warning={
                    published
                        ? 'Anyone who has already read or copied the result still has it. Withdrawing a declaration is recorded in the audit log.'
                        : 'Check the figures against the register first. This is the declaration, it takes effect at once for the whole country, and it is recorded in the audit log.'
                }
                confirmLabel={published ? 'Unpublish results' : 'Publish results'}
                tone={published ? 'destructive' : 'default'}
                pending={pending}
                onConfirm={confirmToggle}
            />
        </Card>
    )
}
