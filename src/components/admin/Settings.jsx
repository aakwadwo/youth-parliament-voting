'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { useFetch } from '@/lib/useFetch'

export default function Settings() {
    const { data: settings, setData: setSettings, loading, error: loadError } = useFetch('/api/admin/settings', {
        errorMessage: 'Could not load settings. Please refresh the page.',
    })
    const { data: auditLog, error: auditLogError, reload: loadAuditLog } = useFetch('/api/admin/audit-log', {
        initialData: [],
        errorMessage: 'Could not load recent activity.',
    })
    const [saving, setSaving] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')
    const [error, setError] = useState('')
    const [confirmingVoteToggle, setConfirmingVoteToggle] = useState(false)

    const ACTION_LABELS = {
        voting_opened: 'Voting opened',
        voting_closed: 'Voting closed',
        election_settings_changed: 'Election settings changed',
        candidate_activated: 'Candidate activated',
        candidate_deactivated: 'Candidate deactivated',
    }

    async function handleSave() {
        setSaving(true)
        setError('')
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error)
            } else {
                setSuccessMessage('Settings saved successfully')
                setTimeout(() => setSuccessMessage(''), 3000)
                loadAuditLog()
            }
        } catch {
            setError('Something went wrong. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    async function confirmToggleVoting() {
        setConfirmingVoteToggle(false)
        const updated = { ...settings, is_active: !settings.is_active }
        setSettings(updated)
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
            })
            if (!res.ok) throw new Error()
            setSuccessMessage(updated.is_active ? 'Voting is now open' : 'Voting is now closed')
            setTimeout(() => setSuccessMessage(''), 3000)
            loadAuditLog()
        } catch {
            setSettings(settings)
            setError('Could not update voting status. Please try again.')
        }
    }

    if (loading) return (
        <div className="space-y-4">
            <div className="h-8 w-48 bg-zinc-100 rounded-lg animate-pulse" />
            <div className="h-48 bg-zinc-100 rounded-xl animate-pulse" />
        </div>
    )

    if (loadError) return <p className="text-sm text-red-600" role="alert" aria-live="polite">{loadError}</p>
    if (!settings) return null

    return (
        <div className="space-y-6">

            <div>
                <h1 className="text-2xl font-semibold text-black">Settings</h1>
                <p className="text-zinc-500 text-sm mt-1">Manage election configuration</p>
            </div>

            {successMessage && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-[#006B3F]">
                    {successMessage}
                </div>
            )}

            {/* Voting toggle */}
            <Card className="border border-zinc-200 shadow-none">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="font-medium text-black">Voting status</p>
                            <p className="text-sm text-zinc-500">
                                {settings.is_active ? 'Voting is currently open' : 'Voting is currently closed'}
                            </p>
                        </div>
                        <button
                            onClick={() => setConfirmingVoteToggle(true)}
                            aria-label={settings.is_active ? 'Close voting' : 'Open voting'}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                                settings.is_active ? 'bg-[#006B3F]' : 'bg-zinc-200'
                            }`}
                        >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.is_active ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
                        </button>
                    </div>

                    {confirmingVoteToggle && (
                        <div role="alert" className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                            <p className="text-sm text-amber-800">
                                Are you sure you want to {settings.is_active ? 'close' : 'open'} voting? This immediately affects every voter.
                            </p>
                            <div className="flex gap-2 flex-shrink-0">
                                <Button variant="outline" className="text-sm h-8" onClick={() => setConfirmingVoteToggle(false)}>
                                    Cancel
                                </Button>
                                <Button className="text-sm h-8 bg-black text-white hover:bg-zinc-800" onClick={confirmToggleVoting}>
                                    Confirm
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Election details */}
            <Card className="border border-zinc-200 shadow-none">
                <CardContent className="p-6 space-y-5">
                    <p className="font-medium text-black">Election details</p>

                    <div className="space-y-2">
                        <Label className="text-base">Election name</Label>
                        <Input
                            className="h-11"
                            value={settings.election_name || ''}
                            onChange={e => setSettings(p => ({ ...p, election_name: e.target.value }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-base">Voting opens</Label>
                        <Input
                            type="datetime-local"
                            className="h-11"
                            value={settings.voting_opens_at
                                ? new Date(settings.voting_opens_at).toISOString().slice(0, 16)
                                : ''}
                            onChange={e => setSettings(p => ({ ...p, voting_opens_at: e.target.value }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-base">Voting closes</Label>
                        <Input
                            type="datetime-local"
                            className="h-11"
                            value={settings.voting_closes_at
                                ? new Date(settings.voting_closes_at).toISOString().slice(0, 16)
                                : ''}
                            onChange={e => setSettings(p => ({ ...p, voting_closes_at: e.target.value }))}
                        />
                    </div>

                    {error && <p className="text-sm text-red-600" role="alert" aria-live="polite">{error}</p>}

                    <Button
                        className="w-full bg-black text-white hover:bg-zinc-800 h-11"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save changes'}
                    </Button>

                </CardContent>
            </Card>

            {/* Audit log */}
            <Card className="border border-zinc-200 shadow-none">
                <CardContent className="p-6 space-y-4">
                    <p className="font-medium text-black">Recent activity</p>
                    {auditLogError && <p className="text-sm text-red-600" role="alert" aria-live="polite">{auditLogError}</p>}
                    {!auditLogError && auditLog.length === 0 && (
                        <p className="text-sm text-zinc-500">No admin actions recorded yet.</p>
                    )}
                    {auditLog.length > 0 && (
                        <ul className="divide-y divide-zinc-100">
                            {auditLog.map(entry => (
                                <li key={entry.id} className="py-3 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-medium text-black">
                                            {ACTION_LABELS[entry.action] ?? entry.action}
                                        </p>
                                        {entry.details?.candidate_name && (
                                            <p className="text-xs text-zinc-500 mt-0.5">{entry.details.candidate_name}</p>
                                        )}
                                        {entry.details?.admin_email && (
                                            <p className="text-xs text-zinc-500 mt-0.5">by {entry.details.admin_email}</p>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-500 whitespace-nowrap">
                                        {new Date(entry.performed_at).toLocaleString()}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

        </div>
    )
}