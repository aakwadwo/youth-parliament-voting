'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function Settings() {
    const [settings, setSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        fetch('/api/admin/settings')
            .then(r => r.json())
            .then(data => {
                setSettings(data)
                setLoading(false)
            })
    }, [])

    async function handleSave() {
        setSaving(true)
        setError('')
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
        }
        setSaving(false)
    }

    async function toggleVoting() {
        const updated = { ...settings, is_active: !settings.is_active }
        setSettings(updated)
        await fetch('/api/admin/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
        })
        setSuccessMessage(updated.is_active ? 'Voting is now open' : 'Voting is now closed')
        setTimeout(() => setSuccessMessage(''), 3000)
    }

    if (loading) return (
        <div className="space-y-4">
            <div className="h-8 w-48 bg-zinc-100 rounded-lg animate-pulse" />
            <div className="h-48 bg-zinc-100 rounded-xl animate-pulse" />
        </div>
    )

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
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="font-medium text-black">Voting status</p>
                            <p className="text-sm text-zinc-500">
                                {settings.is_active ? 'Voting is currently open' : 'Voting is currently closed'}
                            </p>
                        </div>
                        <button
                            onClick={toggleVoting}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                                settings.is_active ? 'bg-[#006B3F]' : 'bg-zinc-200'
                            }`}
                        >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.is_active ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
                        </button>
                    </div>
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

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <Button
                        className="w-full bg-black text-white hover:bg-zinc-800 h-11"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save changes'}
                    </Button>

                </CardContent>
            </Card>

        </div>
    )
}