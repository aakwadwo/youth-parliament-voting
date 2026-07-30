'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, LiveRegion } from '@/components/ui/alert'
import { Skeleton, EmptyState, Spinner } from '@/components/ui/feedback'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { readVoter, clearVoter } from '@/lib/voter-client'
import { cn } from '@/lib/utils'

/**
 * The ballot.
 *
 * A screen reader previously met a grid of plain buttons with no indication
 * that they were mutually exclusive, that one was chosen, or how many there
 * were. A ballot is precisely what the radio group pattern exists for, so this
 * is a real radiogroup with roving tabindex and arrow-key navigation.
 */
export default function BallotPage() {
    const router = useRouter()

    const [voter, setVoter] = useState(null)
    const [checkedSession, setCheckedSession] = useState(false)
    const [candidates, setCandidates] = useState([])
    const [candidatesLoading, setCandidatesLoading] = useState(true)
    const [candidatesError, setCandidatesError] = useState('')
    const [selected, setSelected] = useState(null)
    const [step, setStep] = useState('select')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    const optionRefs = useRef(new Map())

    useEffect(() => {
        const saved = readVoter()
        if (!saved) {
            router.replace('/login')
            return
        }
        setVoter(saved)
        setCheckedSession(true)
    }, [router])

    const loadCandidates = useCallback(async (constituencyId) => {
        setCandidatesLoading(true)
        setCandidatesError('')
        try {
            const res = await fetch(`/api/candidates?constituency_id=${constituencyId}`)
            if (!res.ok) throw new Error('failed')
            setCandidates(await res.json())
        } catch {
            setCandidatesError('We could not load the candidates for your constituency.')
        } finally {
            setCandidatesLoading(false)
        }
    }, [])

    useEffect(() => {
        if (voter?.constituencyId) loadCandidates(voter.constituencyId)
    }, [voter?.constituencyId, loadCandidates])

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
        setSubmitting(true)
        setError('')
        try {
            const res = await fetch('/api/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidate_id: selected.id }),
            })
            const data = await res.json()

            if (res.ok) {
                clearVoter()
                setStep('success')
                return
            }

            if (res.status === 409 || res.status === 401) {
                // Either a ballot already exists for this voter, or the session
                // expired. Both mean the flow must not be re-enterable.
                clearVoter()
                setStep('already-voted')
                return
            }

            setError(data.error ?? 'We could not record your vote.')
        } catch {
            setError('We could not reach the server. Check your connection and try again.')
        } finally {
            setSubmitting(false)
        }
    }

    // Nothing renders until the session check has run, so the ballot never
    // flashes into view for someone about to be redirected away.
    if (!checkedSession || !voter) return null

    if (step === 'success') {
        return (
            <PageShell width="md">
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

    if (step === 'already-voted') {
        return (
            <PageShell width="sm">
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
            <PageShell width="md">
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
                                disabled={submitting}
                            >
                                {submitting ? <Spinner /> : null}
                                {submitting ? 'Submitting…' : 'Submit my vote'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <LiveRegion message={submitting ? 'Submitting your vote' : ''} assertive />
            </PageShell>
        )
    }

    return (
        <PageShell width="lg">
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
                    <div className="sticky bottom-0 mt-8 -mx-4 border-t border-border bg-background px-4 py-4 sm:-mx-6 sm:px-6">
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
