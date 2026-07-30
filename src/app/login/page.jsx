'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Alert, LiveRegion } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/feedback'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { storeVoter, clearVoter } from '@/lib/voter-client'
import { isValidGhanaPhone, isValidDateString, normalisePhone } from '@/lib/validation'

export default function LoginPage() {
    const router = useRouter()
    const [form, setForm] = useState({ voter_phone: '', voter_dob: '' })
    const [errors, setErrors] = useState({})
    const [submitError, setSubmitError] = useState('')
    const [loading, setLoading] = useState(false)
    const [alreadyVoted, setAlreadyVoted] = useState(null)

    function update(key, value) {
        setForm((prev) => ({ ...prev, [key]: value }))
        if (errors[key]) setErrors((prev) => ({ ...prev, [key]: null }))
    }

    async function handleSubmit(event) {
        event.preventDefault()

        const nextErrors = {}
        if (!isValidGhanaPhone(form.voter_phone)) {
            nextErrors.voter_phone = 'Enter the mobile number you registered with.'
        }
        if (!isValidDateString(form.voter_dob)) {
            nextErrors.voter_dob = 'Enter your date of birth.'
        }

        setErrors(nextErrors)
        const firstInvalid = ['voter_phone', 'voter_dob'].find((k) => nextErrors[k])
        if (firstInvalid) {
            document.getElementById(firstInvalid)?.focus()
            return
        }

        setLoading(true)
        setSubmitError('')

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    voter_phone: normalisePhone(form.voter_phone),
                    voter_dob: form.voter_dob,
                }),
            })
            const data = await res.json()

            if (!res.ok) {
                setSubmitError(data.error ?? 'We could not sign you in.')
                return
            }

            if (data.already_voted) {
                clearVoter()
                setAlreadyVoted(data.voter)
                return
            }

            storeVoter(data.voter)
            router.push('/vote/candidates')
        } catch {
            setSubmitError('We could not reach the server. Check your connection and try again.')
        } finally {
            setLoading(false)
        }
    }

    if (alreadyVoted) {
        return (
            <PageShell width="sm">
                <PageHeading
                    title="You have already voted"
                    description={`${alreadyVoted.full_name}, your ballot has been recorded.`}
                />
                <p className="mt-4 leading-relaxed text-muted-foreground">
                    We can confirm that you voted, but not who you voted for. No record anywhere
                    links a ballot back to the person who cast it.
                </p>
                <Button asChild variant="outline" size="lg" className="mt-8 w-full sm:w-auto">
                    <Link href="/">Back to home</Link>
                </Button>
            </PageShell>
        )
    }

    return (
        <PageShell width="sm">
            <PageHeading
                title="Sign in to vote"
                description="Use the mobile number and date of birth you registered with."
            />

            <Card className="mt-6">
                <CardContent>
                    <form onSubmit={handleSubmit} noValidate className="space-y-5">
                        <Field
                            id="voter_phone"
                            label="Mobile number"
                            required
                            error={errors.voter_phone}
                        >
                            <Input
                                type="tel"
                                name="voter_phone"
                                inputMode="numeric"
                                autoComplete="tel-national"
                                enterKeyHint="next"
                                maxLength={13}
                                placeholder="024 123 4567"
                                value={form.voter_phone}
                                onChange={(e) => update('voter_phone', e.target.value)}
                            />
                        </Field>

                        <Field
                            id="voter_dob"
                            label="Date of birth"
                            required
                            error={errors.voter_dob}
                        >
                            <Input
                                type="date"
                                name="voter_dob"
                                autoComplete="bday"
                                enterKeyHint="go"
                                value={form.voter_dob}
                                onChange={(e) => update('voter_dob', e.target.value)}
                            />
                        </Field>

                        {submitError ? (
                            <Alert variant="danger" title="Could not sign you in">
                                {submitError}
                            </Alert>
                        ) : null}

                        <Button type="submit" size="xl" className="w-full" disabled={loading}>
                            {loading ? <Spinner /> : null}
                            {loading ? 'Signing in…' : 'Sign in'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <p className="mt-6 text-sm text-muted-foreground">
                Not registered yet?{' '}
                <Link
                    href="/register"
                    className="font-medium text-primary underline underline-offset-4"
                >
                    Register to vote
                </Link>
            </p>

            <LiveRegion message={loading ? 'Signing in' : ''} />
        </PageShell>
    )
}
