'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { StatusPill } from '@/components/ui/badge'
import { Skeleton, EmptyState } from '@/components/ui/feedback'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { useFetch } from '@/lib/useFetch'
import { formatWhen } from '@/lib/voter-client'

const ACTION_LABELS = {
    admin_login: 'Administrator signed in',
    admin_login_failed: 'Failed sign-in attempt',
    admin_logout: 'Administrator signed out',
    voting_opened: 'Voting opened',
    voting_closed: 'Voting closed',
    election_settings_changed: 'Election settings changed',
    candidate_created: 'Candidate added',
    candidate_updated: 'Candidate updated',
    candidate_activated: 'Candidate restored to ballot',
    candidate_deactivated: 'Candidate withdrawn from ballot',
    constituency_created: 'Constituency added',
    constituency_imported: 'Constituencies imported',
    results_exported: 'Election report exported',
}

const ACTION_TONE = {
    admin_login_failed: 'danger',
    voting_opened: 'success',
    voting_closed: 'warning',
    candidate_deactivated: 'warning',
    results_exported: 'brand',
}

/**
 * `<input type="datetime-local">` speaks naive local time, while the database
 * stores `timestamptz`.
 *
 * The previous code called `.toISOString().slice(0, 16)` to fill the field,
 * which displays UTC, and sent the raw field value straight back, which
 * Postgres then interpreted in the server's timezone. Ghana sits at GMT+0
 * year-round so this happened to look correct there, and would have silently
 * shifted the poll's opening and closing times by hours for an administrator
 * working from anywhere else. These two functions convert explicitly in both
 * directions.
 */
function toLocalInputValue(isoString) {
    if (!isoString) return ''
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    )
}

