'use client'

import { useMemo, useState } from 'react'
import { Plus, ArrowLeft, Search, Upload, RefreshCw, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Spinner } from '@/components/ui/feedback'
import { DataTable } from '@/components/ui/data-table'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { EditNameDialog } from '@/components/admin/EditNameDialog'
import { useFetch } from '@/lib/useFetch'
import { normaliseName } from '@/lib/validation'

const MAX_IMPORT_ROWS = 500

/**
 * Parses a CSV of `name,region,code`.
 *
 * The previous parser split every line on a bare comma, which silently
 * corrupted any constituency whose name contains one — and it dropped invalid
 * rows without telling anyone, so a 275-row import could quietly land 240 rows
 * and report success. This one honours RFC 4180 quoting and reports exactly
 * which lines it rejected and why.
 */
export function parseConstituencyCsv(text) {
    const rows = []
    const errors = []

    const lines = text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .filter((line) => line.trim() !== '')

    if (lines.length === 0) return { rows, errors: ['The file is empty.'] }

    // Skip a header row if one is present.
    const startIndex = /^\s*"?name"?\s*,/i.test(lines[0]) ? 1 : 0

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i]
        const cells = []
        let current = ''
        let inQuotes = false

        for (let c = 0; c < line.length; c++) {
            const char = line[c]
            if (inQuotes) {
                if (char === '"') {
                    if (line[c + 1] === '"') {
                        current += '"'
                        c++
                    } else {
                        inQuotes = false
                    }
                } else {
                    current += char
                }
            } else if (char === '"') {
                inQuotes = true
            } else if (char === ',') {
                cells.push(current)
                current = ''
            } else {
                current += char
            }
        }
        cells.push(current)

        const [name = '', region = '', code = ''] = cells.map((c) => c.trim())
        const codeNum = Number.parseInt(code, 10)

        if (!name || !region || !Number.isInteger(codeNum) || codeNum < 0) {
            errors.push(`Line ${i + 1}: needs a name, a region and a whole-number code.`)
            continue
        }

        rows.push({ name, region, code: codeNum })
    }

    return { rows, errors }
}

