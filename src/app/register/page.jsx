'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Alert, LiveRegion } from '@/components/ui/alert'
import { ConstituencyCombobox } from '@/components/ConstituencyCombobox'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { clearVoter } from '@/lib/voter-client'
import { getJson, postJson } from '@/lib/api-client'
import {
    ELECTION_STATUS,
    isVotingOpen,
    formatDateLong,
    formatDateTimeLong,
} from '@/lib/election-status'
import { ELECTORAL_COMMISSION } from '@/lib/election'
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
    // Guards the window between the first click and the re-render that disables
    // the button; see handleSubmit.
    const inFlight = useRef(false)
    const [registered, setRegistered] = useState(null)

    const bounds = dobBounds()

    const loadConstituencies = useCallback(async () => {
        setConstituenciesLoading(true)
        setConstituenciesError('')

        const result = await getJson('/api/constituencies')

        if (result.aborted) return

        if (!result.ok) {
            // Only a genuine unreachable server tells the voter to check their
            // connection; a 500 here is ours, and saying otherwise sends them
            // to restart a router that was working.
            setConstituenciesError(result.error)
            setConstituenciesLoading(false)
            return
        }

        setConstituencies(Array.isArray(result.data) ? result.data : [])
        setConstituenciesLoading(false)
    }, [])

    useEffect(() => {
        // Called through an async wrapper rather than directly. The only state
        // this touches before its first await is the loading flag, which on
        // mount is already `true` — so there is no render to cascade into, and
        // this is the shape react-hooks/set-state-in-effect accepts for
        // fetch-on-mount.
        async function loadNow() {
            await loadConstituencies()
        }
        loadNow()
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

        // A disabled button stops the second click, but only once React has
        // re-rendered. Two taps inside that window would otherwise fire this
        // handler twice and race two registrations for the same phone number.
        if (inFlight.current) return

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

        inFlight.current = true
        setSubmitting(true)
        setSubmitError('')

        const result = await postJson('/api/register', {
            full_name: form.full_name,
            voter_dob: form.voter_dob,
            voter_phone: normalisePhone(form.voter_phone),
            constituency_id: form.constituency_id,
        })

        inFlight.current = false
        setSubmitting(false)

        if (!result.ok) {
            // `result.error` is the server's own sentence where it gave one and
            // a status-appropriate sentence where it did not. Neither can be a
            // connection message unless the request genuinely never landed.
            setSubmitError(result.error)
            return
        }

        // The election state travelled back with the registration, so the
        // confirmation screen renders from the same read the server made rather
        // than a second request that could disagree with it.
        const election = result.data.election ?? null

        // Nothing about this voter is kept in browser storage: the ballot reads
        // them from the session cookie server-side. This only clears anything
        // an earlier deployment left behind.
        clearVoter()

        setRegistered({ voter: result.data.voter, election })
    }

    if (registered) {
        return <RegistrationComplete {...registered} onContinue={() => router.push('/vote/candidates')} />
    }

    return (
        <PageShell width="md" credit={false}>
            <PageHeading
                title="Register to vote"
                description={`Open to Ghanaians aged ${MIN_AGE} to ${MAX_AGE}.`}
            />

            {/* Guidance, not a rule, and deliberately vague about the controls
                behind it. Sharing a device is expected and supported — many
                voters will register from a friend's phone or a school computer —
                so this asks for orderly use rather than warning anyone off, and
                it answers the question a shared-device voter actually has next:
                whether they will need that same phone again on polling day. */}
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Where possible, complete one voter registration per device. Once registered, you can
                sign in and vote from any device.
            </p>

            {constituenciesError ? (
                <Alert variant="danger" title="Could not load constituencies" className="mt-6">
                    <p>{constituenciesError}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={loadConstituencies}
                        pending={constituenciesLoading}
                        pendingLabel="Trying again…"
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
                            <Button
                                type="submit"
                                size="xl"
                                className="w-full"
                                pending={submitting}
                                pendingLabel="Registering…"
                            >
                                Register to vote
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

            {/* No sign-in link here.
                Sign-in is gated on the election being open, so outside the
                voting window this was a prominent invitation into a flow that
                answers with a refusal screen — the registration page urging
                voters towards the one door the platform holds shut. Someone who
                is already registered and arrives while the poll is open still
                reaches sign-in from the landing page and from the election
                details page, both of which only offer it when it leads
                somewhere. */}

            <LiveRegion message={submitting ? 'Submitting your registration' : ''} />
        </PageShell>
    )
}

/**
 * What a voter is told once they are on the register.
 *
 * This screen used to assume one thing: that registering is immediately
 * followed by voting. That is only true while the poll is open. Registering a
 * fortnight early ended with a "Continue to your ballot" button that led to a
 * ballot which could not be submitted, and registering after the close led to
 * the same dead end. The registration is complete and worth confirming in all
 * three cases — what changes is what comes next.
 *
 * The election state is whatever the API returned alongside the registration.
 * When it is missing — the settings read failed, but the voter is on the
 * register regardless — the screen falls back to the previous behaviour and
 * offers the ballot, which the ballot route will then gate properly. Better to
 * send a voter to a screen that can explain itself than to withhold the ballot
 * from someone entitled to it on the strength of a failed lookup.
 */
function RegistrationComplete({ voter, election, onContinue }) {
    const status = election?.status
    const votingOpen = !election || isVotingOpen(status)
    const ended = status === ELECTION_STATUS.ENDED

    return (
        <PageShell width="md" credit={false}>
            <PageHeading
                title={
                    votingOpen
                        ? 'You are registered'
                        : ended
                          ? 'Registration is complete'
                          : 'Registration successful'
                }
                description={
                    votingOpen
                        ? 'Your voter registration has been recorded.'
                        : ended
                          ? 'Voting has ended for this election.'
                          : 'Your voter registration has been recorded. Voting will open during the scheduled election period.'
                }
            />

            <RegistrationReceipt voter={voter} />

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                If any information is incorrect, contact the {ELECTORAL_COMMISSION}
                {ended ? '.' : ' before voting opens.'}
            </p>

            {/* The reassurance a voter who borrowed someone's phone needs, and
                the one the platform previously could not honestly give. They
                are not tied to this device, and whoever lent it to them can
                still register on it. */}
            {!ended ? (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    You can sign in and vote from any device — you do not need to use this one
                    again.
                </p>
            ) : null}

            {/* The opening time comes from the admin settings row that travelled
                back with the registration, never from a constant here. Once the
                poll is open the useful fact is when it shuts instead. */}
            {votingOpen && election?.closesAt ? (
                <p className="mt-4 font-medium">
                    Voting closes on {formatDateTimeLong(election.closesAt, { separator: ' at ' })}.
                </p>
            ) : null}
            {!votingOpen && !ended && election?.opensAt ? (
                <p className="mt-4 font-medium">
                    Voting opens on {formatDateTimeLong(election.opensAt, { separator: ' at ' })}.
                </p>
            ) : null}

            {votingOpen ? (
                <>
                    <div className="mt-8 rounded-xl border border-border bg-surface p-4 sm:p-5">
                        <h2 className="font-semibold">What happens on the ballot</h2>
                        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                            <li>1. You see every candidate standing in your constituency.</li>
                            <li>2. You select one, then review your choice.</li>
                            <li>3. Once you submit, your ballot cannot be changed.</li>
                        </ol>
                    </div>

                    <Button size="xl" className="mt-6 w-full sm:w-auto" onClick={onContinue}>
                        Continue to your ballot
                    </Button>
                </>
            ) : (
                /* Deliberately no route into the ballot. Offering one here would
                   be offering a door that the ballot route will refuse, which
                   reads as a broken service rather than a closed poll. */
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button asChild size="lg" className="sm:w-auto">
                        <Link href="/">Return home</Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="sm:w-auto">
                        <Link href="/election">View election details</Link>
                    </Button>
                </div>
            )}
        </PageShell>
    )
}

/**
 * The receipt: exactly what was written to the register, for the voter to check.
 *
 * Worth the space because date of birth is half the credential. A voter who
 * mistypes it is not merely holding a wrong record — they can never sign in,
 * and under the current design they would not discover that until polling day,
 * when nothing can be done about it. Showing the stored value in words ("14
 * March 2004", never "14/03/2004", which is the same eight characters as an
 * American reading of a different day) turns a silent lockout into something
 * caught while the voter is still on the page.
 *
 * No internal identifiers appear here, and none are sent to the browser.
 *
 * Rows wrap rather than truncate: a long name or constituency drops onto its
 * own line instead of being clipped or pushing the page sideways, which is what
 * keeps this readable down to a 320px viewport.
 */
function RegistrationReceipt({ voter }) {
    const rows = [
        ['Name', voter.full_name],
        ['Constituency', voter.constituency_name],
        ['Date of birth', formatDateLong(voter.voter_dob)],
        ['Registered', formatDateTimeLong(voter.registered_at)],
    ].filter(([, value]) => value)

    return (
        <div className="mt-8 rounded-xl border border-border bg-surface px-4 py-1 sm:px-5">
            <p className="pt-3 text-sm text-muted-foreground">
                Please verify that the information below is correct.
            </p>
            <dl className="mt-1 divide-y divide-border">
                {rows.map(([label, value]) => (
                    <div
                        key={label}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3"
                    >
                        <dt className="text-sm text-muted-foreground">{label}</dt>
                        <dd className="min-w-0 font-medium [overflow-wrap:anywhere] sm:text-right">
                            {value}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    )
}
