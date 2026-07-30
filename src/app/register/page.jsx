'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Alert, LiveRegion } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/feedback'
import { ConstituencyCombobox } from '@/components/ConstituencyCombobox'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { storeVoter } from '@/lib/voter-client'
import {
    isValidName,
    isValidGhanaPhone,
    checkAgeEligibility,
    normalisePhone,
    dobBounds,
    MIN_AGE,
    MAX_AGE,
} from '@/lib/validation'

/**
 * Per-field rules, sharing the exact functions the API uses so the form can
 * never accept something the server will reject with different wording.
 */
const VALIDATORS = {
    full_name: (v) =>
        !v.trim()
            ? 'Enter your full name.'
            : !isValidName(v)
              ? 'Use letters, spaces, hyphens and apostrophes only.'
              : null,
    voter_dob: (v) => (!v ? 'Enter your date of birth.' : (checkAgeEligibility(v).message ?? null)),
    voter_phone: (v) =>
        !v.trim()
            ? 'Enter your phone number.'
            : !isValidGhanaPhone(v)
              ? 'Enter a Ghana mobile number, for example 024 123 4567.'
              : null,
    constituency_id: (v) => (!v ? 'Select your constituency.' : null),
}

const FIELD_ORDER = ['full_name', 'voter_dob', 'voter_phone', 'constituency_id']

