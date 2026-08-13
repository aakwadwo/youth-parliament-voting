'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Field } from '@/components/ui/field'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { ConstituencyCombobox } from '@/components/ConstituencyCombobox'
import { useFetch } from '@/lib/useFetch'
import { getJson, request as apiRequest } from '@/lib/api-client'
import { normalisePhone, isValidGhanaPhone } from '@/lib/validation'
import { formatWhen } from '@/lib/election-status'

/**
 * Correcting the constituency on a registration.
 *
 * ── Why this screen is shaped the way it is ─────────────────────────────────
 *
 * It is a lookup, not a table. There is no list of voters to scroll, no "recent
 * registrations", and no way to arrive at a voter record except by typing a
 * phone number that someone has given you. Every other admin section works on
 * aggregates precisely so the portal is not a browsable electoral register, and
 * this one is the single exception — so it is kept as narrow as the task
 * allows: one number in, one record out, one field editable.
 *
 * ── What is deliberately not on screen ──────────────────────────────────────
 *
 * The voter's date of birth, and their full phone number. Those two together
 * are the credential a voter signs in with, so putting them on an
 * administrator's screen would mean anyone who saw that screen could sign in as
 * that voter. The server never sends either — the number comes back masked —
 * and this component could not display them if it wanted to.
 */
