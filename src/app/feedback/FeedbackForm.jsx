'use client'

import { useState } from 'react'
import { Check, Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Alert } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { postJson } from '@/lib/api-client'
import { CONTACT_EMAIL } from '@/lib/election'

/**
 * Feedback on the platform — not on the election, and not on the candidates.
 *
 * Every question below is about using the software: whether the steps were
 * findable, whether anything failed, what should change. There is deliberately
 * no question about who anyone voted for, whether they liked the result, or
 * what they think of the Youth Parliament. Two reasons, and the first is the
 * one that matters: a form on an election platform that invites people to
 * discuss their ballot is a route to exactly the linkage the schema was
 * designed to make impossible, and no amount of "we won't store it" makes an
 * answer typed into a box safe. The second is that unfocused feedback produces
 * nothing anyone can act on.
 *
 * ── Where the answers go ────────────────────────────────────────────────────
 *
 * POSTed to /api/feedback, which writes one row to `platform_feedback`
 * (migration 0017). That table holds no voter reference, no contact details
 * and no IP — the address is used for the rate limit and discarded with the
 * request — so a submission is anonymous in the same sense a ballot is.
 *
 * The confirmation below is shown only after the server has actually accepted
 * the row. A failure keeps the answers on screen and says so, because the one
 * thing worse than losing feedback is telling someone it was received when it
 * was not.
 */

const RATINGS = [
    { value: '5', label: 'Very easy' },
    { value: '4', label: 'Easy' },
    { value: '3', label: 'Mixed' },
    { value: '2', label: 'Difficult' },
    { value: '1', label: 'Very difficult' },
]

const PARTS = [
    'Registering to vote',
    'Signing in',
    'Casting my vote',
    'Viewing the results',
]

const DEVICES = ['Phone', 'Computer', 'Tablet']