export default function RegisterPage() {
    const router = useRouter()

    const [form, setForm] = useState({
        full_name: '',
        voter_dob: '',
        voter_phone: '',
        constituency_id: '',
        constituency_name: '',
    })
    const [errors, setErrors] = useState({})
    // A field only shows its error once the voter has left it, so the form does
    // not object while someone is still typing their own name.
    const [touched, setTouched] = useState({})
    const [constituencies, setConstituencies] = useState([])
    const [constituenciesLoading, setConstituenciesLoading] = useState(true)
    const [constituenciesError, setConstituenciesError] = useState('')
    const [submitError, setSubmitError] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [registered, setRegistered] = useState(null)

    const bounds = dobBounds()

    const loadConstituencies = useCallback(async () => {
        setConstituenciesLoading(true)
        setConstituenciesError('')
        try {
            const res = await fetch('/api/constituencies')
            if (!res.ok) throw new Error('failed')
            setConstituencies(await res.json())
        } catch {
            setConstituenciesError(
                'We could not load the list of constituencies. Check your connection and try again.'
            )
        } finally {
            setConstituenciesLoading(false)
        }
    }, [])

    useEffect(() => {
        loadConstituencies()
    }, [loadConstituencies])

    function update(key, value) {
        setForm((prev) => ({ ...prev, [key]: value }))
        // Clear an error as soon as the voter fixes it, rather than making them
        // submit again to find out.
        if (errors[key]) {
            setErrors((prev) => ({ ...prev, [key]: (VALIDATORS[key]?.(value) ?? null) }))
        }
    }

    function handleBlur(key) {
        setTouched((prev) => ({ ...prev, [key]: true }))
        setErrors((prev) => ({ ...prev, [key]: (VALIDATORS[key]?.(form[key]) ?? null) }))
    }

    async function handleSubmit(event) {
        event.preventDefault()

        const nextErrors = {}
        for (const key of FIELD_ORDER) {
            const message = VALIDATORS[key](form[key])
            if (message) nextErrors[key] = message
        }

        setErrors(nextErrors)
        setTouched(Object.fromEntries(FIELD_ORDER.map((k) => [k, true])))

        const firstInvalid = FIELD_ORDER.find((k) => nextErrors[k])
        if (firstInvalid) {
            // Move focus to the first problem so a keyboard or screen-reader
            // user is not left guessing which field failed.
            document.getElementById(firstInvalid)?.focus()
            return
        }

        setSubmitting(true)
        setSubmitError('')

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: form.full_name,
                    voter_dob: form.voter_dob,
                    voter_phone: normalisePhone(form.voter_phone),
                    constituency_id: form.constituency_id,
                }),
            })
            const data = await res.json()

            if (!res.ok) {
                setSubmitError(data.error ?? 'We could not complete your registration.')
                return
            }

            storeVoter(data.voter)
            setRegistered(data.voter)
        } catch {
            setSubmitError('We could not reach the server. Check your connection and try again.')
        } finally {
            setSubmitting(false)
        }
    }

    if (registered) {
        return (
            <PageShell width="md">
                <PageHeading
                    title="You are registered"
                    description={`${registered.full_name}, you are registered to vote in ${registered.constituency_name}.`}
                />

                <div className="mt-8 rounded-xl border border-border bg-surface p-4 sm:p-5">
                    <h2 className="font-semibold">What happens on the ballot</h2>
                    <ol className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                        <li>1. You see every candidate standing in your constituency.</li>
                        <li>2. You select one, then review your choice.</li>
                        <li>3. Once you submit, your ballot cannot be changed.</li>
                    </ol>
                </div>

                <Button
                    size="xl"
                    className="mt-6 w-full sm:w-auto"
                    onClick={() => router.push('/vote/candidates')}
                >
                    Continue to your ballot
                </Button>
            </PageShell>
        )
    }

    return (
        <PageShell width="md">
            <PageHeading
                title="Register to vote"
                description={`Open to Ghanaians aged ${MIN_AGE} to ${MAX_AGE}.`}
            />

            {constituenciesError ? (
                <Alert variant="danger" title="Could not load constituencies" className="mt-6">
                    <p>{constituenciesError}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={loadConstituencies}
                    >
                        Try again
                    </Button>
                </Alert>
            ) : null}

            <Card className="mt-6">
                <CardContent>
                    {/* A real form element: submits on Enter from any field, and
                        lets mobile keyboards show a "Go" key. */}
                    <form onSubmit={handleSubmit} noValidate className="space-y-5">
                        <Field
                            id="full_name"
                            label="Full name"
                            hint="As it appears on your Ghana Card or passport."
                            required
                            error={touched.full_name ? errors.full_name : null}
                        >
                            <Input
                                name="full_name"
                                placeholder="Kwame Mensah"
                                autoComplete="name"
                                autoCapitalize="words"
                                enterKeyHint="next"
                                value={form.full_name}
                                onChange={(e) => update('full_name', e.target.value)}
                                onBlur={() => handleBlur('full_name')}
                            />
                        </Field>

                        <Field
                            id="voter_dob"
                            label="Date of birth"
                            // The native control shows its own format hint, but
                            // only once it has focus on some phones, so the
                            // order is stated in the open. Ghana writes dates
                            // day-first.
                            hint="Day / month / year — for example 14/03/2004."
                            required
                            error={touched.voter_dob ? errors.voter_dob : null}
                        >
                            <Input
                                type="date"
                                name="voter_dob"
                                autoComplete="bday"
                                // Bounds the native picker to eligible years, so
                                // an ineligible date cannot be chosen at all.
                                min={bounds.min}
                                max={bounds.max}
                                value={form.voter_dob}
                                onChange={(e) => update('voter_dob', e.target.value)}
                                onBlur={() => handleBlur('voter_dob')}
                            />
                        </Field>

                        <Field
                            id="voter_phone"
                            label="Mobile number"
                            hint="You will use this to sign in again."
                            required
                            error={touched.voter_phone ? errors.voter_phone : null}
                        >
                            <Input
                                // type="tel" plus inputMode brings up the phone
                                // keypad rather than the alphabetic keyboard.
                                type="tel"
                                name="voter_phone"
                                inputMode="numeric"
                                autoComplete="tel-national"
                                enterKeyHint="next"
                                maxLength={13}
                                placeholder="024 123 4567"
                                value={form.voter_phone}
                                onChange={(e) => update('voter_phone', e.target.value)}
                                onBlur={() => handleBlur('voter_phone')}
                            />
                        </Field>

                        <Field
                            id="constituency_id"
                            label="Constituency"
                            hint="Where you are registered to vote."
                            required
                            error={touched.constituency_id ? errors.constituency_id : null}
                        >
                            {(controlProps) => (
                                <ConstituencyCombobox
                                    {...controlProps}
                                    constituencies={constituencies}
                                    loading={constituenciesLoading}
                                    value={form.constituency_id}
                                    onChange={(c) => {
                                        setForm((prev) => ({
                                            ...prev,
                                            constituency_id: c.id,
                                            constituency_name: c.name,
                                        }))
                                        setErrors((prev) => ({ ...prev, constituency_id: null }))
                                    }}
                                />
                            )}
                        </Field>

                        {submitError ? (
                            <Alert variant="danger" title="Registration failed">
                                {submitError}
                            </Alert>
                        ) : null}

                        <div className="space-y-3 pt-1">
                            <Button type="submit" size="xl" className="w-full" disabled={submitting}>
                                {submitting ? <Spinner /> : null}
                                {submitting ? 'Registering…' : 'Register to vote'}
                            </Button>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                By registering you confirm that you are a Ghanaian citizen aged{' '}
                                {MIN_AGE} to {MAX_AGE} and that these are your own details. Your
                                details are never stored against the candidate you choose. See the{' '}
                                <Link
                                    href="/privacy"
                                    className="underline underline-offset-4 hover:text-foreground"
                                >
                                    privacy notice
                                </Link>
                                .
                            </p>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <p className="mt-6 text-sm text-muted-foreground">
                Already registered?{' '}
                <Link
                    href="/login"
                    className="font-medium text-primary underline underline-offset-4"
                >
                    Sign in to vote
                </Link>
            </p>

            <LiveRegion message={submitting ? 'Submitting your registration' : ''} />
        </PageShell>
    )
}
