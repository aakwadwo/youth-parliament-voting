'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, LiveRegion } from '@/components/ui/alert'
import { Skeleton, EmptyState } from '@/components/ui/feedback'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { clearVoter } from '@/lib/voter-client'
import { getJson, postJson } from '@/lib/api-client'
import { ELECTION_GATE_CODES } from '@/lib/election-status'
import { cn } from '@/lib/utils'

/** The codes that mean "the poll is no longer open", whatever the wording. */
const ELECTION_CLOSED_CODES = new Set(Object.values(ELECTION_GATE_CODES))

/**
 * The ballot.
 *
 * A screen reader previously met a grid of plain buttons with no indication
 * that they were mutually exclusive, that one was chosen, or how many there
 * were. A ballot is precisely what the radio group pattern exists for, so this
 * is a real radiogroup with roving tabindex and arrow-key navigation.
 *
 * Only ever rendered once page.jsx has confirmed, server-side and per request,
 * that voting is open and that this browser holds a valid voter session. The
 * voter therefore arrives as a prop: this component no longer decides who you
 * are from sessionStorage, which the browser can edit. It still re-checks
 * nothing, because the APIs it calls enforce both rules again independently.
 */
export default function Ballot({ voter }) {
    const [candidates, setCandidates] = useState([])
    const [candidatesLoading, setCandidatesLoading] = useState(true)
    const [candidatesError, setCandidatesError] = useState('')
    const [selected, setSelected] = useState(null)
    const [step, setStep] = useState('select')
    const [submitting, setSubmitting] = useState(false)
    // Guards the irreversible action against a double tap; see handleSubmit.
    const inFlight = useRef(false)
    const [error, setError] = useState('')
    // Set when the poll closes underneath a voter who already had the ballot
    // open; carries the server's own wording for why.
    const [closedMessage, setClosedMessage] = useState('')

    const optionRefs = useRef(new Map())

    const loadCandidates = useCallback(async (constituencyId) => {
        setCandidatesLoading(true)
        setCandidatesError('')

        const result = await getJson(`/api/candidates?constituency_id=${constituencyId}`)

        if (result.aborted) return

        if (!result.ok) {
            // The poll can close while this page is open. That is not a load
            // failure to retry — it is a change of state, and the voter has to
            // be moved off the ballot rather than invited to try again.
            if (ELECTION_CLOSED_CODES.has(result.code)) {
                setClosedMessage(result.error)
                setStep('closed')
                setCandidatesLoading(false)
                return
            }
            // The server answered and the answer was a failure, so the voter is
            // told what the server said. Only a genuine unreachable-server
            // result mentions their connection.
            setCandidatesError(result.error)
            setCandidatesLoading(false)
            return
        }

        setCandidates(Array.isArray(result.data) ? result.data : [])
        setCandidatesLoading(false)
    }, [])

    useEffect(() => {
        // Called through an async wrapper rather than directly: on this pass
        // the loading flag is already `true`, so nothing here cascades into a
        // second render before paint.
        async function loadNow() {
            await loadCandidates(voter.constituencyId)
        }
        loadNow()
    }, [voter.constituencyId, loadCandidates])

    /** Arrow keys move between options and select, per the radio group pattern. */
    function handleKeyDown(event, index) {
        const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
        if (delta === undefined) return

        event.preventDefault()
        const next = (index + delta + candidates.length) % candidates.length
        const candidate = candidates[next]
        setSelected(candidate)
        optionRefs.current.get(candidate.id)?.focus()
    }

    async function handleSubmit() {
        // A ballot is irreversible, so a double tap must never reach the API
        // twice. cast_vote() is idempotent on has_voted, but the second request
        // would surface to the voter as "you have already voted" on the very
        // screen that just accepted their ballot.
        if (inFlight.current) return
        inFlight.current = true
        setSubmitting(true)
        setError('')

        const result = await postJson('/api/vote', { candidate_id: selected.id })

        inFlight.current = false
        setSubmitting(false)

        if (result.ok) {
            clearVoter()
            setStep('success')
            return
        }

        // The poll closed between opening the ballot and confirming it. Say so
        // in the server's words rather than leaving a "try again" button on a
        // screen where trying again cannot succeed.
        if (ELECTION_CLOSED_CODES.has(result.code)) {
            clearVoter()
            setClosedMessage(result.error)
            setStep('closed')
            return
        }

        if (result.status === 409 || result.status === 401) {
            // Either a ballot already exists for this voter, or the session
            // expired. Both mean the flow must not be re-enterable.
            clearVoter()
            setStep('already-voted')
            return
        }

        // Everything else stays on the confirmation screen with the reason,
        // because retrying is the right thing to do for a 500, a 429 or a
        // dropped connection — and only the last of those is about their
        // connection.
        setError(result.error)
    }

    // No session check here any more, and so no blank first paint waiting for
    // one: the route guard has already established who this voter is before
    // anything was sent to the browser.
    if (step === 'success') {
        return (
            <PageShell width="md" credit={false}>
                <PageHeading
                    title="Your vote has been recorded"
                    description={`Thank you${voter.fullName ? `, ${voter.fullName}` : ''}. Your ballot in ${voter.constituencyName} has been counted.`}
                />
                <p className="mt-4 leading-relaxed text-muted-foreground">
                    Nothing links your ballot to you, so it cannot be traced, changed or
                    withdrawn. Results are published once voting closes nationwide.
                </p>
                <Button asChild variant="outline" size="lg" className="mt-8 w-full sm:w-auto">
                    <Link href="/">Back to home</Link>
                </Button>
            </PageShell>
        )
    }

    // The poll closed while this voter had the ballot open. No ballot was
    // recorded, and saying so plainly matters: a voter who is simply told
    // "voting has ended" will otherwise not know whether their selection
    // counted.
    if (step === 'closed') {
        return (
            <PageShell width="sm" credit={false}>
                <PageHeading
                    title="Voting is no longer open"
                    description={closedMessage || 'Voting is not currently open.'}
                />
                <p className="mt-4 leading-relaxed text-muted-foreground">
                    No ballot was recorded for you. If you believe the poll should still be open,
                    contact the Electoral Commission.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button asChild size="lg" className="sm:w-auto">
                        <Link href="/">Return home</Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="sm:w-auto">
                        <Link href="/election">View election details</Link>
                    </Button>
                </div>
            </PageShell>
        )
    }

    if (step === 'already-voted') {
        return (
            <PageShell width="sm" credit={false}>
                <PageHeading
                    title="You have already voted"
                    description="A ballot has already been recorded for this registration, so you cannot vote again."
                />
                <Button asChild variant="outline" size="lg" className="mt-8 w-full sm:w-auto">
                    <Link href="/">Back to home</Link>
                </Button>
            </PageShell>
        )
    }

    if (step === 'confirm') {
        return (
            <PageShell width="md" credit={false}>
                <PageHeading
                    title="Check your ballot"
                    description="Once you submit, this cannot be changed."
                />

                <Card className="mt-6">
                    <CardContent className="space-y-5">
                        <dl className="divide-y divide-border">
                            <div className="flex items-baseline justify-between gap-4 pb-3">
                                <dt className="text-sm text-muted-foreground">Constituency</dt>
                                <dd className="text-right font-medium">
                                    {voter.constituencyName}
                                </dd>
                            </div>
                            <div className="flex items-baseline justify-between gap-4 pt-3">
                                <dt className="text-sm text-muted-foreground">Your candidate</dt>
                                <dd className="text-right text-lg font-semibold">
                                    {selected?.full_name}
                                </dd>
                            </div>
                        </dl>

                        {error ? (
                            <Alert variant="danger" title="Could not record your vote">
                                {error}
                            </Alert>
                        ) : null}

                        <div className="flex flex-col-reverse gap-3 sm:flex-row">
                            <Button
                                variant="outline"
                                size="xl"
                                className="sm:flex-1"
                                onClick={() => {
                                    setStep('select')
                                    setError('')
                                }}
                                disabled={submitting}
                            >
                                Change my choice
                            </Button>
                            <Button
                                size="xl"
                                className="sm:flex-1"
                                onClick={handleSubmit}
                                pending={submitting}
                                pendingLabel="Submitting Vote…"
                            >
                                Submit my vote
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <LiveRegion message={submitting ? 'Submitting your vote' : ''} assertive />
            </PageShell>
        )
    }

    return (
        <PageShell width="lg" credit={false}>
            <PageHeading
                title="Choose your candidate"
                description={`Select one candidate standing in ${voter.constituencyName}. Nobody, including election staff, can see who you choose.`}
            />

            {candidatesError ? (
                <Alert variant="danger" title="Could not load candidates" className="mt-6">
                    <p>{candidatesError}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => loadCandidates(voter.constituencyId)}
                    >
                        Try again
                    </Button>
                </Alert>
            ) : null}

            {candidatesLoading ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-64 rounded-xl" />
                    ))}
                </div>
            ) : null}

            {!candidatesLoading && !candidatesError && candidates.length === 0 ? (
                <div className="mt-6 rounded-xl border border-border bg-card">
                    <EmptyState
                        title="No candidates yet"
                        description={`No candidates have been confirmed for ${voter.constituencyName}. Check back once nominations close.`}
                        action={
                            <Button asChild variant="outline">
                                <Link href="/">Back to home</Link>
                            </Button>
                        }
                    />
                </div>
            ) : null}

            {!candidatesLoading && candidates.length > 0 ? (
                <>
                    <div
                        role="radiogroup"
                        aria-label={`Candidates for ${voter.constituencyName}`}
                        className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    >
                        {candidates.map((candidate, index) => {
                            const isSelected = selected?.id === candidate.id
                            return (
                                <button
                                    key={candidate.id}
                                    ref={(node) => {
                                        if (node) optionRefs.current.set(candidate.id, node)
                                        else optionRefs.current.delete(candidate.id)
                                    }}
                                    role="radio"
                                    aria-checked={isSelected}
                                    // Roving tabindex: one tab stop for the whole
                                    // group, as the radio pattern requires.
                                    tabIndex={isSelected || (!selected && index === 0) ? 0 : -1}
                                    onKeyDown={(e) => handleKeyDown(e, index)}
                                    onClick={() => setSelected(candidate)}
                                    className={cn(
                                        'flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors',
                                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                        isSelected
                                            ? 'border-primary ring-1 ring-primary'
                                            : 'border-border hover:border-border-strong'
                                    )}
                                >
                                    <div className="relative aspect-4/3 w-full overflow-hidden bg-muted sm:aspect-3/4">
                                        {candidate.photo_url ? (
                                            <Image
                                                src={candidate.photo_url}
                                                alt=""
                                                fill
                                                sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
                                                className="object-cover"
                                            />
                                        ) : (
                                            <span
                                                aria-hidden="true"
                                                className="flex size-full items-center justify-center text-3xl font-semibold text-muted-foreground/40"
                                            >
                                                {candidate.full_name
                                                    .split(' ')
                                                    .slice(0, 2)
                                                    .map((w) => w[0])
                                                    .join('')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-1 items-center justify-between gap-3 p-4">
                                        <span className="font-medium">{candidate.full_name}</span>
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                'flex size-5 shrink-0 items-center justify-center rounded-full border',
                                                isSelected
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-input'
                                            )}
                                        >
                                            {isSelected ? <Check className="size-3" /> : null}
                                        </span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {/* A plain bar rather than a translucent blurred one. The
                        content behind it is a ballot, and showing it smeared
                        through a frosted panel is decoration on the one screen
                        that should be unambiguous. */}
                    <div className="sticky bottom-0 mt-8 -mx-5 border-t border-border bg-background px-5 py-4 sm:-mx-6 sm:px-6">
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground" aria-live="polite">
                                {selected
                                    ? `Selected: ${selected.full_name}`
                                    : 'Select a candidate to continue'}
                            </p>
                            <Button
                                size="xl"
                                className="w-full sm:w-auto"
                                disabled={!selected}
                                onClick={() => setStep('confirm')}
                            >
                                Continue
                            </Button>
                        </div>
                    </div>
                </>
            ) : null}
        </PageShell>
    )
}
