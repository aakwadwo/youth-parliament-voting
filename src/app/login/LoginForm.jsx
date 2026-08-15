'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Alert, LiveRegion } from '@/components/ui/alert'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { VotingNotOpen } from '@/components/VotingNotOpen'
import { clearVoter } from '@/lib/voter-client'
import { postJson } from '@/lib/api-client'
import { ELECTION_GATE_CODES, ELECTION_STATUS } from '@/lib/election-status'
import { isValidGhanaPhone, normalisePhone, composeDateString } from '@/lib/validation'

/**
 * Month names, not numbers.
 *
 * The whole failure this control replaces is two digits whose meaning depends
 * on a device setting the voter has never seen. "March" cannot be read as a day.
 */
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

/** The codes that mean "the poll is not open", whatever the wording. */
const ELECTION_CLOSED_CODES = new Set(Object.values(ELECTION_GATE_CODES))

/**
 * The sign-in form.
 *
 * Rendered only when the route guard in page.jsx has established that voting is
 * open. The `electionClosed` branch below therefore no longer exists to catch
 * a voter arriving after the poll shut — the guard turns those away before this
 * component is sent — but to catch the poll closing in the seconds between this
 * page loading and the voter pressing Sign in. That race is real on a deadline
 * and the API is the authority on it, so its refusal is still rendered here.
 */
export default function LoginForm() {
    const router = useRouter()
    const [form, setForm] = useState({
        voter_phone: '',
        dob_day: '',
        dob_month: '',
        dob_year: '',
    })
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
        // The three date parts share one error, so editing any of them clears it.
        if (key.startsWith('dob_') && errors.voter_dob) {
            setErrors((prev) => ({ ...prev, voter_dob: null }))
        }
    }

    async function handleSubmit(event) {
        event.preventDefault()

        // Two fast taps would otherwise fire this twice before the button
        // re-renders as disabled.
        if (inFlight.current) return

        // Built from three labelled parts rather than read from one control
        // whose digit order depends on the device's locale. '' means the parts
        // do not describe a real date.
        const voterDob = composeDateString(form.dob_year, form.dob_month, form.dob_day)

        const nextErrors = {}
        if (!isValidGhanaPhone(form.voter_phone)) {
            nextErrors.voter_phone = 'Enter the mobile number you registered with.'
        }
        if (!voterDob) {
            nextErrors.voter_dob = 'Enter the day, month and year you were born.'
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
            voter_dob: voterDob,
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

                        {/*
                            Three labelled parts, not one native date control.

                            A native date input renders in the BROWSER's locale,
                            which the site does not choose and cannot read. The
                            same control is DD/MM/YYYY on a phone set to en-GB
                            and MM/DD/YYYY on one set to en-US, so a voter born
                            on 31 March who types 31 then 03 into a month-first
                            device has the 31 clamped to 12 by the segmented
                            editor and submits 3 December — silently, with no
                            error, and is then told their registration does not
                            exist.

                            Day, month and year are asked for separately so
                            there is no order to misread, and the month is
                            chosen by NAME so it cannot be confused with a day
                            at all. Eligibility is not re-checked here: age is
                            settled at registration.
                        */}
                        <fieldset
                            aria-describedby="voter_dob-hint"
                            aria-invalid={errors.voter_dob ? true : undefined}
                        >
                            <legend className="text-sm font-medium text-foreground">
                                Date of birth <span className="text-destructive" aria-hidden="true">*</span>
                            </legend>
                            <p
                                id="voter_dob-hint"
                                className="mt-2 text-xs leading-relaxed text-muted-foreground"
                            >
                                The date you registered with. Choose the month by name.
                            </p>

                            <div className="mt-2 grid grid-cols-[5rem_1fr_6rem] gap-2">
                                <div>
                                    <Label htmlFor="voter_dob" className="text-xs font-normal text-muted-foreground">
                                        Day
                                    </Label>
                                    <Input
                                        // Carries the `voter_dob` id so the
                                        // shared focus-the-first-error logic
                                        // lands on the start of this group.
                                        id="voter_dob"
                                        name="dob_day"
                                        inputMode="numeric"
                                        autoComplete="bday-day"
                                        maxLength={2}
                                        placeholder="31"
                                        className="mt-1"
                                        value={form.dob_day}
                                        onChange={(e) =>
                                            update('dob_day', e.target.value.replace(/\D/g, ''))
                                        }
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="dob_month" className="text-xs font-normal text-muted-foreground">
                                        Month
                                    </Label>
                                    <select
                                        id="dob_month"
                                        name="dob_month"
                                        autoComplete="bday-month"
                                        className="mt-1 h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-[color,border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:text-sm"
                                        value={form.dob_month}
                                        onChange={(e) => update('dob_month', e.target.value)}
                                    >
                                        <option value="">Select</option>
                                        {MONTHS.map((name, i) => (
                                            <option key={name} value={String(i + 1)}>
                                                {name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <Label htmlFor="dob_year" className="text-xs font-normal text-muted-foreground">
                                        Year
                                    </Label>
                                    <Input
                                        id="dob_year"
                                        name="dob_year"
                                        inputMode="numeric"
                                        autoComplete="bday-year"
                                        enterKeyHint="go"
                                        maxLength={4}
                                        placeholder="2000"
                                        className="mt-1"
                                        value={form.dob_year}
                                        onChange={(e) =>
                                            update('dob_year', e.target.value.replace(/\D/g, ''))
                                        }
                                    />
                                </div>
                            </div>

                            {errors.voter_dob ? (
                                <p className="mt-2 text-sm font-medium text-destructive">
                                    {errors.voter_dob}
                                </p>
                            ) : null}
                        </fieldset>

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
