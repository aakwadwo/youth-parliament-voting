'use client'

import { useCallback, useEffect, useState } from 'react'

import { getJson } from '@/lib/api-client'
import { ELECTION_STATUS_TONE, formatWhen } from '@/lib/election-status'

const KEY = 'nyp.voter'

/**
 * Clears the voter details older versions of this app kept in sessionStorage.
 *
 * Nothing writes that key any more. The ballot used to decide whose name to
 * greet, and which constituency's candidates to show, from a JSON blob the
 * browser could edit — so the page rendered for anyone who put a plausible
 * object there, and the voter's name and constituency sat in browser storage
 * for the rest of the session. The ballot route now reads all of that from the
 * httpOnly session cookie during the server render, so the copy is neither
 * needed nor written.
 *
 * This remains, and is still called at the end of every voting flow, to clear
 * the key out of sessions belonging to browsers that loaded an earlier
 * deployment. It can be deleted once no such session can plausibly still be
 * open.
 */
export function clearVoter() {
    if (typeof window === 'undefined') return
    try {
        sessionStorage.removeItem(KEY)
    } catch {
        /* ignore */
    }
}

/**
 * Live election status, polled from the public endpoint.
 *
 * Every voter-facing screen shows this so nobody can reach the final,
 * irreversible step only to be told the poll was never open. It refreshes on
 * an interval and whenever the tab regains focus, so a voter who has had the
 * page open since before the poll opened sees it go live.
 *
 * `initial` lets a server component hand over the state it has already read,
 * so the front page paints the real status rather than a skeleton that
 * resolves a moment later. The poll still runs on top of it.
 */
export function useElectionStatus({ pollMs = 60000, initial = null } = {}) {
    const [state, setState] = useState({
        data: initial,
        loading: initial === null,
        error: false,
    })

    const load = useCallback(async (signal) => {
        const result = await getJson('/api/election', { signal })
        if (result.aborted) return
        if (!result.ok) {
            // Keep showing the last known status rather than blanking it. A
            // transient failure to re-check must not make a live election look
            // as though its state is unknown.
            setState((prev) => ({ data: prev.data, loading: false, error: true }))
            return
        }
        setState({ data: result.data, loading: false, error: false })
    }, [])

    useEffect(() => {
        const controller = new AbortController()

        // Called through an async wrapper rather than directly from the effect
        // body. `load` sets no state before its first await, so the mount
        // cannot cascade into a second render before paint — and this is the
        // shape react-hooks/set-state-in-effect accepts for fetch-on-mount.
        async function loadNow() {
            await load(controller.signal)
        }
        loadNow()

        const timer = setInterval(() => load(controller.signal), pollMs)
        const onFocus = () => load(controller.signal)
        window.addEventListener('focus', onFocus)

        return () => {
            controller.abort()
            clearInterval(timer)
            window.removeEventListener('focus', onFocus)
        }
    }, [load, pollMs])

    return state
}

/**
 * How each state is described to a voter.
 *
 * `label` is the short form for the status pill; `detail` is the sentence
 * underneath, which is where the actual dates go. The landing page used to
 * carry none of this — it stated the election's position in hardcoded prose
 * that only changed when someone edited the source.
 *
 * A window with no configured dates still has to read as a complete sentence,
 * so every `detail` degrades to something true rather than to an empty line.
 *
 * The colours are not chosen here. They come from ELECTION_STATUS_TONE, which
 * is shared with the election details page and the admin dashboard so that one
 * election state cannot be green on one screen and amber on the next.
 */
const STATUS_COPY = {
    open: {
        variant: ELECTION_STATUS_TONE.open,
        label: 'Voting is open',
        detail: (e) =>
            e.opensAt && e.closesAt
                ? `Voting is open from ${formatWhen(e.opensAt)} to ${formatWhen(e.closesAt)}`
                : e.closesAt
                  ? `Voting closes ${formatWhen(e.closesAt)}`
                  : 'Voting is open now',
    },
    scheduled: {
        variant: ELECTION_STATUS_TONE.scheduled,
        label: 'Voting has not opened yet',
        detail: (e) =>
            e.opensAt
                ? `Voting opens on ${formatWhen(e.opensAt)}`
                : 'Voting opens during the scheduled election period',
    },
    ended: {
        variant: ELECTION_STATUS_TONE.ended,
        label: 'Voting has ended',
        detail: (e) =>
            e.closesAt ? `Voting ended ${formatWhen(e.closesAt)}` : 'Voting has ended',
    },
    closed: {
        variant: ELECTION_STATUS_TONE.closed,
        label: 'Voting is currently closed',
        detail: () => 'Voting is not open at the moment',
    },
}

export function describeElection(election) {
    if (!election) return null
    const copy = STATUS_COPY[election.status] ?? STATUS_COPY.closed
    return { ...copy, detail: copy.detail(election) }
}

// formatWhen moved to @/lib/election-status so that server components — the
// ballot route guard among them — can format the same dates. Exports from a
// 'use client' module become client references and cannot be called during a
// server render. Imported above (a bare `export ... from` would re-export it
// without binding the name in this module, which is what STATUS_COPY needs)
// and re-exported here so existing imports keep working.
export { formatWhen }
