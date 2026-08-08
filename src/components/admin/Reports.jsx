'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { SectionHeader } from '@/components/admin/SectionHeader'
import { useFetch } from '@/lib/useFetch'
import { downloadExport } from '@/lib/download'
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

/**
 * The candidate register is a separate download, not a fourth format of the
 * results report.
 *
 * It answers a different question, at a different point in the election: the
 * report says who won, and is generated at the end; the register says who is
 * standing, and is checked *before* the poll opens, when there is no result to
 * report at all. Filing it under "Election report" would hide the one export an
 * administrator needs during the period when every other export is empty.
 */
const CANDIDATE_LIST_ID = 'candidate-list'

export default function Reports() {
    const { data: stats, loading } = useFetch('/api/admin/stats', {
        errorMessage: 'Could not load election status.',
    })

    const [downloading, setDownloading] = useState(null)
    const [error, setError] = useState('')
    const [lastExport, setLastExport] = useState(null)

    async function download(id, url, fallbackName) {
        setDownloading(id)
        setError('')

        const result = await downloadExport(url, fallbackName)

        if (result.ok) setLastExport({ filename: result.filename, at: new Date().toISOString() })
        else setError(result.error)

        setDownloading(null)
    }

    const handleExport = (format) =>
        download(format, `/api/admin/results/export?format=${format}`, `election-report.${format}`)

    const handleCandidateList = () =>
        download(
            CANDIDATE_LIST_ID,
            '/api/admin/candidates/export?format=pdf',
            'candidate-list.pdf'
        )

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
                                // Every format is disabled while any one of them
                                // is building: the three share one download
                                // slot, and a second export queued behind the
                                // first would land as a file the administrator
                                // did not ask for.
                                disabled={downloading !== null}
                                pending={downloading === format.id}
                                pendingLabel={
                                    <>
                                        Building…
                                        <span className="sr-only"> {format.name} report</span>
                                    </>
                                }
                            >
                                Download
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

            <div className="border-t border-border pt-6">
                <SectionHeader
                    title="Candidate list"
                    description="The complete candidate register, for checking before the poll opens."
                />

                <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
                    <div className="min-w-0">
                        <p className="font-semibold">Candidate list (PDF)</p>
                        <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                            Every candidate in the system, grouped by region and constituency, with
                            their photograph beside their name. Includes candidates marked
                            withdrawn and constituencies with nobody standing, so the register can
                            be checked for anyone who should not be on it. Contains no vote totals.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        className="shrink-0 sm:w-32"
                        onClick={handleCandidateList}
                        disabled={downloading !== null}
                        pending={downloading === CANDIDATE_LIST_ID}
                        pendingLabel={
                            <>
                                Building…
                                <span className="sr-only"> candidate list</span>
                            </>
                        }
                    >
                        Download
                        <span className="sr-only"> candidate list PDF</span>
                    </Button>
                </div>
            </div>
        </div>
    )
}
