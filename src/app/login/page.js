'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'

export default function LoginPage() {
    const router = useRouter()
    const [form, setForm] = useState({ voter_phone: '', voter_dob: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [alreadyVoted, setAlreadyVoted] = useState(false)
    const [voterName, setVoterName] = useState('')

    async function handleLogin() {
        if (!form.voter_phone.trim() || !form.voter_dob) {
            setError('Please enter your phone number and date of birth')
            return
        }
        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error)
            } else if (data.already_voted) {
                setVoterName(data.voter.full_name)
                setAlreadyVoted(true)
            } else {
                sessionStorage.setItem('voter', JSON.stringify(data.voter))
                router.push('/vote/candidates')
            }
        } catch {
            setError('Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    if (alreadyVoted) {
        return (
            <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="flex justify-center">
                        <div className="h-2 w-20 bg-[#CF0A0A]" />
                        <div className="h-2 w-20 bg-[#FCD20F]" />
                        <div className="h-2 w-20 bg-[#006B3F]" />
                    </div>
                    <div className="w-16 h-16 rounded-full bg-[#006B3F] flex items-center justify-center mx-auto">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-semibold text-black">You have already voted</h2>
                        <p className="text-zinc-500 text-base leading-relaxed">
                            Thank you, <span className="text-black font-medium">{voterName}</span>. Your vote has been recorded.
                        </p>
                    </div>
                    <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-5 text-left space-y-2">
                        <p className="text-sm font-medium text-zinc-700">Your ballot is anonymous</p>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                            We record that you voted, but not who you voted for — not even we can look that up.
                        </p>
                    </div>
                    <Link href="/">
                        <Button variant="outline" className="w-full h-11 text-base">
                            Back to home
                        </Button>
                    </Link>
                </div>
            </main>
        )
    }

    return (
        <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
            <div className="max-w-md w-full space-y-8">

                <div className="text-center space-y-3">
                    <div className="flex justify-center">
                        <div className="h-2 w-20 bg-[#CF0A0A]" />
                        <div className="h-2 w-20 bg-[#FCD20F]" />
                        <div className="h-2 w-20 bg-[#006B3F]" />
                    </div>
                    <h1 className="text-3xl font-semibold text-black tracking-tight">
                        Voter login
                    </h1>
                    <p className="text-zinc-500 text-base">
                        Enter your registered phone number and date of birth
                    </p>
                </div>

                <Card className="border border-zinc-200 shadow-none">
                    <CardContent className="p-6 space-y-5">

                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-base">Phone number</Label>
                            <Input
                                id="phone"
                                placeholder="e.g. 0241234567"
                                className="h-11 text-base"
                                value={form.voter_phone}
                                onChange={e => setForm(p => ({ ...p, voter_phone: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="dob" className="text-base">Date of birth</Label>
                            <Input
                                id="dob"
                                type="date"
                                className="h-11 text-base"
                                value={form.voter_dob}
                                onChange={e => setForm(p => ({ ...p, voter_dob: e.target.value }))}
                            />
                        </div>

                        {error && <p className="text-base text-red-600" role="alert" aria-live="polite">{error}</p>}

                        <Button
                            className="w-full bg-black text-white hover:bg-zinc-800 h-11 text-base"
                            onClick={handleLogin}
                            disabled={loading}
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </Button>

                    </CardContent>
                </Card>

                <p className="text-center text-sm text-zinc-500">
                    Not registered yet?{' '}
                    <Link href="/vote" className="text-black underline underline-offset-2">
                        Register here
                    </Link>
                </p>

            </div>
        </main>
    )
}