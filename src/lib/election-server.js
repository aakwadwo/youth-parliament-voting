import { cache } from 'react'

import { createAdminClient } from '@/lib/supabase-admin'
import { noStore } from '@/lib/http'
import { jsonError, dbError } from '@/lib/api-error'
import {
    PUBLIC_ELECTION_COLUMNS,
    toPublicElection,
    isVotingOpen,
    electionGateMessage,
    electionGateCode,
    toPublication,
    PUBLICATION_COLUMNS,
} from '@/lib/election-status'

/**
 * Server-side access to the election state, and the gate that protects every
 * voting route with it.
 *
 * Split from `@/lib/election-status` so that the pure state machine can be
 * imported by client components without bundling the service-role Supabase
 * client. Never import this file from a client component.
 */

/**
 * Reads the live election state.
 *
 * Returns `{ election, error }` rather than throwing, because every caller is
 * making a decision about what to do when the settings row cannot be read, and
 * that decision differs: a route protecting the ballot must refuse, while the
 * landing page must still render something.
 *
 * Wrapped in React's `cache`, so the several places that ask during a single
 * server render — a page and its `generateMetadata`, or a guard and the
 * component it guards — share one query instead of issuing one each. The cache
 * lasts exactly one request, which is the longest an election's state may be
 * assumed to hold still: it can be switched off by an administrator at any
 * moment, and a stale answer here is a ballot shown after the poll closed.
 *
 * @param {object} [client] - injectable Supabase client, for tests
 */
export const readElection = cache(async function readElection(client) {
    const supabase = client ?? createAdminClient()

    const { data, error } = await supabase
        .from('election_settings')
        .select(PUBLIC_ELECTION_COLUMNS)
        .maybeSingle()

    if (error) return { election: null, error }

    return { election: toPublicElection(data), error: null }
})

/**
 * How long the *metadata* copy of the election may be reused across requests.
 *
 * Deliberately the same 15 seconds `/api/election` already serves to the public
 * (`Cache-Control: max-age=15`), so this introduces no staleness the platform
 * did not already accept.
 */
const METADATA_TTL_MS = 15 * 1000

/** Module-scoped, so it lives as long as one warm serverless instance. */
let metadataCache = { expiresAt: 0, value: null }

/**
 * The election, for rendering a page's <title> and description — and for
 * NOTHING ELSE.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `src/app/layout.js` is `dynamic = 'force-dynamic'` (load-bearing: the CSP
 * nonce cannot be stamped onto prerendered HTML) and its `generateMetadata`
 * reads the election so the browser tab names it. That runs for *every* route
 * in the app, including `/privacy`, `/terms`, `/accessibility` and
 * `/admin/login` — pages with no other reason to touch the database. React's
 * `cache()` dedupes within a single request but not across them, so every page
 * view in the platform cost one Supabase round trip to render a string.
 *
 * ── Why it is safe to cache this and not `readElection` ─────────────────────
 *
 * This value decides what a tab is called. `readElection` decides whether a
 * ballot may be cast. Those must not share a cache, and the separation is the
 * whole point of this function existing rather than a `ttl` option on
 * `readElection`:
 *
 *   NEVER call this from `requireVotingOpen()`, from a voting route, or from
 *   anything that gates the ballot. Those must stay per-request and fail closed
 *   (see `requireVotingOpen` below). A stale value there is a ballot served
 *   after the poll has shut, which is the one outcome an election cannot undo.
 *
 * Failure is swallowed and reported as `null`: a metadata read that throws would
 * take down the page it was decorating, and a deployment with no database
 * configured must still be able to render its terms of use.
 *
 * @returns {Promise<object|null>} the public election object, or null
 */
export async function readElectionForMetadata(client) {
    const now = Date.now()
    if (metadataCache.expiresAt > now) return metadataCache.value

    try {
        const { election, error } = await readElection(client)
        if (error) return null

        metadataCache = { expiresAt: now + METADATA_TTL_MS, value: election }
        return election
    } catch {
        // Not cached: a transient failure must not be held for 15 seconds.
        return null
    }
}

/** Test seam. Never called by application code. */
export function __resetElectionMetadataCache() {
    metadataCache = { expiresAt: 0, value: null }
}

/**
 * The publication decision, as the administrator who has to make it sees it.
 *
 * Distinct from `readElection` on purpose: the public object carries only the
 * combined answer, while `toPublication` breaks it into the parts an
 * administrator has to act on. See that function in `@/lib/election-status`.
 *
 * Not wrapped in `cache`: this is read by the route that immediately changes
 * it, where a per-request memo of the value being written is a trap rather than
 * a saving.
 *
 * @param {object} [client] - injectable Supabase client, for tests
 */
export async function readResultsPublication(client) {
    const supabase = client ?? createAdminClient()

    const { data, error } = await supabase
        .from('election_settings')
        .select(PUBLICATION_COLUMNS)
        .maybeSingle()

    if (error) return { publication: null, error }

    return { publication: toPublication(data), error: null }
}

/**
 * The backend half of election-state enforcement.
 *
 * Frontend routing decides what a voter is *offered*; this decides what they
 * are *allowed*, and it is the half that matters, because the ballot URL can
 * be typed and the vote API can be called with curl. Every voting-related
 * route calls this before doing anything else.
 *
 * Fails closed. A settings row that cannot be read is not evidence that voting
 * is open, and the alternative — letting ballots through because the check
 * itself broke — is the one outcome an election cannot recover from.
 *
 * @returns {Promise<{ response: Response|null, election: object|null }>}
 *   `response` is non-null when the request must be refused, and is the exact
 *   response to return.
 */
export async function requireVotingOpen(client) {
    const { election, error } = await readElection(client)

    if (error) {
        return {
            response: noStore(
                dbError(error, 'Could not confirm the election status. Please try again.', 503)
            ),
            election: null,
        }
    }

    if (!isVotingOpen(election.status)) {
        return {
            response: noStore(
                jsonError(electionGateMessage(election.status), 403, electionGateCode(election.status), {
                    election,
                })
            ),
            election,
        }
    }

    return { response: null, election }
}
