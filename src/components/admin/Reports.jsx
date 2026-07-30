'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/feedback'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { useFetch } from '@/lib/useFetch'
import { formatWhen } from '@/lib/voter-client'

const nf = new Intl.NumberFormat('en-GB')

/**
 * One row per format rather than three cards with icon tiles. The formats are
 * a short list of alternatives, not three products to compare, and a list is
 * how you present alternatives.
 */
const FORMATS = [
    {
        id: 'pdf',
        name: 'PDF',
        detail: 'Paginated and branded, for publication and the archive. Includes the regional turnout chart and the full constituency declaration.',
    },
    {
        id: 'xlsx',
        name: 'Excel',
        detail: 'Five sheets with real numeric types, frozen headers and filters, for analysis.',
    },
    {
        id: 'csv',
        name: 'CSV',
        detail: 'One flat table of every candidate result, for import elsewhere.',
    },
]

export default function Reports() {
    const { data: stats, loading } = useFetch('/api/admin/stats', {
        errorMessage: 'Could not load election status.',
    })

    const [downloading, setDownloading] = useState(null)
    const [error, setError] = useState('')
    const [lastExport, setLastExport] = useState(null)

    async function handleExport(format) {
        setDownloading(format)
        setError('')

        try {
            const res = await fetch(`/api/admin/results/export?format=${format}`)

            if (!res.ok) {
                let message = 'Could not generate the report.'
                try {
                    message = (await res.json()).error ?? message
                } catch {
                    /* non-JSON error body */
                }
                setError(message)
                return
            }

            // The server names the file after the election and export date. The
            // browser only receives that via Content-Disposition, so it is
            // parsed back out rather than guessed at.
            const disposition = res.headers.get('Content-Disposition') ?? ''
            const match = /filename="([^"]+)"/.exec(disposition)
            const filename = match?.[1] ?? `election-report.${format}`

            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)

            setLastExport({ filename, at: new Date().toISOString() })
        } catch {
            setError('Could not reach the server. Please try again.')
        } finally {
            setDownloading(null)
        }
    }

    const election = stats?.election
    const votingStillOpen = election?.status === 'open'

    return (
        <div className="space-y-6">
            <SectionHeader
                title="Election report"
                description="Export the full election report for publication, analysis or the archive."
            />

            {error ? (
                <Alert variant="danger" title="Export failed">
                    {error}
                </Alert>
            ) : null}

            {lastExport ? (
                <Alert variant="success" title="Downloaded">
                    <span className="break-all">{lastExport.filename}</span>, generated{' '}
                    {formatWhen(lastExport.at)}.
                </Alert>
            ) : null}

            {/* Exporting mid-poll is legitimate; an interim turnout report is a
                normal thing to want. But the figures are provisional and must
                not be mistaken for a declaration. */}
            {votingStillOpen ? (
                <Alert variant="warning" title="Voting is still open">
                    These figures are provisional and will change until the poll closes.
                </Alert>
            ) : null}

            {!loading && stats ? (
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                    <p className="text-sm text-muted-foreground">This report covers</p>
                    <p className="truncate text-lg font-semibold">
                        {election?.name ?? 'Untitled election'}
                    </p>

                    <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 lg:grid-cols-4">
                        {[
                            ['Ballots cast', nf.format(stats.totals.ballots)],
                            ['Turnout', `${stats.totals.turnoutPct}%`],
                            ['Registered', nf.format(stats.totals.registered)],
                            [
                                'Constituencies',
                                `${stats.totals.contestedConstituencies} of ${stats.totals.constituencies}`,
                            ],
                        ].map(([label, value]) => (
                            <div key={label}>
                                <dt className="text-xs text-muted-foreground">{label}</dt>
                                <dd className="numeric mt-0.5 font-semibold">{value}</dd>
                            </div>
                        ))}
                    </dl>

                    {!stats.reconciliation.balanced ? (
                        <p className="mt-4 rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground">
                            Ballot reconciliation does not balance. The report will state the
                            discrepancy. Resolve it before publishing.
                        </p>
                    ) : null}
                </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-border bg-card">
                <ul className="divide-y divide-border">
                    {FORMATS.map((format) => (
                        <li
                            key={format.id}
                            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5"
                        >
                            <div className="min-w-0">
                                <p className="font-semibold">{format.name}</p>
                                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                                    {format.detail}
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                className="shrink-0 sm:w-32"
                                onClick={() => handleExport(format.id)}
                                disabled={downloading !== null}
                            >
                                {downloading === format.id ? <Spinner /> : null}
                                {downloading === format.id ? 'Building…' : 'Download'}
                                <span className="sr-only"> {format.name} report</span>
                            </Button>
                        </li>
                    ))}
                </ul>
            </div>

            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Every report contains the election title and period, the export timestamp and who
                generated it, registered and verified totals, turnout, every candidate who stood
                including those with no votes, the elected candidate per constituency, the
                regional breakdown and the ballot reconciliation check. Each export is recorded in
                the audit log. No report contains anything that could link a ballot to a voter.
            </p>
        </div>
    )
}
