'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Responses held between mounts, for callers that opt in with `cacheTtl`.
 *
 * Module-scoped so it survives an admin switching sections — which is the whole
 * point. The portal renders one section at a time, so moving between Dashboard
 * and Reports (both of which read `/api/admin/stats`) or between Candidates and
 * Voters (both of which read `/api/admin/constituencies`) unmounted one
 * consumer and mounted another, and refetched identical data every time.
 *
 * Deliberately opt-in and off by default. Caching an admin screen is only safe
 * where the screen does not also mutate what it is showing: the Constituencies
 * section edits constituencies and therefore does NOT cache them, and calls
 * `invalidateFetch` after a successful write so the read-only consumers do not
 * keep serving a stale copy.
 */
const cache = new Map()

/** Drops a cached response. Call after mutating whatever the URL returns. */
export function invalidateFetch(url) {
    cache.delete(url)
}

/** Test seam, and a way to clear everything on sign-out. */
export function clearFetchCache() {
    cache.clear()
}

/**
 * The GET-on-mount-with-reload pattern shared by every admin section, so none
 * of them hand-rolls the same fetch/loading/error boilerplate.
 *
 * Three things it handles that the original version did not:
 *
 *  - in-flight requests are aborted when the component unmounts or the URL
 *    changes, so switching admin sections quickly cannot have a slow response
 *    land and call setState on an unmounted component;
 *  - `setError` is returned, because sections need to surface failures from
 *    their own mutations in the same place. Candidates.jsx called a `setLoadError`
 *    that was never returned, which threw a ReferenceError — replacing the
 *    intended error message with a blank screen — every time deactivating a
 *    candidate failed.
 *  - an optional `cacheTtl`, described above.
 *
 * `reload()` always bypasses the cache and refreshes the stored entry, so the
 * "Try again" and post-mutation refresh paths are never served a stale copy.
 */
export function useFetch(
    url,
    {
        initialData = null,
        errorMessage = 'Could not load this data. Please try again.',
        cacheTtl = 0,
    } = {}
) {
    const cached = cacheTtl > 0 ? cache.get(url) : undefined
    const isFresh = cached && cached.expiresAt > Date.now()

    const [data, setData] = useState(isFresh ? cached.value : initialData)
    const [loading, setLoading] = useState(!isFresh)
    const [error, setError] = useState('')
    const controllerRef = useRef(null)

    const load = useCallback(
        async ({ useCache }) => {
            if (useCache && cacheTtl > 0) {
                const entry = cache.get(url)
                if (entry && entry.expiresAt > Date.now()) {
                    setData(entry.value)
                    setLoading(false)
                    setError('')
                    return
                }
            }

            controllerRef.current?.abort()
            const controller = new AbortController()
            controllerRef.current = controller

            setLoading(true)
            setError('')
            try {
                const res = await fetch(url, { signal: controller.signal })
                const json = await res.json()
                if (!res.ok) throw new Error(json?.error || 'Request failed')
                setData(json)
                if (cacheTtl > 0) {
                    cache.set(url, { value: json, expiresAt: Date.now() + cacheTtl })
                }
            } catch (err) {
                if (err?.name === 'AbortError') return
                // A failed read must not leave a stale entry behind that the
                // next mount would serve as though it had succeeded.
                if (cacheTtl > 0) cache.delete(url)
                setError(errorMessage)
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        },
        [url, errorMessage, cacheTtl]
    )

    // Always bypasses the cache: this is the "Try again" button and the
    // post-mutation refresh, both of which exist precisely to get a fresh
    // answer.
    const reload = useCallback(() => load({ useCache: false }), [load])

    useEffect(() => {
        load({ useCache: true })
        return () => controllerRef.current?.abort()
    }, [load])

    return { data, setData, loading, error, setError, reload }
}
