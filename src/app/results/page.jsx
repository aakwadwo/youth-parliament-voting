import { NavButton } from '@/components/NavButton'
import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { StatusPill, Badge } from '@/components/ui/badge'
import { VoteBar, EmptyState } from '@/components/ui/feedback'
import { ConstituencySearch } from '@/components/results/ConstituencySearch'
import { CandidateName } from '@/components/results/CandidateName'
import { PlatformCredit } from '@/components/brand/PlatformCredit'
import { ElectionWindow } from '@/components/VotingNotOpen'
import { createAdminClient } from '@/lib/supabase-admin'
import { readElection } from '@/lib/election-server'
import { readPublicResults } from '@/lib/public-results'
import {
    ELECTION_STATUS,
    resultsUnavailableMessage,
    formatDateTimeLong,
} from '@/lib/election-status'
import { ELECTION_NAME, ELECTORAL_COMMISSION } from '@/lib/election'

/**
 * The public declaration of the result.
 *
 * Open to anyone. No voter session, no phone number, no date of birth, no age
 * check — a result nobody can read without first proving who they are is not a
 * published result. What gates this page is the election's own state plus the
 * Commission's decision to release the count, both read from the same admin
 * settings row every other screen reads.
 *
 * Ending the poll is not that decision. A visitor arriving between the last
 * ballot and the declaration is told the count is being reviewed, and the
 * tally is not fetched at all: `readPublicResults` refuses before it queries,
 * so there is no window in which the figures exist on this request and merely
 * go unrendered. Withdrawing publication reverses this on the next request,
 * because nothing about the result is cached across one.
 *
 * Rendered entirely on the server. There is no `/api/results` behind it and no
 * client component receiving the tallies as props, so the only thing that ever
 * leaves the server is the markup below — which is the simplest possible answer
 * to "could this endpoint leak something it should not". What it renders comes
 * from `buildPublicResults`, which reads one aggregate function and emits an
 * explicit object literal containing names, counts and shares.
 *
 * Nothing here can identify a voter, and that is a property of the schema
 * rather than of this page: `votes` rows carry no voter reference at all.
 */

const nf = new Intl.NumberFormat('en-GB')

export async function generateMetadata() {
    const { election } = await readElection()
    const name = election?.electionName ?? ELECTION_NAME
    return {
        title: 'Election results',
        description: `Constituency-by-constituency results for the ${name}.`,
    }
}

/** The screen shown whenever the result may not be published yet. */
function ResultsUnavailable({ election, status }) {
    const message = resultsUnavailableMessage(status)

    return (
        <PageShell width="md">
            <PageHeading title="Election results" description={message.detail} />

            <div className="mt-6">
                <StatusPill variant="neutral">{message.title}</StatusPill>
            </div>

            <ElectionWindow election={election} />

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <NavButton href="/election" size="lg" className="sm:w-auto">
                    View election details
                </NavButton>
                <NavButton href="/" variant="outline" size="lg" className="sm:w-auto">
                    Return home
                </NavButton>
            </div>

            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
                Results are published by the {ELECTORAL_COMMISSION} once voting has closed and it
                has reviewed the count. This page does not require you to sign in.
            </p>
        </PageShell>
    )
}