export default function Constituencies() {
    const {
        data: constituencies,
        loading,
        error: loadError,
        reload,
    } = useFetch('/api/admin/constituencies', {
        initialData: [],
        errorMessage: 'Could not load constituencies.',
    })

    const [search, setSearch] = useState('')
    const [regionFilter, setRegionFilter] = useState('all')
    const [view, setView] = useState('list')
    const [form, setForm] = useState({ name: '', region: '', code: '' })
    const [fieldErrors, setFieldErrors] = useState({})
    const [formError, setFormError] = useState('')
    const [formLoading, setFormLoading] = useState(false)
    const [csvError, setCsvError] = useState('')
    const [csvWarnings, setCsvWarnings] = useState([])
    const [csvLoading, setCsvLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')
    // The constituency whose name is being corrected, or null.
    const [editing, setEditing] = useState(null)
    const [editSaving, setEditSaving] = useState(false)
    const [editError, setEditError] = useState('')

    const regions = useMemo(
        () => [...new Set(constituencies.map((c) => c.region).filter(Boolean))].sort(),
        [constituencies]
    )

    async function handleAdd(event) {
        event.preventDefault()

        const errors = {}
        if (!form.name.trim()) errors.name = 'Enter the constituency name.'
        if (!form.region.trim()) errors.region = 'Enter the region.'
        const codeNum = Number.parseInt(form.code, 10)
        if (!Number.isInteger(codeNum) || codeNum < 0) {
            errors.code = 'Enter a whole-number code, e.g. 1.'
        }

        setFieldErrors(errors)
        if (Object.keys(errors).length > 0) return

        setFormLoading(true)
        setFormError('')
        try {
            const res = await fetch('/api/admin/constituencies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, code: codeNum }),
            })
            const data = await res.json()
            if (!res.ok) {
                setFormError(data.error ?? 'Could not add the constituency.')
                return
            }
            setForm({ name: '', region: '', code: '' })
            setFieldErrors({})
            setView('list')
            setSuccessMessage(`${data.name} added successfully.`)
            reload()
        } catch {
            setFormError('Could not reach the server. Please try again.')
        } finally {
            setFormLoading(false)
        }
    }

    async function handleCsv(event) {
        const file = event.target.files?.[0]
        if (!file) return

        setCsvError('')
        setCsvWarnings([])
        setCsvLoading(true)

        try {
            const { rows, errors } = parseConstituencyCsv(await file.text())

            if (rows.length === 0) {
                setCsvError(
                    errors[0] ?? 'No valid rows found. Check the columns are name, region, code.'
                )
                return
            }
            if (rows.length > MAX_IMPORT_ROWS) {
                setCsvError(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`)
                return
            }

            const res = await fetch('/api/admin/constituencies/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ constituencies: rows }),
            })
            const data = await res.json()

            if (!res.ok) {
                setCsvError(data.error ?? 'Could not import the file.')
                return
            }

            // Skipped rows are reported rather than silently dropped.
            setCsvWarnings(errors)
            setView('list')
            setSuccessMessage(
                `${data.count} constituencies imported.` +
                    (errors.length > 0 ? ` ${errors.length} row(s) were skipped.` : '')
            )
            reload()
        } catch {
            setCsvError('Could not read the file. Please try again.')
        } finally {
            setCsvLoading(false)
            event.target.value = ''
        }
    }

    /**
     * Saves a corrected constituency name.
     *
     * PATCHes the existing row by id, so the constituency keeps its id, its
     * code, its region and every candidate and registration pointing at it. A
     * rename is a rename, never a new constituency.
     */
    async function handleEditSave(name) {
        const constituency = editing
        if (!constituency) return

        setEditSaving(true)
        setEditError('')
        try {
            const res = await fetch(`/api/admin/constituencies/${constituency.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            })
            const data = await res.json()

            if (!res.ok) {
                setEditError(data.error ?? 'Could not rename the constituency.')
                return
            }

            setEditing(null)
            setSuccessMessage(
                constituency.name === data.constituency.name
                    ? `${data.constituency.name} is unchanged.`
                    : `“${constituency.name}” renamed to “${data.constituency.name}”.`
            )
            reload()
        } catch {
            setEditError('Could not reach the server. Please try again.')
        } finally {
            setEditSaving(false)
        }
    }

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase()
        return constituencies.filter((c) => {
            if (regionFilter !== 'all' && c.region !== regionFilter) return false
            if (!term) return true
            return (
                c.name.toLowerCase().includes(term) ||
                (c.region ?? '').toLowerCase().includes(term) ||
                String(c.code).includes(term)
            )
        })
    }, [constituencies, search, regionFilter, ])

    const columns = [
        {
            key: 'name',
            header: 'Constituency',
            primary: true,
            cell: (c) => (
                <span className="flex flex-col">
                    <span className="font-medium">{c.name}</span>
                    <span className="numeric text-xs text-muted-foreground">Code {c.code}</span>
                </span>
            ),
        },
        {
            key: 'region',
            header: 'Region',
            cell: (c) => <span className="text-muted-foreground">{c.region}</span>,
        },
        {
            key: 'candidates',
            header: 'Candidates',
            align: 'right',
            cell: (c) => {
                const count = c.candidates?.[0]?.count ?? 0
                return (
                    <Badge variant={count > 0 ? 'success' : 'warning'}>
                        {count} {count === 1 ? 'candidate' : 'candidates'}
                    </Badge>
                )
            },
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (c) => (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setEditError('')
                        setEditing(c)
                    }}
                >
                    <Pencil aria-hidden="true" />
                    Edit
                    {/* The visible label is the same on every row, so the row's
                        own name is what tells a screen-reader user which
                        constituency this button belongs to. */}
                    <span className="sr-only"> name of {c.name}</span>
                </Button>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <SectionHeader
                title="Constituencies"
                description={`${constituencies.length} constituencies across ${regions.length} regions`}
                actions={
                    view === 'list' ? (
                        <>
                            <Button variant="outline" onClick={() => setView('import')}>
                                <Upload aria-hidden="true" />
                                Import CSV
                            </Button>
                            <Button onClick={() => setView('add')}>
                                <Plus aria-hidden="true" />
                                Add constituency
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setView('list')
                                setFormError('')
                                setCsvError('')
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

            {csvWarnings.length > 0 ? (
                <Alert variant="warning" title={`${csvWarnings.length} row(s) were skipped`}>
                    <ul className="mt-1 list-inside list-disc space-y-0.5">
                        {csvWarnings.slice(0, 5).map((w) => (
                            <li key={w}>{w}</li>
                        ))}
                    </ul>
                    {csvWarnings.length > 5 ? (
                        <p className="mt-1">…and {csvWarnings.length - 5} more.</p>
                    ) : null}
                </Alert>
            ) : null}

            {view === 'list' ? (
                <div className="space-y-4">
                    {loadError ? (
                        <Alert variant="danger" title="Could not load constituencies">
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
                    ) : null}

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative flex-1 sm:max-w-sm">
                            <Search
                                aria-hidden="true"
                                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                            />
                            <Input
                                type="search"
                                className="pl-9"
                                placeholder="Search name, region or code"
                                aria-label="Search constituencies"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="sm:w-56">
                            <label htmlFor="region-filter" className="sr-only">
                                Filter by region
                            </label>
                            <select
                                id="region-filter"
                                value={regionFilter}
                                onChange={(e) => setRegionFilter(e.target.value)}
                                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-sm"
                            >
                                <option value="all">All regions</option>
                                {regions.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <p className="text-sm text-muted-foreground" aria-live="polite">
                        Showing {filtered.length} of {constituencies.length} constituencies
                    </p>

                    <DataTable
                        caption="Constituencies, their regions and candidate counts"
                        columns={columns}
                        rows={filtered}
                        getRowKey={(c) => c.id}
                        loading={loading}
                        empty={
                            <EmptyState
                                title={
                                    constituencies.length === 0
                                        ? 'No constituencies yet'
                                        : 'No constituencies match those filters'
                                }
                                description={
                                    constituencies.length === 0
                                        ? 'Import the constituency roll as a CSV to get started.'
                                        : 'Try a different search term or region.'
                                }
                                action={
                                    constituencies.length === 0 ? (
                                        <Button onClick={() => setView('import')}>
                                            <Upload aria-hidden="true" />
                                            Import CSV
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setSearch('')
                                                setRegionFilter('all')
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
                            <Field id="c_name" label="Constituency name" required error={fieldErrors.name}>
                                <Input
                                    placeholder="e.g. Accra Central"
                                    value={form.name}
                                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                />
                            </Field>
                            <Field id="c_region" label="Region" required error={fieldErrors.region}>
                                <Input
                                    placeholder="e.g. Greater Accra"
                                    value={form.region}
                                    onChange={(e) =>
                                        setForm((p) => ({ ...p, region: e.target.value }))
                                    }
                                />
                            </Field>
                            <Field
                                id="c_code"
                                label="Code"
                                hint="A unique whole number identifying this constituency."
                                required
                                error={fieldErrors.code}
                            >
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    placeholder="e.g. 1"
                                    value={form.code}
                                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                                />
                            </Field>

                            {formError ? (
                                <Alert variant="danger" title="Could not add constituency">
                                    {formError}
                                </Alert>
                            ) : null}

                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => setView('list')}
                                    disabled={formLoading}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    pending={formLoading}
                                    pendingLabel="Adding…"
                                >
                                    Add constituency
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : null}

            {view === 'import' ? (
                <Card className="max-w-xl">
                    <CardContent className="space-y-5">
                        <div>
                            <h2 className="font-semibold">Import constituencies from CSV</h2>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                Columns must be in this order: name, region, code. A header row is
                                optional. Existing constituencies with a matching code are updated
                                rather than duplicated.
                            </p>
                        </div>

                        <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs">
                            <code>{`name,region,code
Accra Central,Greater Accra,1
Tema West,Greater Accra,2
"Sekondi, Takoradi",Western,3`}</code>
                        </pre>

                        <Field
                            id="csv_file"
                            label="CSV file"
                            hint={`Up to ${MAX_IMPORT_ROWS} rows per import.`}
                            error={csvError}
                        >
                            <Input
                                type="file"
                                accept=".csv,text/csv"
                                onChange={handleCsv}
                                disabled={csvLoading}
                            />
                        </Field>

                        {csvLoading ? (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Spinner />
                                Importing…
                            </p>
                        ) : null}
                    </CardContent>
                </Card>
            ) : null}

            <EditNameDialog
                open={Boolean(editing)}
                onOpenChange={(open) => {
                    if (!open && !editSaving) {
                        setEditing(null)
                        setEditError('')
                    }
                }}
                recordId={editing?.id ?? null}
                title="Edit constituency name"
                description={
                    editing
                        ? `Code ${editing.code} · ${editing.region}. Only the name changes — the code, the region and every candidate and registration in this constituency stay as they are.`
                        : undefined
                }
                label="Constituency name"
                fieldId="edit_constituency_name"
                initialValue={editing?.name ?? ''}
                placeholder="e.g. Accra Central"
                // Deliberately not the person-name rule used for candidates:
                // real constituencies here include "Nalerigu/Gambaga", which
                // that rule rejects.
                validate={(value) =>
                    normaliseName(value) ? null : 'Enter the constituency name.'
                }
                saving={editSaving}
                error={editError}
                onSave={handleEditSave}
            />
        </div>
    )
}