export default function Voters() {
    // The picker needs the constituency list; this is the admin-side list that
    // Constituencies and Candidates already use, so it is the same response and
    // the same shape those sections read.
    const { data: constituencies, loading: constituenciesLoading } = useFetch(
        '/api/admin/constituencies',
        {
            initialData: [],
            errorMessage: 'Could not load constituencies.',
            // Read-only here. The list changes rarely and this section never
            // edits it, so a warm copy from another section is fine.
            cacheTtl: 30_000,
        }
    )

    const [phone, setPhone] = useState('')
    const [phoneError, setPhoneError] = useState('')
    const [searching, setSearching] = useState(false)
    const [searchError, setSearchError] = useState('')
    // null = nothing searched yet; false = searched and found nothing.
    const [voter, setVoter] = useState(null)
    const [searched, setSearched] = useState(false)

    const [pendingConstituency, setPendingConstituency] = useState(null)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    async function handleSearch(event) {
        event.preventDefault()

        const normalised = normalisePhone(phone)
        if (!isValidGhanaPhone(normalised)) {
            setPhoneError('Enter a Ghana mobile number, for example 024 123 4567.')
            return
        }

        setPhoneError('')
        setSearching(true)
        setSearchError('')
        setSuccessMessage('')
        setSaveError('')
        setVoter(null)

        const result = await getJson(
            `/api/admin/voters?phone=${encodeURIComponent(normalised)}`
        )

        setSearching(false)
        setSearched(true)

        if (!result.ok) {
            setSearchError(result.error)
            return
        }

        setVoter(result.data?.voter ?? null)
    }

    async function handleConfirmChange() {
        if (!voter || !pendingConstituency) return

        setSaving(true)
        setSaveError('')

        // PATCH with a body of exactly one key. The route refuses any other, so
        // this is not merely the convention here — sending more would 400.
        const result = await apiRequest(`/api/admin/voters/${voter.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ constituency_id: pendingConstituency.id }),
        })

        setSaving(false)

        if (!result.ok) {
            setSaveError(result.error)
            setPendingConstituency(null)
            return
        }

        setVoter(result.data?.voter ?? voter)
        setPendingConstituency(null)
        setSuccessMessage(
            result.data?.unchanged
                ? 'That voter was already in this constituency. Nothing was changed.'
                : `Constituency updated to ${result.data?.voter?.constituency_name ?? 'the selected constituency'}.`
        )
    }

    return (
        <div className="space-y-6">
            <SectionHeader
                title="Voter register"
                description="Look up one registration by phone number to correct the constituency it was made in."
            />

            <Card>
                <CardContent>
                    <form onSubmit={handleSearch} noValidate className="space-y-4">
                        <Field
                            id="voter-phone-search"
                            label="Voter's phone number"
                            hint="The number they registered with. This is the only way to find a registration."
                            error={phoneError}
                        >
                            <Input
                                type="tel"
                                inputMode="numeric"
                                autoComplete="off"
                                maxLength={13}
                                placeholder="024 123 4567"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                            />
                        </Field>

                        <Button type="submit" pending={searching} pendingLabel="Searching…">
                            <Search aria-hidden="true" />
                            Find voter
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {searchError ? (
                <Alert variant="danger" title="Could not search the register">
                    {searchError}
                </Alert>
            ) : null}

            {searched && !voter && !searchError ? (
                <EmptyState
                    title="No registration found"
                    description="No voter is registered with that phone number. Check the number and try again."
                />
            ) : null}

            {successMessage ? (
                <Alert variant="success" title="Register updated">
                    {successMessage}
                </Alert>
            ) : null}

            {saveError ? (
                <Alert variant="danger" title="Could not change the constituency">
                    {saveError}
                </Alert>
            ) : null}

            {voter ? (
                <VoterCard
                    voter={voter}
                    constituencies={constituencies}
                    constituenciesLoading={constituenciesLoading}
                    onSelectConstituency={(constituency) => {
                        setSuccessMessage('')
                        setSaveError('')
                        if (constituency.id !== voter.constituency_id) {
                            setPendingConstituency(constituency)
                        }
                    }}
                />
            ) : null}

            <ConfirmDialog
                open={Boolean(pendingConstituency)}
                onOpenChange={(open) => {
                    if (!open) setPendingConstituency(null)
                }}
                title="Change this voter's constituency?"
                description={
                    pendingConstituency && voter
                        ? `${voter.full_name} will be moved from ${voter.constituency_name ?? 'no constituency'} to ${pendingConstituency.name}. They will be shown the ballot for ${pendingConstituency.name} when voting opens.`
                        : ''
                }
                warning="This is recorded in the audit log against your account."
                confirmLabel="Change constituency"
                pendingLabel="Saving…"
                pending={saving}
                onConfirm={handleConfirmChange}
            />
        </div>
    )
}

/**
 * The record itself.
 *
 * Every field here is read-only except the constituency picker. `has_voted` and
 * `is_verified` are shown as badges rather than controls precisely because they
 * are not editable from this screen and must not look as though they are.
 */
function VoterCard({ voter, constituencies, constituenciesLoading, onSelectConstituency }) {
    const rows = [
        ['Name', voter.full_name],
        ['Phone', voter.phone_masked],
        ['Constituency', voter.constituency_name ?? '—'],
        ['Registered', formatWhen(voter.registered_at) || '—'],
    ]

    return (
        <Card>
            <CardContent className="space-y-6">
                <div>
                    <dl className="divide-y divide-border">
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

                    <div className="flex flex-wrap gap-2 pt-3">
                        <Badge variant={voter.has_voted ? 'success' : 'neutral'}>
                            {voter.has_voted ? 'Has voted' : 'Has not voted'}
                        </Badge>
                        <Badge variant={voter.is_verified ? 'success' : 'warning'}>
                            {voter.is_verified ? 'Verified' : 'Not verified'}
                        </Badge>
                    </div>
                </div>

                {voter.has_voted ? (
                    <Alert variant="info" title="This registration can no longer be changed">
                        A ballot has already been recorded for this voter, so their constituency is
                        fixed. Changing it now would separate their ballot from their registration.
                    </Alert>
                ) : (
                    <Field
                        id="voter-constituency"
                        label="Move to constituency"
                        hint="Changing this changes which ballot paper the voter is shown."
                    >
                        {(controlProps) => (
                            <ConstituencyCombobox
                                {...controlProps}
                                constituencies={constituencies}
                                loading={constituenciesLoading}
                                value={voter.constituency_id}
                                onChange={onSelectConstituency}
                            />
                        )}
                    </Field>
                )}
            </CardContent>
        </Card>
    )
}
