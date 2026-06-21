'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { useFetch } from '@/lib/useFetch'

export default function Constituencies() {
    const { data: constituencies, loading, error: loadError, reload: loadConstituencies } = useFetch('/api/admin/constituencies', {
        initialData: [],
        errorMessage: 'Could not load constituencies. Please refresh the page.',
    })
    const [search, setSearch] = useState('')
    const [view, setView] = useState('list') // list | add | import
    const [form, setForm] = useState({ name: '', region: '', code: '' })
    const [formError, setFormError] = useState('')
    const [formLoading, setFormLoading] = useState(false)
    const [csvError, setCsvError] = useState('')
    const [csvLoading, setCsvLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')

    async function handleAdd() {
        if (!form.name.trim() || !form.region.trim() || !form.code) {
            setFormError('All fields are required')
            return
        }
        setFormLoading(true)
        setFormError('')
        try {
            const res = await fetch('/api/admin/constituencies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (!res.ok) {
                setFormError(data.error)
            } else {
                setForm({ name: '', region: '', code: '' })
                setView('list')
                setSuccessMessage('Constituency added successfully')
                loadConstituencies()
                setTimeout(() => setSuccessMessage(''), 3000)
            }
        } catch {
            setFormError('Something went wrong. Please try again.')
        } finally {
            setFormLoading(false)
        }
    }

    async function handleCSV(e) {
        const file = e.target.files[0]
        if (!file) return
        setCsvError('')
        setCsvLoading(true)

        const text = await file.text()
        const lines = text.trim().split('\n').slice(1) // skip header

        const parsed = []
        for (const line of lines) {
            const [name, region, code] = line.split(',').map(s => s.trim().replace(/"/g, ''))
            if (!name || !region || !code || isNaN(parseInt(code))) continue
            parsed.push({ name, region, code: parseInt(code) })
        }

        if (parsed.length === 0) {
            setCsvError('No valid rows found. Check your CSV format.')
            setCsvLoading(false)
            return
        }

        try {
            const res = await fetch('/api/admin/constituencies/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ constituencies: parsed }),
            })
            const data = await res.json()
            if (!res.ok) {
                setCsvError(data.error)
            } else {
                setView('list')
                setSuccessMessage(`${data.count} constituencies imported successfully`)
                loadConstituencies()
                setTimeout(() => setSuccessMessage(''), 3000)
            }
        } catch {
            setCsvError('Something went wrong. Please try again.')
        } finally {
            setCsvLoading(false)
        }
    }

    const filtered = constituencies.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.region.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Constituencies</h1>
                    <p className="text-zinc-500 text-sm mt-1">{constituencies.length} total</p>
                </div>
                {view === 'list' && (
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="text-sm"
                            onClick={() => setView('import')}
                        >
                            Bulk import CSV
                        </Button>
                        <Button
                            className="bg-black text-white hover:bg-zinc-800 text-sm"
                            onClick={() => setView('add')}
                        >
                            Add constituency
                        </Button>
                    </div>
                )}
                {view !== 'list' && (
                    <Button
                        variant="outline"
                        className="text-sm"
                        onClick={() => { setView('list'); setFormError(''); setCsvError('') }}
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

            {/* LIST VIEW */}
            {view === 'list' && (
                <div className="space-y-4">
                    {loadError && <p className="text-sm text-red-600" role="alert" aria-live="polite">{loadError}</p>}
                    <Input
                        placeholder="Search by name or region..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="max-w-sm h-10"
                    />
                    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="border-b border-zinc-100">
                                <th className="text-left px-5 py-3 text-zinc-500 font-medium">Code</th>
                                <th className="text-left px-5 py-3 text-zinc-500 font-medium">Name</th>
                                <th className="text-left px-5 py-3 text-zinc-500 font-medium">Region</th>
                                <th className="text-left px-5 py-3 text-zinc-500 font-medium">Active candidates</th>
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
                                    <td colSpan={4} className="px-5 py-8 text-center text-zinc-500">No constituencies found</td>
                                </tr>
                            )}
                            {!loading && filtered.map((c, i) => (
                                <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}>
                                    <td className="px-5 py-3 text-zinc-500 font-mono text-xs">{c.code}</td>
                                    <td className="px-5 py-3 font-medium text-black">{c.name}</td>
                                    <td className="px-5 py-3 text-zinc-500">{c.region}</td>
                                    <td className="px-5 py-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                c.candidates?.[0]?.count > 0
                    ? 'bg-green-50 text-[#006B3F] border border-green-200'
                    : 'bg-zinc-100 text-zinc-500 border border-zinc-200'
            }`}>
              {c.candidates?.[0]?.count ?? 0}
            </span>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ADD VIEW */}
            {view === 'add' && (
                <Card className="max-w-md border border-zinc-200 shadow-none">
                    <CardContent className="p-6 space-y-5">
                        <div className="space-y-2">
                            <Label className="text-base">Constituency name</Label>
                            <Input
                                placeholder="e.g. Accra Central"
                                className="h-11"
                                value={form.name}
                                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-base">Region</Label>
                            <Input
                                placeholder="e.g. Greater Accra"
                                className="h-11"
                                value={form.region}
                                onChange={e => setForm(p => ({ ...p, region: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-base">Code</Label>
                            <Input
                                placeholder="e.g. 1"
                                type="number"
                                className="h-11"
                                value={form.code}
                                onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                            />
                        </div>
                        {formError && <p className="text-sm text-red-600" role="alert" aria-live="polite">{formError}</p>}
                        <Button
                            className="w-full bg-black text-white hover:bg-zinc-800 h-11"
                            onClick={handleAdd}
                            disabled={formLoading}
                        >
                            {formLoading ? 'Adding...' : 'Add constituency'}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* IMPORT VIEW */}
            {view === 'import' && (
                <Card className="max-w-md border border-zinc-200 shadow-none">
                    <CardContent className="p-6 space-y-5">
                        <div>
                            <p className="text-base font-medium text-black">Import from CSV</p>
                            <p className="text-sm text-zinc-500 mt-1">
                                CSV must have columns in this order: <span className="font-mono text-xs bg-zinc-100 px-1 py-0.5 rounded">name, region, code</span>
                            </p>
                        </div>
                        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                            <p className="text-xs text-zinc-500 font-mono">name,region,code</p>
                            <p className="text-xs text-zinc-500 font-mono">Accra Central,Greater Accra,1</p>
                            <p className="text-xs text-zinc-500 font-mono">Tema West,Greater Accra,2</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-base">Upload CSV file</Label>
                            <Input
                                type="file"
                                accept=".csv"
                                className="h-11"
                                onChange={handleCSV}
                                disabled={csvLoading}
                            />
                        </div>
                        {csvError && <p className="text-sm text-red-600" role="alert" aria-live="polite">{csvError}</p>}
                        {csvLoading && <p className="text-sm text-zinc-500">Importing...</p>}
                    </CardContent>
                </Card>
            )}

        </div>
    )
}