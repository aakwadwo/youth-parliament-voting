'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Alert, LiveRegion } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/feedback'
import { BrandMark, TricolourRule } from '@/components/brand/BrandMark'
import { ELECTION_NAME } from '@/lib/election'

function AdminLoginForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [form, setForm] = useState({ email: '', password: '' })
    const [errors, setErrors] = useState({})
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(event) {
        event.preventDefault()

        const nextErrors = {}
        if (!form.email.trim()) nextErrors.email = 'Enter your email address.'
        if (!form.password) nextErrors.password = 'Enter your password.'
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return

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
                setError(data.error ?? 'Could not sign you in.')
                return
            }

            // Return the administrator to the section they were trying to reach.
            // Only same-site paths are honoured, so a crafted ?next= cannot turn
            // this into an open redirect.
            const next = searchParams.get('next')
            const destination = next && next.startsWith('/admin') ? next : '/admin'
            router.push(destination)
        } catch {
            setError('Could not reach the server. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-dvh flex-col bg-surface">
            <TricolourRule />

            <main
                id="main"
                className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6"
            >
                <div className="w-full max-w-sm space-y-6">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <BrandMark height={52} priority />
                        <div className="space-y-1">
                            <h1 className="text-title font-semibold">Admin portal</h1>
                            <p className="text-sm text-muted-foreground">{ELECTION_NAME}</p>
                        </div>
                    </div>

                    <Card>
                        <CardContent>
                            <form onSubmit={handleSubmit} noValidate className="space-y-5">
                                <Field
                                    id="email"
                                    label="Email address"
                                    required
                                    error={errors.email}
                                >
                                    <Input
                                        type="email"
                                        name="email"
                                        autoComplete="username"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        enterKeyHint="next"
                                        value={form.email}
                                        onChange={(e) => {
                                            setForm((p) => ({ ...p, email: e.target.value }))
                                            setErrors((p) => ({ ...p, email: null }))
                                        }}
                                    />
                                </Field>

                                <Field
                                    id="password"
                                    label="Password"
                                    required
                                    error={errors.password}
                                >
                                    <Input
                                        type="password"
                                        name="password"
                                        autoComplete="current-password"
                                        enterKeyHint="go"
                                        value={form.password}
                                        onChange={(e) => {
                                            setForm((p) => ({ ...p, password: e.target.value }))
                                            setErrors((p) => ({ ...p, password: null }))
                                        }}
                                    />
                                </Field>

                                {error ? (
                                    <Alert variant="danger" title="Sign-in failed">
                                        {error}
                                    </Alert>
                                ) : null}

                                <Button
                                    type="submit"
                                    size="lg"
                                    className="w-full"
                                    disabled={loading}
                                >
                                    {loading ? <Spinner /> : null}
                                    {loading ? 'Signing in…' : 'Sign in'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <p className="text-center text-xs text-muted-foreground">
                        Restricted access. All sign-in attempts are recorded.
                    </p>

                    <LiveRegion message={loading ? 'Signing in' : ''} />
                </div>
            </main>
        </div>
    )
}

export default function AdminLoginPage() {
    return (
        <Suspense fallback={null}>
            <AdminLoginForm />
        </Suspense>
    )
}
