'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Plus, ArrowLeft, Search, RefreshCw, FileDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { StatusPill } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { DataTable } from '@/components/ui/data-table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ConstituencyCombobox } from '@/components/ConstituencyCombobox'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { useFetch } from '@/lib/useFetch'
import { downloadExport } from '@/lib/download'
import { isValidName } from '@/lib/validation'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function Candidates() {
    const {
        data: candidates,
        loading,
        error: loadError,
        setError: setLoadError,
        reload: reloadCandidates,
    } = useFetch('/api/admin/candidates', {
        initialData: [],
        errorMessage: 'Could not load candidates.',
    })

    const {
        data: constituencies,
        loading: constituenciesLoading,
        error: constituenciesError,
    } = useFetch('/api/admin/constituencies', {
        initialData: [],
        errorMessage: 'Could not load constituencies.',
    })

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [view, setView] = useState('list')
    const [form, setForm] = useState({ full_name: '', constituency_id: '', constituency_name: '' })
    const [photo, setPhoto] = useState(null)
    const [photoPreview, setPhotoPreview] = useState(null)
    const [fieldErrors, setFieldErrors] = useState({})
    const [formError, setFormError] = useState('')
    const [formLoading, setFormLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')
    const [pendingToggle, setPendingToggle] = useState(null)
    const [toggling, setToggling] = useState(false)
    const [downloadingList, setDownloadingList] = useState(false)
    // Its own error rather than the list's: "could not load candidates", with a
    // reload button beside it, is the wrong thing to say when the candidates
    // loaded perfectly well and it was the PDF that failed.
    const [downloadError, setDownloadError] = useState('')

    /**
     * The register PDF is built from the database, not from the rows currently
     * in this table — the table paginates and filters in the browser, and a
     * register that only contained the page an administrator happened to be
     * looking at would be silently wrong in the one way that matters.
     */
    async function handleDownloadList() {
        setDownloadingList(true)
        setDownloadError('')
        const result = await downloadExport(
            '/api/admin/candidates/export?format=pdf',
            'candidate-list.pdf'
        )
        if (!result.ok) setDownloadError(result.error)
        setDownloadingList(false)
    }

    function handlePhotoChange(event) {
        const file = event.target.files?.[0]
        if (!file) return

        // Validated here as well as server-side so the administrator finds out
        // before waiting through an upload that was always going to be refused.
        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
            setFieldErrors((p) => ({ ...p, photo: 'Choose a JPEG, PNG or WebP image.' }))
            return
        }
        if (file.size > MAX_PHOTO_BYTES) {
            setFieldErrors((p) => ({ ...p, photo: 'Image must be 5MB or smaller.' }))
            return
        }

        setFieldErrors((p) => ({ ...p, photo: null }))
        setPhoto(file)
        setPhotoPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return URL.createObjectURL(file)
        })
    }

    function resetForm() {
        setForm({ full_name: '', constituency_id: '', constituency_name: '' })
        setPhoto(null)
        setPhotoPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return null
        })
        setFieldErrors({})
        setFormError('')
    }

    async function handleAdd(event) {
        event.preventDefault()

        const errors = {}
        if (!isValidName(form.full_name)) {
            errors.full_name = 'Enter the candidate’s full name.'
        }
        if (!form.constituency_id) {
            errors.constituency_id = 'Select the constituency they are standing in.'
        }
        setFieldErrors((p) => ({ ...p, ...errors }))
        if (Object.keys(errors).length > 0) return

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
                if (!uploadRes.ok) {
                    setFormError(uploadData.error ?? 'Could not upload the photo.')
                    return
                }
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
                setFormError(data.error ?? 'Could not add the candidate.')
                return
            }

            resetForm()
            setView('list')
            setSuccessMessage(`${data.full_name} added successfully.`)
            reloadCandidates()
        } catch {
            setFormError('Could not reach the server. Please try again.')
        } finally {
            setFormLoading(false)
        }
    }

    async function confirmToggle() {
        const candidate = pendingToggle
        if (!candidate) return

        setToggling(true)
        try {
            const res = await fetch(`/api/admin/candidates/${candidate.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !candidate.is_active }),
            })
            if (!res.ok) throw new Error()
            setSuccessMessage(
                `${candidate.full_name} ${candidate.is_active ? 'withdrawn from' : 'restored to'} the ballot.`
            )
            reloadCandidates()
        } catch {
            // This previously called a setter useFetch never returned, so the
            // failure threw a ReferenceError instead of showing a message.
            setLoadError('Could not update the candidate. Please try again.')
        } finally {
            setToggling(false)
            setPendingToggle(null)
        }
    }

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase()
        return candidates.filter((c) => {
            if (statusFilter === 'active' && !c.is_active) return false
            if (statusFilter === 'inactive' && c.is_active) return false
            if (!term) return true
            return (
                c.full_name.toLowerCase().includes(term) ||
                (c.constituencies?.name ?? '').toLowerCase().includes(term)
            )
        })
    }, [candidates, search, statusFilter])

    const activeCount = candidates.filter((c) => c.is_active).length

    const columns = [
        {
            key: 'candidate',
            header: 'Candidate',
            primary: true,
            cell: (c) => (
                <div className="flex items-center gap-3">
                    <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                        {c.photo_url ? (
                            <Image
                                src={c.photo_url}
                                alt=""
                                fill
                                sizes="36px"
                                className="object-cover"
                            />
                        ) : (
                            <span
                                aria-hidden="true"
                                className="flex size-full items-center justify-center text-xs font-semibold text-muted-foreground"
                            >
                                {c.full_name.charAt(0)}
                            </span>
                        )}
                    </span>
                    <span className="font-medium">{c.full_name}</span>
                </div>
            ),
        },
        {
            key: 'constituency',
            header: 'Constituency',
            cell: (c) => (
                <span className="text-muted-foreground">{c.constituencies?.name ?? 'Not set'}</span>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            cell: (c) => (
                <StatusPill variant={c.is_active ? 'success' : 'neutral'}>
                    {c.is_active ? 'Standing' : 'Withdrawn'}
                </StatusPill>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (c) => (
                <Button
                    variant={c.is_active ? 'destructive-soft' : 'outline'}
                    size="sm"
                    onClick={() => setPendingToggle(c)}
                >
                    {c.is_active ? 'Withdraw' : 'Restore'}
                    <span className="sr-only"> {c.full_name}</span>
                </Button>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <SectionHeader
                title="Candidates"
                description={`${candidates.length} on file · ${activeCount} standing`}
                actions={
                    view === 'list' ? (
                        <>
                            {/* Sits beside the candidate list rather than only
                                under Reports, because this is the screen an
                                administrator is on when they decide they want
                                the register on paper. */}
                            <Button
                                variant="outline"
                                onClick={handleDownloadList}
                                disabled={candidates.length === 0}
                                pending={downloadingList}
                                pendingLabel="Building…"
                            >
                                {downloadingList ? null : <FileDown aria-hidden="true" />}
                                Download list (PDF)
                            </Button>
                            <Button onClick={() => setView('add')}>
                                <Plus aria-hidden="true" />
                                Add candidate
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setView('list')
                                resetForm()
                            }}
                        >
                            <ArrowLeft aria-hidden="true" />
                            Back to list
                        </Button>
                    )
                }
            />

            {successMessage ? (
                <Alert variant="success" title="Saved">
                    {successMessage}
                </Alert>
            ) : null}

            {downloadError ? (
                <Alert variant="danger" title="Download failed">
                    {downloadError}
                </Alert>
            ) : null}

            {view === 'list' ? (
                <div className="space-y-4">
                    {loadError ? (
                        <Alert variant="danger" title="Could not load candidates">
                            <p>{loadError}</p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-3"
                                onClick={reloadCandidates}
                                pending={loading}
                            >
                                {loading ? null : <RefreshCw aria-hidden="true" />}
                                Try again
                            </Button>
                        </Alert>
                    ) : null}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative flex-1 sm:max-w-sm">
                            <Search
                                aria-hidden="true"
                                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                            />
                            <Input
                                type="search"
                                className="pl-9"
                                placeholder="Search name or constituency"
                                aria-label="Search candidates"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <div
                            role="group"
                            aria-label="Filter by status"
                            className="flex rounded-lg border border-border-strong bg-background p-0.5"
                        >
                            {[
                                ['all', 'All'],
                                ['active', 'Standing'],
                                ['inactive', 'Withdrawn'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={statusFilter === value}
                                    onClick={() => setStatusFilter(value)}
                                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex-none ${
                                        statusFilter === value
                                            ? 'bg-secondary text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <p className="text-sm text-muted-foreground" aria-live="polite">
                        Showing {filtered.length} of {candidates.length} candidates
                    </p>

                    <DataTable
                        caption="Candidates and the constituencies they are standing in"
                        columns={columns}
                        rows={filtered}
                        getRowKey={(c) => c.id}
                        loading={loading}
                        empty={
                            <EmptyState
                                title={
                                    candidates.length === 0
                                        ? 'No candidates yet'
                                        : 'No candidates match those filters'
                                }
                                description={
                                    candidates.length === 0
                                        ? 'Add the candidates standing in each constituency before opening voting.'
                                        : 'Try a different search term or clear the status filter.'
                                }
                                action={
                                    candidates.length === 0 ? (
                                        <Button onClick={() => setView('add')}>
                                            <Plus aria-hidden="true" />
                                            Add candidate
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setSearch('')
                                                setStatusFilter('all')
                                            }}
                                        >
                                            Clear filters
                                        </Button>
                                    )
                                }
                            />
                        }
                    />
                </div>
            ) : null}

            {view === 'add' ? (
                <Card className="max-w-xl">
                    <CardContent>
                        <form onSubmit={handleAdd} noValidate className="space-y-5">
                            <Field
                                id="candidate_name"
                                label="Full name"
                                required
                                error={fieldErrors.full_name}
                            >
                                <Input
                                    placeholder="e.g. Kwame Mensah"
                                    autoComplete="off"
                                    value={form.full_name}
                                    onChange={(e) => {
                                        setForm((p) => ({ ...p, full_name: e.target.value }))
                                        setFieldErrors((p) => ({ ...p, full_name: null }))
                                    }}
                                />
                            </Field>

                            <Field
                                id="candidate_constituency"
                                label="Constituency"
                                required
                                error={fieldErrors.constituency_id ?? constituenciesError}
                            >
                                {(controlProps) => (
                                    <ConstituencyCombobox
                                        {...controlProps}
                                        constituencies={constituencies}
                                        loading={constituenciesLoading}
                                        value={form.constituency_id}
                                        onChange={(c) => {
                                            setForm((p) => ({
                                                ...p,
                                                constituency_id: c.id,
                                                constituency_name: c.name,
                                            }))
                                            setFieldErrors((p) => ({
                                                ...p,
                                                constituency_id: null,
                                            }))
                                        }}
                                    />
                                )}
                            </Field>

                            <Field
                                id="candidate_photo"
                                label="Photograph"
                                optional
                                hint="JPEG, PNG or WebP, up to 5MB. Shown to voters on the ballot."
                                error={fieldErrors.photo}
                            >
                                <Input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={handlePhotoChange}
                                />
                            </Field>

                            {photoPreview ? (
                                <div className="flex items-center gap-3">
                                    <span className="relative size-20 overflow-hidden rounded-lg border border-border">
                                        {/* A local blob: URL — the image optimizer
                                            cannot fetch it, hence unoptimized. */}
                                        <Image
                                            src={photoPreview}
                                            alt="Selected candidate photograph"
                                            fill
                                            sizes="80px"
                                            unoptimized
                                            className="object-cover"
                                        />
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setPhoto(null)
                                            setPhotoPreview((prev) => {
                                                if (prev) URL.revokeObjectURL(prev)
                                                return null
                                            })
                                        }}
                                    >
                                        Remove photo
                                    </Button>
                                </div>
                            ) : null}

                            {formError ? (
                                <Alert variant="danger" title="Could not add candidate">
                                    {formError}
                                </Alert>
                            ) : null}

                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setView('list')
                                        resetForm()
                                    }}
                                    disabled={formLoading}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    pending={formLoading}
                                    pendingLabel="Adding…"
                                >
                                    Add candidate
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : null}

            <ConfirmDialog
                open={Boolean(pendingToggle)}
                onOpenChange={(open) => !open && setPendingToggle(null)}
                title={
                    pendingToggle?.is_active
                        ? `Withdraw ${pendingToggle?.full_name}?`
                        : `Restore ${pendingToggle?.full_name}?`
                }
                description={
                    pendingToggle?.is_active
                        ? 'They will be removed from the ballot immediately. Ballots already cast for them are not affected and still count.'
                        : 'They will appear on the ballot in their constituency again.'
                }
                warning={
                    pendingToggle?.is_active
                        ? 'Voters currently choosing a candidate will see this change at once.'
                        : null
                }
                confirmLabel={pendingToggle?.is_active ? 'Withdraw candidate' : 'Restore candidate'}
                tone={pendingToggle?.is_active ? 'destructive' : 'default'}
                pending={toggling}
                onConfirm={confirmToggle}
            />
        </div>
    )
}
