'use client'

import { useCallback, useEffect, useState } from 'react'

const KEY = 'nyp.voter'

/**
 * The voter's display details, held in sessionStorage.
 *
 * This is presentation only — it decides whose name to greet and which
 * constituency to show. Authority comes exclusively from the httpOnly
 * `voter_token` cookie, which the browser cannot read or forge, so editing
 * this storage gains an attacker nothing.
 *
 * Registration and login used to write different shapes here (`voter_name`
 * versus `full_name`), so a voter who signed in rather than registering was
 * thanked as "undefined" on the confirmation screen. Both paths now go through
 * `storeVoter`, which normalises to one shape.
 */
export function storeVoter(voter) {
    if (typeof window === 'undefined' || !voter) return
    try {
        sessionStorage.setItem(
            KEY,
            JSON.stringify({
                id: voter.id,
                fullName: voter.full_name ?? voter.fullName ?? '',
                constituencyId: voter.constituency_id ?? voter.constituencyId ?? '',
                constituencyName: voter.constituency_name ?? voter.constituencyName ?? '',
            })
        )
    } catch {
        // Private browsing modes can refuse sessionStorage. The ballot still
        // works — the voter just sees generic wording instead of their name.
    }
}

export function readVoter() {
    if (typeof window === 'undefined') return null
    try {
        const raw = sessionStorage.getItem(KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed?.constituencyId ? parsed : null
    } catch {
        return null
    }
}

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
 */
export function useElectionStatus({ pollMs = 60000 } = {}) {
    const [state, setState] = useState({ data: null, loading: true, error: false })

    const load = useCallback(async (signal) => {
        try {
            const res = await fetch('/api/election', { signal })
            if (!res.ok) throw new Error('failed')
            setState({ data: await res.json(), loading: false, error: false })
        } catch (error) {
            if (error?.name === 'AbortError') return
            setState((prev) => ({ data: prev.data, loading: false, error: true }))
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        load(controller.signal)

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

const STATUS_COPY = {
    open: {
        variant: 'success',
        label: 'Voting is open',
        detail: (e) => (e.closesAt ? `Closes ${formatWhen(e.closesAt)}` : null),
    },
    scheduled: {
        variant: 'warning',
        label: 'Voting has not opened yet',
        detail: (e) => (e.opensAt ? `Opens ${formatWhen(e.opensAt)}` : null),
    },
    ended: {
        variant: 'neutral',
        label: 'Voting has closed',
        detail: (e) => (e.closesAt ? `Closed ${formatWhen(e.closesAt)}` : null),
    },
    closed: {
        variant: 'neutral',
        label: 'Voting is currently closed',
        detail: () => null,
    },
}

export function describeElection(election) {
    if (!election) return null
    const copy = STATUS_COPY[election.status] ?? STATUS_COPY.closed
    return { ...copy, detail: copy.detail(election) }
}

/** Ghana keeps GMT year-round, so the platform states one unambiguous zone. */
export function formatWhen(value) {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Accra',
        }).format(new Date(value))
    } catch {
        return ''
    }
}
