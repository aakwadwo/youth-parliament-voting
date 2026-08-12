'use client'

import { useMemo, useState } from 'react'
import { Search, RefreshCw, FileDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Stat } from '@/components/ui/stat'
import { EmptyState } from '@/components/ui/feedback'
import { DataTable } from '@/components/ui/data-table'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { useFetch } from '@/lib/useFetch'
import { downloadExport } from '@/lib/download'

/**
 * Registered voters, by constituency.
 *
 * Deliberately an aggregate view and nothing more. There is no row action, no
 * expandable list and no search over people — the only search is over
 * constituency names, and the only figure per row is a count. The endpoint
 * behind it never reads the voters table, so this screen could not show an
 * individual registration even if a control were added to ask for one.
 */
export default function RegistrationStats() {
    const {
        data: report,
        loading,
        error: loadError,
        reload,
    } = useFetch('/api/admin/registration-stats', {
        errorMessage: 'Could not load registration statistics.',
    })

    const [search, setSearch] = useState('')
    const [regionFilter, setRegionFilter] = useState('all')
    const [downloading, setDownloading] = useState(false)
    const [downloadError, setDownloadError] = useState('')

    // Memoised rather than defaulted inline: `?? []` mints a new array on every
    // render, which would change the identity of every dependent memo below and
    // re-filter 276 rows on each keystroke.
    const constituencies = useMemo(() => report?.constituencies ?? [], [report])
    const summary = report?.summary

    const regions = useMemo(
        () => [...new Set(constituencies.map((c) => c.region).filter(Boolean))].sort(),
        [constituencies]
    )

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase()
        return constituencies.filter((c) => {
            if (regionFilter !== 'all' && c.region !== regionFilter) return false
            if (!term) return true
            return (
                c.name.toLowerCase().includes(term) ||
                (c.region ?? '').toLowerCase().includes(term) ||
                String(c.code ?? '').includes(term)
            )
        })
    }, [constituencies, search, regionFilter])

    // What the filtered view adds up to, so a region filter answers "how many
    // have registered in Ashanti" without the reader doing the arithmetic.
    const filteredTotal = useMemo(
        () => filtered.reduce((sum, c) => sum + c.registered, 0),
        [filtered]
    )

    async function handleDownload() {
        setDownloading(true)
        setDownloadError('')

        const result = await downloadExport(
            '/api/admin/registration-stats/export?format=pdf',
            'registration-statistics.pdf'
        )

        if (!result.ok) setDownloadError(result.error)
        setDownloading(false)
    }

    const nf = new Intl.NumberFormat('en-GB')

    const columns = [
        {
            key: 'name',
            header: 'Constituency',
            primary: true,
            cell: (c) => (
                <span className="flex flex-col">
                    <span className="font-medium">{c.name}</span>
                    {c.code == null ? null : (
                        <span className="numeric text-xs text-muted-foreground">Code {c.code}</span>
                    )}
                </span>
            ),
        },
        {
            key: 'region',
            header: 'Region',
            cell: (c) => <span className="text-muted-foreground">{c.region ?? '—'}</span>,
        },
        {
            key: 'registered',
            header: 'Registered voters',
            align: 'right',
            cell: (c) => (
                <span className="numeric font-medium">{nf.format(c.registered)}</span>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <SectionHeader
                title="Registration statistics"
                description={
                    summary
                        ? `${nf.format(summary.totalRegistered)} registered across ${nf.format(summary.totalConstituencies)} constituencies`
                        : 'Registered voters by constituency'
                }
                actions={
                    <Button
                        variant="outline"
                        onClick={handleDownload}
                        pending={downloading}
                        pendingLabel="Preparing…"
                        disabled={loading || Boolean(loadError)}
                    >
                        <FileDown aria-hidden="true" />
                        Download PDF
                    </Button>
                }
            />

            {loadError ? (
                <Alert variant="danger" title="Could not load registration statistics">
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

            {downloadError ? (
                <Alert variant="danger" title="Could not generate the PDF">
                    {downloadError}
                </Alert>
            ) : null}

            {/* Surfaced, never reconciled away: a total that disagrees with the
                sum of the rows beneath it is exactly what an election report
                must not hide. Should always be absent. */}
            {summary && !summary.balanced ? (
                <Alert variant="danger" title="Figures do not reconcile">
                    {nf.format(summary.totalRegistered)} voters are on the register, but{' '}
                    {nf.format(summary.assigned)} are accounted for by the constituencies below — a
                    difference of {nf.format(Math.abs(summary.unassigned))}. This should be
                    investigated before these figures are relied upon.
                </Alert>
            ) : null}

            {summary ? (
                <div className="grid gap-4 sm:grid-cols-3">
                    <Stat
                        label="Total registered voters"
                        value={nf.format(summary.totalRegistered)}
                        hint="Across every constituency"
                    />
                    <Stat
                        label="Constituencies with registrations"
                        value={nf.format(summary.constituenciesWithRegistrations)}
                        hint={`of ${nf.format(summary.totalConstituencies)}`}
                    />
                    <Stat
                        label="Awaiting a first registration"
                        value={nf.format(summary.constituenciesWithNone)}
                        hint="Nobody registered yet"
                    />
                </div>
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
                        placeholder="Search constituency, region or code"
                        aria-label="Search constituencies"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="sm:w-56">
                    <label htmlFor="stats-region-filter" className="sr-only">
                        Filter by region
                    </label>
                    <select
                        id="stats-region-filter"
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

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                    Showing {nf.format(filtered.length)} of {nf.format(constituencies.length)}{' '}
                    constituencies
                </p>
                <Badge variant="success">{nf.format(filteredTotal)} registered voters shown</Badge>
            </div>

            <DataTable
                caption="Registered voters by constituency"
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
                                ? 'Import the constituency roll before registration figures can be broken down.'
                                : 'Try a different search term or region.'
                        }
                        action={
                            constituencies.length === 0 ? null : (
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

            <p className="text-xs leading-relaxed text-muted-foreground">
                These are aggregate figures. No voter&apos;s name, mobile number, date of birth or
                any other personal detail is shown here or included in the exported PDF.
            </p>
        </div>
    )
}