export function FeedbackForm() {
    const [rating, setRating] = useState('')
    const [parts, setParts] = useState([])
    const [device, setDevice] = useState('')
    const [worked, setWorked] = useState('')
    const [problems, setProblems] = useState('')
    const [suggestions, setSuggestions] = useState('')
    const [sent, setSent] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState(null)

    const togglePart = (part) =>
        setParts((current) =>
            current.includes(part) ? current.filter((p) => p !== part) : [...current, part]
        )

    const hasAnything =
        rating || parts.length > 0 || device || worked.trim() || problems.trim() || suggestions.trim()

    async function submit(event) {
        event.preventDefault()
        if (sending) return

        setSending(true)
        setError(null)

        const result = await postJson('/api/feedback', {
            rating: rating ? Number(rating) : null,
            parts,
            device: device || null,
            worked_well: worked,
            problems,
            suggestions,
        })

        setSending(false)

        // Only on a confirmed write. Anything else keeps the answers on screen
        // so they are not lost to a retry.
        if (result.ok) {
            setSent(true)
            return
        }
        setError(result.error)
    }

    if (sent) {
        return (
            <div
                // Announced, because someone using a screen reader has just
                // pressed a button and the form they were in has been replaced.
                role="status"
                aria-live="polite"
                className="rounded-xl border border-border bg-card p-6 text-center sm:p-8"
            >
                <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-success-surface text-success-foreground">
                    <Check aria-hidden="true" className="size-5" />
                </span>
                <h2 className="mt-4 text-heading font-semibold">Feedback received</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    Thank you — your answers have been saved and will be read by the team that
                    builds this platform. Nothing you sent identifies you.
                </p>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                    If you need a reply about your registration or your vote, contact the
                    Commission at {CONTACT_EMAIL} — this form is anonymous, so nobody can write
                    back to it.
                </p>
            </div>
        )
    }

    return (
        <form className="space-y-8" onSubmit={submit}>
            <fieldset>
                <legend className="text-sm font-medium">
                    Overall, how was using the platform?
                </legend>
                <div className="mt-3 flex flex-wrap gap-2">
                    {RATINGS.map((option) => (
                        <label
                            key={option.value}
                            className={cn(
                                'cursor-pointer rounded-lg border px-3.5 py-2 text-sm transition-colors',
                                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                                rating === option.value
                                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                                    : 'border-border-strong bg-background hover:bg-muted'
                            )}
                        >
                            <input
                                type="radio"
                                name="rating"
                                value={option.value}
                                checked={rating === option.value}
                                onChange={(event) => setRating(event.target.value)}
                                className="sr-only"
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
            </fieldset>

            <fieldset>
                <legend className="text-sm font-medium">Which parts did you use?</legend>
                <p className="mt-1 text-sm text-muted-foreground">Choose any that apply.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {PARTS.map((part) => (
                        <label
                            key={part}
                            className={cn(
                                'cursor-pointer rounded-lg border px-3.5 py-2 text-sm transition-colors',
                                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                                parts.includes(part)
                                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                                    : 'border-border-strong bg-background hover:bg-muted'
                            )}
                        >
                            <input
                                type="checkbox"
                                name="parts"
                                value={part}
                                checked={parts.includes(part)}
                                onChange={() => togglePart(part)}
                                className="sr-only"
                            />
                            {part}
                        </label>
                    ))}
                </div>
            </fieldset>

            <fieldset>
                <legend className="text-sm font-medium">What did you use it on?</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                    {DEVICES.map((option) => (
                        <label
                            key={option}
                            className={cn(
                                'cursor-pointer rounded-lg border px-3.5 py-2 text-sm transition-colors',
                                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                                device === option
                                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                                    : 'border-border-strong bg-background hover:bg-muted'
                            )}
                        >
                            <input
                                type="radio"
                                name="device"
                                value={option}
                                checked={device === option}
                                onChange={(event) => setDevice(event.target.value)}
                                className="sr-only"
                            />
                            {option}
                        </label>
                    ))}
                </div>
            </fieldset>

            <Field
                label="What worked well?"
                hint="Anything that was clear, quick or easy to find."
                optional
            >
                <Textarea
                    rows={4}
                    value={worked}
                    onChange={(event) => setWorked(event.target.value)}
                    placeholder="For example: registering took less than a minute on my phone."
                />
            </Field>

            <Field
                label="What didn't work?"
                hint="Anything confusing, slow, broken, or hard to read."
                optional
            >
                <Textarea
                    rows={4}
                    value={problems}
                    onChange={(event) => setProblems(event.target.value)}
                    placeholder="For example: I couldn't tell whether my vote had been counted."
                />
            </Field>

            <Field
                label="How could we improve the platform?"
                hint="Changes you would like to see before the next election."
                optional
            >
                <Textarea
                    rows={4}
                    value={suggestions}
                    onChange={(event) => setSuggestions(event.target.value)}
                    placeholder="For example: show the constituency name on the confirmation screen."
                />
            </Field>

            <div className="rounded-lg border border-border bg-surface p-4">
                <p className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                    <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>
                        Your answers are stored anonymously. We do not record your name, your phone
                        number or your address, and nothing here is linked to your registration or
                        your ballot. Please don&rsquo;t tell us who you voted for — your vote is
                        secret and this form is about the platform.
                    </span>
                </p>
            </div>

            {error ? (
                <Alert variant="danger" title="Your feedback was not sent">
                    {error} Your answers are still here — you can try again.
                </Alert>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                    type="submit"
                    size="lg"
                    pending={sending}
                    disabled={!hasAnything || sending}
                    className="sm:w-auto"
                >
                    {sending ? 'Sending…' : 'Send feedback'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={sending}
                    className="sm:w-auto"
                    onClick={() => {
                        setRating('')
                        setParts([])
                        setDevice('')
                        setWorked('')
                        setProblems('')
                        setSuggestions('')
                        setError(null)
                    }}
                >
                    Clear
                </Button>
            </div>
        </form>
    )
}