function ConstituencyResult({ constituency }) {
    // Bars are scaled to the leading tally rather than to 100%, so a seat won
    // on 38% still reads as a clear lead rather than a third of an empty
    // track. The percentage beside each row carries the absolute share.
    const leading = constituency.candidates[0]?.votes ?? 0

    return (
        <section
            id={`seat-${constituency.key}`}
            aria-labelledby={`h-${constituency.key}`}
            // `data-found` is set by the constituency search when it scrolls
            // this seat into view, and cleared a couple of seconds later. It is
            // how a visitor confirms the page jumped to the seat they picked.
            className="overflow-hidden scroll-mt-4 rounded-xl border border-border bg-card transition-shadow data-[found=true]:ring-2 data-[found=true]:ring-primary data-[found=true]:ring-offset-2 data-[found=true]:ring-offset-background"
        >
            <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0">
                    {/* Focusable only programmatically: the search moves focus
                        here after scrolling, so a keyboard or screen-reader
                        user lands on the seat rather than being left at the
                        search box while the page moves underneath them. */}
                    <h3
                        id={`h-${constituency.key}`}
                        tabIndex={-1}
                        className="font-semibold outline-none"
                    >
                        {constituency.name}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        <span className="numeric">{nf.format(constituency.totalVotes)}</span>{' '}
                        {constituency.totalVotes === 1 ? 'vote' : 'votes'} counted
                    </p>
                </div>
                {/* The "Declared" pill is gone: it sat on 142 of 144 cards
                    saying the same thing, which is the definition of noise on a
                    results page. The two states that are *not* the norm still
                    carry a pill, because those are the ones a reader needs
                    pointing out. */}
                {constituency.totalVotes === 0 ? (
                    <Badge variant="neutral">No votes cast</Badge>
                ) : constituency.tied ? (
                    <Badge variant="warning">Tied</Badge>
                ) : null}
            </div>

            {constituency.candidates.length === 0 ? (
                <EmptyState
                    title="No candidates stood"
                    description="Nobody was registered as a candidate in this constituency."
                />
            ) : constituency.totalVotes === 0 ? (
                <>
                    <p className="border-b border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground sm:px-5">
                        No votes were recorded in this constituency, so no candidate has been
                        elected. Everyone who stood is listed below.
                    </p>
                    <ul className="divide-y divide-border">
                        {constituency.candidates.map((candidate) => (
                            <li
                                key={candidate.key}
                                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 sm:px-5"
                            >
                                <CandidateName name={candidate.name} />
                                <span className="numeric shrink-0 text-sm text-muted-foreground">
                                    0 votes
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                <ul className="divide-y divide-border">
                    {constituency.candidates.map((candidate) => (
                        <li key={candidate.key} className="px-4 py-3.5 sm:px-5">
                            {/* Stacked on a phone, one line from `sm` up.
                                Sharing a line is right when there is room for
                                it, but on a 320px screen the tally and the
                                ELECTED label took their width first and left
                                the name a stub — "Hon…." told a voter nothing
                                about who had won. Giving the name the full
                                width of the card is what actually fixes that;
                                the expansion in CandidateName is the fallback
                                for the few names still too long for it. */}
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                <span className="flex min-w-0 items-center gap-2">
                                    {/* The original trophy, unchanged. It is
                                        decorative, and the label after the
                                        name carries the outcome as text — so
                                        the result never depends on an emoji
                                        rendering or on colour. */}
                                    {candidate.isWinner ? (
                                        <span aria-hidden="true" className="shrink-0">
                                            🏆
                                        </span>
                                    ) : null}
                                    {/* Expands to its full length when it does
                                        not fit — which on a phone is most of
                                        them. See CandidateName. */}
                                    <CandidateName
                                        name={candidate.name}
                                        isWinner={candidate.isWinner}
                                    />
                                    {/* Was a filled "Winner" pill, which drew
                                        the eye harder than the tally beside
                                        it. Plain small caps-weight text in the
                                        brand colour states the same fact
                                        without competing: still immediately
                                        scannable down the page, no longer a
                                        badge. "Tied" rather than "Elected"
                                        where the seat is level, because a tied
                                        candidate has not been elected. */}
                                    {candidate.isWinner ? (
                                        <span className="shrink-0 text-xs font-semibold tracking-wide text-primary uppercase">
                                            {constituency.tied ? 'Tied' : 'Elected'}
                                        </span>
                                    ) : null}
                                    {!candidate.isActive ? (
                                        <Badge variant="neutral">Withdrawn</Badge>
                                    ) : null}
                                </span>
                                <span className="numeric shrink-0 text-sm text-muted-foreground">
                                    {nf.format(candidate.votes)}{' '}
                                    {candidate.votes === 1 ? 'vote' : 'votes'} ·{' '}
                                    {candidate.sharePct}%
                                </span>
                            </div>
                            <VoteBar
                                className="mt-2"
                                value={candidate.votes}
                                max={Math.max(1, leading)}
                                tone={candidate.isWinner ? 'brand' : 'muted'}
                                label={`${candidate.name}: ${candidate.votes} votes, ${candidate.sharePct}% of votes cast in ${constituency.name}`}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

export default async function ResultsPage() {
    const { election, error } = await readElection()

    // Fails closed. An election whose state cannot be read is not an election
    // whose results may be published.
    if (error || !election) {
        return <ResultsUnavailable election={null} status={ELECTION_STATUS.CLOSED} />
    }

    let results
    try {
        results = await readPublicResults(createAdminClient(), election)
    } catch (err) {
        console.error('[results] failed to build public results', err)
        return (
            <PageShell width="lg">
                <PageHeading
                    title="Election results"
                    description="We could not load the results just now. Please try again shortly."
                />
                <NavButton href="/" variant="outline" size="lg" className="mt-8 sm:w-auto">
                    Return home
                </NavButton>
            </PageShell>
        )
    }

    // null means the Commission has not released the count — either voting is
    // still live, or it has ended and the review is not finished. Nothing was
    // read from the database, so there is nothing here to withhold.
    if (results === null) {
        return <ResultsUnavailable election={election} status={election.status} />
    }

    const { summary } = results
    const nothingCounted = summary.totalVotes === 0

    // Flattened once on the server so the search box ships a name, a region and
    // an anchor key per seat — and no tallies. The client component that filters
    // this never receives a vote count, which keeps the searchable index free of
    // anything the page is not already displaying.
    const searchIndex = results.regions.flatMap((region) =>
        region.constituencies.map((constituency) => ({
            key: constituency.key,
            name: constituency.name,
            region: region.region,
        }))
    )

    return (
        <PageShell width="lg">
            <PageHeading
                title="Election results"
                description={`Final results for the ${results.electionName ?? ELECTION_NAME}, by region and constituency.`}
            />

            <div className="mt-6">
                <StatusPill variant="neutral">Voting has ended</StatusPill>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                {[
                    ['Votes counted', nf.format(summary.totalVotes)],
                    ['Constituencies', nf.format(summary.totalConstituencies)],
                    ['Seats declared', nf.format(summary.declaredConstituencies)],
                    ['Regions', nf.format(summary.totalRegions)],
                ].map(([label, value]) => (
                    <div key={label} className="bg-card px-4 py-3">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="numeric mt-0.5 text-lg font-semibold">{value}</dd>
                    </div>
                ))}
            </dl>

            {/* How a seat is decided, stated once, above the results rather
                than in the notes underneath them — a reader needs the rule
                before the tallies, not after.

                Plurality, and only plurality: the candidate with the most
                votes is elected whether or not that is more than half. This
                platform applies no majority threshold anywhere (see
                `resolveWinners` in lib/results-math.js), and stating one here
                would contradict a live declared result — Ketu South is won on
                39.4% of the votes cast there. */}
            <section
                aria-labelledby="how-decided"
                className="mt-6 rounded-xl border border-border bg-surface p-4 sm:p-5"
            >
                <h2 id="how-decided" className="text-sm font-semibold">
                    How a seat is decided
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    The candidate with the highest number of votes in a constituency is elected.
                    There is no minimum share a candidate has to reach, so a seat contested by
                    several candidates can be won without the winner taking half of the votes
                    cast. Where two or more candidates finish level on the highest tally, the seat
                    is shown as tied and the {ELECTORAL_COMMISSION} decides how it is resolved.
                    Where no votes were cast at all, no candidate is elected and the seat is shown
                    as undeclared.
                </p>
            </section>

            {/* The regional grouping below is untouched; this is a shortcut
                into it, not a replacement for it. */}
            <div className="mt-6">
                <ConstituencySearch constituencies={searchIndex} />
                <p className="mt-2 text-xs text-muted-foreground">
                    Or scroll to browse all{' '}
                    <span className="numeric">{nf.format(summary.totalConstituencies)}</span>{' '}
                    constituencies, grouped by region.
                </p>
            </div>

            {summary.tiedConstituencies > 0 ? (
                <p className="mt-4 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm leading-relaxed text-warning-foreground">
                    {summary.tiedConstituencies === 1
                        ? 'One constituency is tied on the highest number of votes.'
                        : `${summary.tiedConstituencies} constituencies are tied on the highest number of votes.`}{' '}
                    Every candidate on the leading tally is shown as tied; the {ELECTORAL_COMMISSION}{' '}
                    decides how a tie is resolved.
                </p>
            ) : null}

            {results.regions.length === 0 || nothingCounted ? (
                <div className="mt-6 rounded-xl border border-border bg-card">
                    <EmptyState
                        title="No votes were recorded"
                        description="Voting has closed and no ballots were counted, so no candidate has been elected."
                    />
                </div>
            ) : null}

            <div className="mt-10 space-y-10">
                {results.regions.map((region) => (
                    <section key={region.key} aria-labelledby={`h-${region.key}`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
                            <h2 id={`h-${region.key}`} className="text-heading font-semibold">
                                {region.region}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                <span className="numeric">{nf.format(region.totalVotes)}</span>{' '}
                                {region.totalVotes === 1 ? 'vote' : 'votes'} across{' '}
                                <span className="numeric">{region.constituencies.length}</span>{' '}
                                {region.constituencies.length === 1
                                    ? 'constituency'
                                    : 'constituencies'}
                            </p>
                        </div>

                        <div className="mt-4 space-y-4">
                            {region.constituencies.map((constituency) => (
                                <ConstituencyResult
                                    key={constituency.key}
                                    constituency={constituency}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            <div className="mt-12 border-t border-border pt-6">
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Percentages are each candidate&rsquo;s share of the votes counted in their own
                    constituency, rounded to one decimal place, so they may not total exactly 100%.
                    Candidates who received no votes are listed with a nil tally rather than
                    omitted.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    These are aggregate totals only. Ballots are anonymous: no record in this
                    system links a vote to the person who cast it, so this page can state how many
                    votes each candidate received but never who voted for them.
                </p>
                {/* Two different instants, and the difference is the point:
                    the poll closing is when the last ballot was accepted, the
                    publication is when the Commission finished checking the
                    count and released it. Stating only the first, as this page
                    used to, implied the result had been public since the
                    moment voting stopped. */}
                <p className="mt-3 text-sm text-muted-foreground">
                    {results.closedAt
                        ? `Voting closed ${formatDateTimeLong(results.closedAt)}. `
                        : null}
                    {results.publishedAt
                        ? `Results released ${formatDateTimeLong(results.publishedAt)} by the ${ELECTORAL_COMMISSION}.`
                        : `Released by the ${ELECTORAL_COMMISSION}.`}
                </p>
            </div>

            {/* Below the result and below the notes on how it was counted.
                Nothing about the supplier appears above a tally. */}
            <PlatformCredit className="mt-8" />

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <NavButton href="/election" variant="outline" size="lg" className="sm:w-auto">
                    View election details
                </NavButton>
                <NavButton href="/" variant="outline" size="lg" className="sm:w-auto">
                    Return home
                </NavButton>
            </div>
        </PageShell>
    )
}
