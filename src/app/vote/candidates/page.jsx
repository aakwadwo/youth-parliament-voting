'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function CandidatesPage() {
    const router = useRouter()
    const [voter, setVoter] = useState(null)
    const [candidates, setCandidates] = useState([])
    const [selectedCandidate, setSelectedCandidate] = useState(null)
    const [step, setStep] = useState('candidates')
    const [loading, setLoading] = useState(false)
    const [candidatesLoading, setCandidatesLoading] = useState(true)
    const [candidatesError, setCandidatesError] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        let voterData
        try {
            const saved = sessionStorage.getItem('voter')
            if (!saved) { router.push('/vote'); return }
            voterData = JSON.parse(saved)
        } catch {
            router.push('/vote')
            return
        }
        setVoter(voterData)
        fetch(`/api/candidates?constituency_id=${voterData.constituency_id}`)
            .then(r => r.json())
            .then(setCandidates)
            .catch(() => setCandidatesError('Could not load candidates. Please refresh the page.'))
            .finally(() => setCandidatesLoading(false))
    }, [router])

    async function handleSubmit() {
        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidate_id: selectedCandidate.id }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (res.status === 409 || res.status === 401) {
                    // Voter has already voted, or their session expired after voting elsewhere.
                    // Either way they must not be able to re-enter the voting flow.
                    sessionStorage.removeItem('voter')
                    setStep('already-voted')
                } else {
                    setError(data.error)
                }
            } else {
                sessionStorage.removeItem('voter')
                setStep('success')
            }
        } catch {
            setError('Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    if (!voter) return null

    return (
        <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-10">
            <div className="max-w-4xl w-full space-y-6">

                {/* CANDIDATES */}
                {step === 'candidates' && (
                    <>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-semibold text-black">Cast your vote</h2>
                            <p className="text-zinc-500 text-sm sm:text-base mt-1">{voter.constituency_name}</p>
                        </div>

                        <div className="flex gap-3 bg-zinc-50 border border-zinc-200 rounded-lg p-3 sm:p-4">
                            <svg className="w-5 h-5 text-zinc-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <p className="text-sm text-zinc-500 leading-relaxed">
                                Your selection is private. No one — including administrators — can see who you voted for.
                            </p>
                        </div>

                        {candidatesError && <p className="text-base text-red-600" role="alert" aria-live="polite">{candidatesError}</p>}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            {candidatesLoading && (
                                <>
                                    <div className="h-32 sm:h-44 bg-zinc-100 rounded-xl animate-pulse" />
                                    <div className="h-32 sm:h-44 bg-zinc-100 rounded-xl animate-pulse" />
                                    <div className="h-32 sm:h-44 bg-zinc-100 rounded-xl animate-pulse" />
                                </>
                            )}
                            {!candidatesLoading && candidates.length === 0 && (
                                <p className="text-zinc-500 text-base col-span-full">No candidates found for this constituency.</p>
                            )}
                            {!candidatesLoading && candidates.map(candidate => (
                                <button
                                    key={candidate.id}
                                    onClick={() => setSelectedCandidate(prev => prev?.id === candidate.id ? null : candidate)}
                                    className={`flex sm:flex-col flex-row items-center sm:items-stretch rounded-xl border overflow-hidden transition-all text-left ${
                                        selectedCandidate?.id === candidate.id
                                            ? 'border-black ring-2 ring-black'
                                            : 'border-zinc-200 hover:border-zinc-400'
                                    }`}
                                >
                                    <div className="relative w-24 h-24 sm:w-full sm:h-auto sm:aspect-[3/4] bg-white overflow-hidden flex-shrink-0">
                                        {candidate.photo_url ? (
                                            <Image
                                                src={candidate.photo_url}
                                                alt={candidate.full_name}
                                                fill
                                                sizes="(min-width: 640px) 33vw, 96px"
                                                className="object-contain bg-white"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-end justify-center overflow-hidden">
                                                <svg viewBox="0 0 100 110" className="w-4/5 text-zinc-300" fill="currentColor">
                                                    <circle cx="50" cy="35" r="22" />
                                                    <ellipse cx="50" cy="100" rx="38" ry="30" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="px-3 py-2.5 flex items-center justify-between flex-1 bg-white">
                                        <span className="text-sm font-medium text-black leading-tight">{candidate.full_name}</span>
                                        {selectedCandidate?.id === candidate.id && (
                                            <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center flex-shrink-0 ml-2">
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1 h-11 text-base"
                                onClick={() => router.push('/vote')}
                            >
                                Back
                            </Button>
                            <Button
                                className="flex-1 h-11 text-base bg-black text-white hover:bg-zinc-800"
                                disabled={!selectedCandidate}
                                onClick={() => setStep('confirm')}
                            >
                                Continue
                            </Button>
                        </div>
                    </>
                )}

                {/* CONFIRM */}
                {step === 'confirm' && (
                    <Card className="border border-zinc-200 shadow-none">
                        <CardContent className="p-4 sm:p-6 space-y-5">

                            <div>
                                <h2 className="text-xl sm:text-2xl font-semibold text-black">Review your ballot</h2>
                                <p className="text-zinc-500 text-sm sm:text-base mt-1">Once submitted this cannot be changed.</p>
                            </div>

                            <div className="space-y-1 text-base">
                                <div className="flex justify-between py-3 border-b border-zinc-100">
                                    <span className="text-zinc-500">Constituency</span>
                                    <span className="text-black font-medium text-right ml-4">{voter.constituency_name}</span>
                                </div>
                                <div className="flex justify-between py-3">
                                    <span className="text-zinc-500">Candidate</span>
                                    <span className="text-black font-medium text-right ml-4">{selectedCandidate?.full_name}</span>
                                </div>
                            </div>

                            <div className="flex gap-3 bg-zinc-50 border border-zinc-200 rounded-lg p-3 sm:p-4">
                                <svg className="w-5 h-5 text-[#006B3F] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                <p className="text-sm text-zinc-500 leading-relaxed">
                                    Your vote is anonymous and securely recorded. Your identity will never be linked to your candidate choice.
                                </p>
                            </div>

                            {error && <p className="text-base text-red-600" role="alert" aria-live="polite">{error}</p>}

                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1 h-11 text-base"
                                    onClick={() => { setStep('candidates'); setError('') }}
                                >
                                    Back
                                </Button>
                                <Button
                                    className="flex-1 h-11 text-base bg-[#006B3F] text-white hover:bg-[#005a34]"
                                    onClick={handleSubmit}
                                    disabled={loading}
                                >
                                    {loading ? 'Submitting...' : 'Submit vote'}
                                </Button>
                            </div>

                        </CardContent>
                    </Card>
                )}

                {/* SUCCESS */}
                {step === 'success' && (
                    <div className="text-center space-y-6">

                        <div className="flex justify-center">
                            <div className="h-2 w-16 sm:w-20 bg-[#CF0A0A]" />
                            <div className="h-2 w-16 sm:w-20 bg-[#FCD20F]" />
                            <div className="h-2 w-16 sm:w-20 bg-[#006B3F]" />
                        </div>

                        <div className="w-16 h-16 rounded-full bg-[#006B3F] flex items-center justify-center mx-auto">
                            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>

                        <div className="space-y-2">
                            <h2 className="text-2xl font-semibold text-black">Your vote has been cast</h2>
                            <p className="text-zinc-500 text-base leading-relaxed">
                                Thank you, <span className="text-black font-medium">{voter.voter_name}</span>.
                                Your vote in <span className="text-black font-medium">{voter.constituency_name}</span> has been securely recorded.
                            </p>
                        </div>

                        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 sm:p-5 text-left space-y-3">
                            <p className="text-sm font-medium text-zinc-700">What happens next</p>
                            <ul className="text-sm text-zinc-500 space-y-2">
                                <li>— Your ballot is stored securely</li>
                                <li>— No one can see who you voted for</li>
                                <li>— Results will be announced after voting closes</li>
                            </ul>
                        </div>

                        <p className="text-sm text-zinc-500">You may now close this tab.</p>

                    </div>
                )}

                {/* ALREADY VOTED */}
                {step === 'already-voted' && (
                    <div className="text-center space-y-6">

                        <div className="flex justify-center">
                            <div className="h-2 w-16 sm:w-20 bg-[#CF0A0A]" />
                            <div className="h-2 w-16 sm:w-20 bg-[#FCD20F]" />
                            <div className="h-2 w-16 sm:w-20 bg-[#006B3F]" />
                        </div>

                        <div className="space-y-2">
                            <h2 className="text-2xl font-semibold text-black">You have already voted</h2>
                            <p className="text-zinc-500 text-base leading-relaxed">
                                Our records show a vote has already been recorded for this voter. You cannot vote again.
                            </p>
                        </div>

                        <Button
                            className="w-full h-11 text-base"
                            variant="outline"
                            onClick={() => router.push('/')}
                        >
                            Back to home
                        </Button>

                    </div>
                )}

            </div>
        </main>
    )
}