'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { ConstituencyCombobox } from '@/components/ConstituencyCombobox'

export default function VotePage() {
    const router = useRouter()
    const [constituencies, setConstituencies] = useState([])
    const [constituenciesError, setConstituenciesError] = useState('')
    const [error, setError] = useState('')
    const [registered, setRegistered] = useState(false)
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({
        voter_name: '',
        voter_dob: '',
        voter_phone: '',
        constituency_id: '',
        constituency_name: '',
    })

    useEffect(() => {
        fetch('/api/constituencies')
            .then(r => r.json())
            .then(setConstituencies)
            .catch(() => setConstituenciesError('Could not load constituencies. Please refresh the page.'))
    }, [])

    function updateForm(key, value) {
        setForm(prev => ({ ...prev, [key]: value }))
    }

    function validate() {
        if (!form.voter_name.trim()) return 'Please enter your full name'
        if (!form.voter_dob) return 'Please enter your date of birth'
        const dob = new Date(form.voter_dob)
        const age = Math.floor((new Date() - dob) / (1000 * 60 * 60 * 24 * 365.25))
        if (age < 18 || age > 35) return 'You must be between 18 and 35 years old'
        if (!form.voter_phone.trim()) return 'Please enter your phone number'
        if (!/^0[0-9]{9}$/.test(form.voter_phone.trim())) return 'Enter a valid Ghana phone number (e.g. 0241234567)'
        if (!form.constituency_id) return 'Please select your constituency'
        return null
    }

    async function handleRegister() {
        const err = validate()
        if (err) { setError(err); return }

        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: form.voter_name,
                    voter_dob: form.voter_dob,
                    voter_phone: form.voter_phone,
                    constituency_id: form.constituency_id,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error)
                return
            }

            sessionStorage.setItem('voter', JSON.stringify({
                id: data.id,
                voter_name: data.full_name,
                constituency_id: data.constituency_id,
                constituency_name: form.constituency_name,
            }))
            setRegistered(true)
        } catch {
            setError('Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    if (registered) {
        return (
            <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
                <div className="max-w-lg w-full text-center space-y-8">

                    <div className="flex justify-center">
                        <div className="h-2 w-20 bg-[#CF0A0A]" />
                        <div className="h-2 w-20 bg-[#FCD20F]" />
                        <div className="h-2 w-20 bg-[#006B3F]" />
                    </div>

                    <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center mx-auto">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-3xl font-semibold text-black">You&apos;re registered</h2>
                        <p className="text-zinc-500 text-lg leading-relaxed">
                            Welcome, <span className="text-black font-medium">{form.voter_name}</span>.
                            You are registered to vote in <span className="text-black font-medium">{form.constituency_name}</span>.
                        </p>
                    </div>

                    <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-5 text-left space-y-3">
                        <p className="text-sm font-medium text-zinc-700">Before you vote</p>
                        <ul className="text-sm text-zinc-500 space-y-2">
                            <li>— You will see the candidates for your constituency</li>
                            <li>— Select one candidate and confirm your choice</li>
                            <li>— Your vote is secret and cannot be changed once submitted</li>
                        </ul>
                    </div>

                    <Button
                        className="w-full bg-black text-white hover:bg-zinc-800 h-12 text-base"
                        onClick={() => router.push('/vote/candidates')}
                    >
                        Proceed to vote
                    </Button>

                </div>
            </main>
        )
    }

    return (
        <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
            <div className="max-w-lg w-full space-y-8">

                <div className="text-center space-y-3">
                    <div className="flex justify-center">
                        <div className="h-2 w-20 bg-[#CF0A0A]" />
                        <div className="h-2 w-20 bg-[#FCD20F]" />
                        <div className="h-2 w-20 bg-[#006B3F]" />
                    </div>
                    <h1 className="text-3xl font-semibold text-black tracking-tight">
                        Election registration
                    </h1>
                    <p className="text-zinc-500 text-base">
                        Register to participate in this election
                    </p>
                </div>

                <div className="flex gap-3 bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                    <svg className="w-5 h-5 text-zinc-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        Your details are used only to verify eligibility and prevent duplicate votes.
                        They are never linked to your ballot.{' '}
                        <span className="text-zinc-700 font-medium">Your vote is completely secret.</span>
                    </p>
                </div>

                <Card className="border border-zinc-200 shadow-none">
                    <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-5">

                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-base">Full name</Label>
                            <Input
                                id="name"
                                placeholder="e.g. Kwame Mensah"
                                className="h-11 text-base"
                                value={form.voter_name}
                                onChange={e => updateForm('voter_name', e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="dob" className="text-base">Date of birth</Label>
                            <Input
                                id="dob"
                                type="date"
                                className="h-11 text-base"
                                value={form.voter_dob}
                                onChange={e => updateForm('voter_dob', e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-base">Phone number</Label>
                            <Input
                                id="phone"
                                placeholder="e.g. 0241234567"
                                className="h-11 text-base"
                                value={form.voter_phone}
                                onChange={e => updateForm('voter_phone', e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base">Constituency</Label>
                            <ConstituencyCombobox
                                constituencies={constituencies}
                                value={form.constituency_id}
                                onChange={c => {
                                    updateForm('constituency_id', c.id)
                                    updateForm('constituency_name', c.name)
                                }}
                            />
                        </div>

                        {constituenciesError && <p className="text-base text-red-600" role="alert" aria-live="polite">{constituenciesError}</p>}
                        {error && <p className="text-base text-red-600" role="alert" aria-live="polite">{error}</p>}

                        <Button
                            className="w-full bg-black text-white hover:bg-zinc-800 h-11 text-base"
                            onClick={handleRegister}
                            disabled={loading}
                        >
                            {loading ? 'Registering...' : 'Register'}
                        </Button>

                    </CardContent>
                </Card>

                <p className="text-center text-sm text-zinc-500">
                    By proceeding you confirm you are a Ghanaian citizen aged 18–35.
                </p>

            </div>
        </main>
    )
}