function fromLocalInputValue(value) {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export default function Settings() {
    const {
        data: settings,
        setData: setSettings,
        loading,
        error: loadError,
        reload,
    } = useFetch('/api/admin/settings', {
        errorMessage: 'Could not load election settings.',
    })

    const {
        data: auditLog,
        loading: auditLogLoading,
        error: auditLogError,
        reload: reloadAuditLog,
    } = useFetch('/api/admin/audit-log', {
        initialData: [],
        errorMessage: 'Could not load recent activity.',
    })

    const [saving, setSaving] = useState(false)
    const [togglePending, setTogglePending] = useState(false)
    const [confirmingToggle, setConfirmingToggle] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')
    const [error, setError] = useState('')
    const [fieldErrors, setFieldErrors] = useState({})

    async function patchSettings(payload) {
        const res = await fetch('/api/admin/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Request failed')
        return data
    }

    async function handleSave(event) {
        event.preventDefault()

        const errors = {}
        if (!settings.election_name?.trim()) {
            errors.election_name = 'Give the election a name.'
        }
        const opens = fromLocalInputValue(settings._opensLocal)
        const closes = fromLocalInputValue(settings._closesLocal)
        if (opens && closes && new Date(opens) >= new Date(closes)) {
            errors.voting_closes_at = 'Closing time must be after the opening time.'
        }

        setFieldErrors(errors)
        if (Object.keys(errors).length > 0) return

        setSaving(true)
        setError('')
        try {
            await patchSettings({
                id: settings.id,
                election_name: settings.election_name,
                voting_opens_at: opens,
                voting_closes_at: closes,
                is_active: settings.is_active,
            })
            setSuccessMessage('Election settings saved.')
            reloadAuditLog()
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    async function confirmToggleVoting() {
        const previous = settings
        const next = { ...settings, is_active: !settings.is_active }

        setTogglePending(true)
        setError('')
        setSettings(next)

        try {
            await patchSettings({
                id: next.id,
                election_name: next.election_name,
                voting_opens_at: fromLocalInputValue(next._opensLocal),
                voting_closes_at: fromLocalInputValue(next._closesLocal),
                is_active: next.is_active,
            })
            setSuccessMessage(next.is_active ? 'Voting is now open.' : 'Voting is now closed.')
            reloadAuditLog()
        } catch (err) {
            // Roll the optimistic update back so the toggle never shows a state
            // the database does not actually hold.
            setSettings(previous)
            setError(err.message ?? 'Could not change the voting status.')
        } finally {
            setTogglePending(false)
            setConfirmingToggle(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-72 w-full rounded-xl" />
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="space-y-6">
                <SectionHeader title="Settings" />
                <Alert variant="danger" title="Could not load settings">
                    <p>{loadError}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={reload}
                        pending={loading}
                    >
                        {loading ? null : <RefreshCw aria-hidden="true" />}
                        Try again
                    </Button>
                </Alert>
            </div>
        )
    }

    if (!settings) return null

    // Local-time mirrors of the stored timestamps, initialised once on load.
    const opensLocal = settings._opensLocal ?? toLocalInputValue(settings.voting_opens_at)
    const closesLocal = settings._closesLocal ?? toLocalInputValue(settings.voting_closes_at)

    return (
        <div className="space-y-6">
            <SectionHeader
                title="Settings"
                description="Election configuration and the administrative audit trail"
            />

            {successMessage ? (
                <Alert variant="success" title="Saved">
                    {successMessage}
                </Alert>
            ) : null}

            {error ? (
                <Alert variant="danger" title="Could not save">
                    {error}
                </Alert>
            ) : null}

            {/* Voting switch */}
            <Card>
                <CardContent>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <h2 className="font-semibold">Voting status</h2>
                            <p className="text-sm text-muted-foreground">
                                {settings.is_active
                                    ? 'Voters can cast ballots right now.'
                                    : 'Voting is closed. No ballot can be cast.'}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* No `pulse` prop: StatusPill has never accepted
                                one, so it was being spread onto the <span> as
                                an unknown DOM attribute and React warned about
                                it on every render of this panel. */}
                            <StatusPill variant={settings.is_active ? 'success' : 'neutral'}>
                                {settings.is_active ? 'Open' : 'Closed'}
                            </StatusPill>
                            <Button
                                variant={settings.is_active ? 'destructive' : 'default'}
                                onClick={() => setConfirmingToggle(true)}
                                pending={togglePending}
                                pendingLabel="Updating…"
                            >
                                {settings.is_active ? 'Close voting' : 'Open voting'}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Election details */}
            <Card>
                <CardContent>
                    <form onSubmit={handleSave} noValidate className="space-y-5">
                        <h2 className="font-semibold">Election details</h2>

                        <Field
                            id="election_name"
                            label="Election name"
                            hint="Shown to voters and printed on the exported report."
                            required
                            error={fieldErrors.election_name}
                        >
                            <Input
                                value={settings.election_name ?? ''}
                                onChange={(e) =>
                                    setSettings((p) => ({ ...p, election_name: e.target.value }))
                                }
                            />
                        </Field>

                        <div className="grid gap-5 sm:grid-cols-2">
                            <Field
                                id="voting_opens_at"
                                label="Voting opens"
                                hint="Your local time."
                            >
                                <Input
                                    type="datetime-local"
                                    value={opensLocal}
                                    onChange={(e) =>
                                        setSettings((p) => ({ ...p, _opensLocal: e.target.value }))
                                    }
                                />
                            </Field>

                            <Field
                                id="voting_closes_at"
                                label="Voting closes"
                                hint="Your local time."
                                error={fieldErrors.voting_closes_at}
                            >
                                <Input
                                    type="datetime-local"
                                    value={closesLocal}
                                    onChange={(e) =>
                                        setSettings((p) => ({ ...p, _closesLocal: e.target.value }))
                                    }
                                />
                            </Field>
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" pending={saving} pendingLabel="Saving…">
                                Save changes
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Audit trail */}
            <Card>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="font-semibold">Recent administrative activity</h2>
                            <p className="text-sm text-muted-foreground">
                                Every action that can affect an election result
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={reloadAuditLog}
                            pending={auditLogLoading}
                        >
                            {auditLogLoading ? null : <RefreshCw aria-hidden="true" />}
                            <span className="sr-only sm:not-sr-only">Refresh</span>
                        </Button>
                    </div>

                    {auditLogError ? (
                        <Alert variant="danger">{auditLogError}</Alert>
                    ) : auditLog.length === 0 ? (
                        <EmptyState
                            title="No activity recorded yet"
                            description="Administrative actions appear here as they happen."
                        />
                    ) : (
                        <ul className="divide-y divide-border">
                            {auditLog.map((entry) => (
                                <li
                                    key={entry.id}
                                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                                >
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-medium">
                                                {ACTION_LABELS[entry.action] ?? entry.action}
                                            </span>
                                            {ACTION_TONE[entry.action] ? (
                                                <StatusPill variant={ACTION_TONE[entry.action]}>
                                                    {entry.action === 'admin_login_failed'
                                                        ? 'Security'
                                                        : 'Notable'}
                                                </StatusPill>
                                            ) : null}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {[
                                                entry.details?.candidate_name,
                                                entry.actor_email ?? entry.details?.admin_email,
                                                entry.details?.format
                                                    ? `${String(entry.details.format).toUpperCase()} export`
                                                    : null,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ') || 'No further detail recorded'}
                                        </p>
                                    </div>
                                    <time
                                        dateTime={entry.performed_at}
                                        className="shrink-0 text-xs text-muted-foreground"
                                    >
                                        {formatWhen(entry.performed_at)}
                                    </time>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <ConfirmDialog
                open={confirmingToggle}
                onOpenChange={setConfirmingToggle}
                title={settings.is_active ? 'Close voting?' : 'Open voting?'}
                description={
                    settings.is_active
                        ? 'Ballots will stop being accepted immediately. Voters partway through choosing a candidate will not be able to submit.'
                        : 'Eligible registered voters will be able to cast ballots immediately.'
                }
                warning="This takes effect at once for every voter in the country, and is recorded in the audit log."
                confirmLabel={settings.is_active ? 'Close voting' : 'Open voting'}
                tone={settings.is_active ? 'destructive' : 'default'}
                pending={togglePending}
                onConfirm={confirmToggleVoting}
            />
        </div>
    )
}
