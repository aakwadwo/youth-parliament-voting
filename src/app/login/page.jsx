'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Alert, LiveRegion } from '@/components/ui/alert'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { VotingNotOpen } from '@/components/VotingNotOpen'
import { clearVoter } from '@/lib/voter-client'
import { postJson } from '@/lib/api-client'
import { ELECTION_GATE_CODES, ELECTION_STATUS } from '@/lib/election-status'
import { isValidGhanaPhone, isValidDateString, normalisePhone, dobBounds } from '@/lib/validation'

/** The codes that mean "the poll is not open", whatever the wording. */
const ELECTION_CLOSED_CODES = new Set(Object.values(ELECTION_GATE_CODES))

export default function LoginPage() {
    const router = useRouter()
    const bounds = dobBounds()
    const [form, setForm] = useState({ voter_phone: '', voter_dob: '' })
    const [errors, setErrors] = useState({})
    const [submitError, setSubmitError] = useState('')
    const [loading, setLoading] = useState(false)
    // See handleSubmit: guards the gap before the disabled state renders.
    const inFlight = useRef(false)
    const [alreadyVoted, setAlreadyVoted] = useState(null)
    // Holds the election state when sign-in was refused because the poll is not
    // open. Distinct from `submitError`, which is for sign-ins that actually
    // failed.
    const [electionClosed, setElectionClosed] = useState(undefined)

    function update(key, value) {
        setForm((prev) => ({ ...prev, [key]: value }))
        if (errors[key]) setErrors((prev) => ({ ...prev, [key]: null }))
    }

    async function handleSubmit(event) {
        event.preventDefault()

        // Two fast taps would otherwise fire this twice before the button
        // re-renders as disabled.
        if (inFlight.current) return

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

        inFlight.current = true
        setLoading(true)
        setSubmitError('')

        const result = await postJson('/api/login', {
            voter_phone: normalisePhone(form.voter_phone),
            voter_dob: form.voter_dob,
        })

        inFlight.current = false
        setLoading(false)

        if (!result.ok) {
            // Signing in outside the voting window is not a failed sign-in and
            // must not be reported as one — the credentials were never even
            // checked. It gets the election's own screen instead of a red
            // "could not sign you in" box above a form the voter will retype.
            if (ELECTION_CLOSED_CODES.has(result.code)) {
                setElectionClosed(result.data?.election ?? null)
                return
            }
            setSubmitError(result.error)
            return
        }

        if (result.data.already_voted) {
            clearVoter()
            setAlreadyVoted(result.data.voter)
            return
        }

        // The session cookie the API just set is the only thing the ballot
        // needs; it reads the voter's details from it server-side.
        clearVoter()
        router.push('/vote/candidates')
    }

    if (electionClosed !== undefined) {
        return (
            <VotingNotOpen election={electionClosed}>
                {electionClosed?.status === ELECTION_STATUS.ENDED
                    ? 'Sign-in is closed for this election. If you voted, your ballot has been counted.'
                    : 'You will be able to sign in and vote once the poll opens. If you have already registered, there is nothing else to do now.'}
            </VotingNotOpen>
        )
    }

    if (alreadyVoted) {
        return (
            <PageShell width="sm" credit={false}>
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
        <PageShell width="sm" credit={false}>
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
                            hint="Day / month / year — for example 14/03/2004."
                            required
                            error={errors.voter_dob}
                        >
                            <Input
                                type="date"
                                name="voter_dob"
                                autoComplete="bday"
                                enterKeyHint="go"
                                // Same eligibility bounds the registration form
                                // applies, so the picker cannot offer a date
                                // that could never have registered.
                                min={bounds.min}
                                max={bounds.max}
                                value={form.voter_dob}
                                onChange={(e) => update('voter_dob', e.target.value)}
                            />
                        </Field>

                        {submitError ? (
                            <Alert variant="danger" title="Could not sign you in">
                                {submitError}
                            </Alert>
                        ) : null}

                        <Button
                            type="submit"
                            size="xl"
                            className="w-full"
                            pending={loading}
                            pendingLabel="Signing in…"
                        >
                            Sign in
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
