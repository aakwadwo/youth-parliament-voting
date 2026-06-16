'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function AdminLoginPage() {
    const router = useRouter()
    const [form, setForm] = useState({ email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleLogin() {
        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error)
            } else {
                router.push('/admin')
            }
        } catch {
            setError('Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
            <div className="max-w-sm w-full space-y-8">

                <div className="text-center space-y-2">
                    <div className="flex justify-center">
                        <div className="h-1.5 w-10 bg-[#CF0A0A]" />
                        <div className="h-1.5 w-10 bg-[#FCD20F]" />
                        <div className="h-1.5 w-10 bg-[#006B3F]" />
                    </div>
                    <h1 className="text-2xl font-semibold text-black">Admin portal</h1>
                    <p className="text-zinc-500 text-sm">Youth Parliament Ghana</p>
                </div>

                <Card className="border border-zinc-200 shadow-none">
                    <CardContent className="p-6 space-y-5">

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-base">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@youthparliament.gh"
                                className="h-11 text-base"
                                value={form.email}
                                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-base">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                className="h-11 text-base"
                                value={form.password}
                                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                            />
                        </div>

                        {error && <p className="text-base text-red-600">{error}</p>}

                        <Button
                            className="w-full bg-black text-white hover:bg-zinc-800 h-11 text-base"
                            onClick={handleLogin}
                            disabled={loading}
                        >
                            {loading ? 'Signing in...' : 'Sign in'}
                        </Button>

                    </CardContent>
                </Card>

                <p className="text-center text-xs text-zinc-400">
                    Restricted access. Authorised personnel only.
                </p>

            </div>
        </main>
    )
}