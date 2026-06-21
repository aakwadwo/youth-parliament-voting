'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { ConstituencyCombobox } from '@/components/ConstituencyCombobox'
import { useFetch } from '@/lib/useFetch'

export default function Candidates() {
    const { data: candidates, loading, error: loadError, reload: loadCandidates } = useFetch('/api/admin/candidates', {
        initialData: [],
        errorMessage: 'Could not load candidates. Please refresh the page.',
    })
    const { data: constituencies, error: constituenciesError } = useFetch('/api/admin/constituencies', {
        initialData: [],
        errorMessage: 'Could not load constituencies. Please refresh the page.',
    })
    const [search, setSearch] = useState('')
    const [view, setView] = useState('list') // list | add
    const [form, setForm] = useState({ full_name: '', constituency_id: '', constituency_name: '' })
    const [photo, setPhoto] = useState(null)
    const [photoPreview, setPhotoPreview] = useState(null)
    const [formError, setFormError] = useState('')
    const [formLoading, setFormLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')
    const [confirmingId, setConfirmingId] = useState(null)

    function handlePhotoChange(e) {
        const file = e.target.files[0]
        if (!file) return
        setPhoto(file)
        setPhotoPreview(URL.createObjectURL(file))
    }

    async function handleAdd() {
        if (!form.full_name.trim()) { setFormError('Name is required'); return }
        if (!form.constituency_id) { setFormError('Constituency is required'); return }

        setFormLoading(true)
        setFormError('')

        try {
            let photo_url = null

            if (photo) {
                const formData = new FormData()
                formData.append('file', photo)
                formData.append('candidate_name', form.full_name)
                const uploadRes = await fetch('/api/admin/candidates/upload', {
                    method: 'POST',
                    body: formData,
                })
                const uploadData = await uploadRes.json()
                if (!uploadRes.ok) { setFormError(uploadData.error); return }
                photo_url = uploadData.url
            }

            const res = await fetch('/api/admin/candidates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: form.full_name,
                    constituency_id: form.constituency_id,
                    photo_url,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setFormError(data.error)
            } else {
                setForm({ full_name: '', constituency_id: '', constituency_name: '' })
                setPhoto(null)
                setPhotoPreview(null)
                setView('list')
                setSuccessMessage('Candidate added successfully')
                loadCandidates()
                setTimeout(() => setSuccessMessage(''), 3000)
            }
        } catch {
            setFormError('Something went wrong. Please try again.')
        } finally {
            setFormLoading(false)
        }
    }

    async function toggleActive(candidate) {
        setConfirmingId(null)
        try {
            const res = await fetch(`/api/admin/candidates/${candidate.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !candidate.is_active }),
            })
            if (!res.ok) throw new Error()
            loadCandidates()
        } catch {
            setLoadError('Could not update candidate status. Please try again.')
        }
    }

    const filtered = candidates.filter(c =>
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        c.constituencies?.name?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Candidates</h1>
                    <p className="text-zinc-500 text-sm mt-1">{candidates.length} total</p>
                </div>
                {view === 'list' ? (
                    <Button
                        className="bg-black text-white hover:bg-zinc-800 text-sm"
                        onClick={() => setView('add')}
                    >
                        Add candidate
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        className="text-sm"
                        onClick={() => { setView('list'); setFormError(''); setPhotoPreview(null) }}
                    >
                        Back to list
                    </Button>
                )}
            </div>

            {/* Success message */}
            {successMessage && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-[#006B3F]">
                    {successMessage}
                </div>
            )}

            {/* LIST */}
            {view === 'list' && (
                <div className="space-y-4">
                    {loadError && <p className="text-sm text-red-600" role="alert" aria-live="polite">{loadError}</p>}
                    <Input
                        placeholder="Search by name or constituency..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="max-w-sm h-10"
                    />
                    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="border-b border-zinc-100">
                                <th className="text-left px-5 py-3 text-zinc-500 font-medium">Candidate</th>
                                <th className="text-left px-5 py-3 text-zinc-500 font-medium">Constituency</th>
                                <th className="text-left px-5 py-3 text-zinc-500 font-medium">Status</th>
                                <th className="text-left px-5 py-3 text-zinc-500 font-medium"></th>
                            </tr>
                            </thead>
                            <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={4} className="px-5 py-8 text-center text-zinc-500">Loading...</td>
                                </tr>
                            )}
                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-5 py-8 text-center text-zinc-500">No candidates found</td>
                                </tr>
                            )}
                            {!loading && filtered.map((c, i) => (
                                <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="relative w-8 h-8 rounded-full bg-zinc-100 overflow-hidden flex-shrink-0">
                                                {c.photo_url ? (
                                                    <Image src={c.photo_url} alt={c.full_name} fill sizes="32px" className="object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs font-semibold">
                                                        {c.full_name.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="font-medium text-black">{c.full_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-zinc-500">{c.constituencies?.name}</td>
                                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.is_active
                              ? 'bg-green-50 text-[#006B3F] border border-green-200'
                              : 'bg-zinc-100 text-zinc-500 border border-zinc-200'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${c.is_active ? 'bg-[#006B3F]' : 'bg-zinc-400'}`} />
                          {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                                    </td>
                                    <td className="px-5 py-3">
                                        {confirmingId === c.id ? (
                                            <div className="flex items-center gap-2 whitespace-nowrap">
                                                <span className="text-xs text-zinc-500">Sure?</span>
                                                <button
                                                    onClick={() => toggleActive(c)}
                                                    className="text-xs font-medium text-black underline underline-offset-2"
                                                >
                                                    Confirm
                                                </button>
                                                <button
                                                    onClick={() => setConfirmingId(null)}
                                                    className="text-xs text-zinc-500 underline underline-offset-2"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmingId(c.id)}
                                                className="text-xs text-zinc-500 hover:text-black underline underline-offset-2"
                                            >
                                                {c.is_active ? 'Deactivate' : 'Activate'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ADD */}
            {view === 'add' && (
                <Card className="max-w-md border border-zinc-200 shadow-none">
                    <CardContent className="p-6 space-y-5">

                        <div className="space-y-2">
                            <Label className="text-base">Full name</Label>
                            <Input
                                placeholder="e.g. Kwame Mensah"
                                className="h-11"
                                value={form.full_name}
                                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base">Constituency</Label>
                            <ConstituencyCombobox
                                constituencies={constituencies}
                                value={form.constituency_id}
                                onChange={c => setForm(p => ({ ...p, constituency_id: c.id, constituency_name: c.name }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base">Photo (optional)</Label>
                            <Input
                                type="file"
                                accept="image/*"
                                className="h-11"
                                onChange={handlePhotoChange}
                            />
                            {photoPreview && (
                                <div className="relative w-20 h-20 rounded-full overflow-hidden border border-zinc-200 mt-2">
                                    {/* local blob: preview, not a remote URL — next/image's optimizer can't fetch it */}
                                    <Image src={photoPreview} alt="Preview" fill sizes="80px" unoptimized className="object-cover" />
                                </div>
                            )}
                        </div>

                        {constituenciesError && <p className="text-sm text-red-600" role="alert" aria-live="polite">{constituenciesError}</p>}
                        {formError && <p className="text-sm text-red-600" role="alert" aria-live="polite">{formError}</p>}

                        <Button
                            className="w-full bg-black text-white hover:bg-zinc-800 h-11"
                            onClick={handleAdd}
                            disabled={formLoading}
                        >
                            {formLoading ? 'Adding...' : 'Add candidate'}
                        </Button>

                    </CardContent>
                </Card>
            )}

        </div>
    )
}