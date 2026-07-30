'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The GET-on-mount-with-reload pattern shared by every admin section, so none
 * of them hand-rolls the same fetch/loading/error boilerplate.
 *
 * Two things it now handles that the previous version did not:
 *
 *  - in-flight requests are aborted when the component unmounts or the URL
 *    changes, so switching admin sections quickly cannot have a slow response
 *    land and call setState on an unmounted component;
 *  - `setError` is returned, because sections need to surface failures from
 *    their own mutations in the same place. Candidates.jsx called a `setLoadError`
 *    that was never returned, which threw a ReferenceError — replacing the
 *    intended error message with a blank screen — every time deactivating a
 *    candidate failed.
 */
export function useFetch(
    url,
    { initialData = null, errorMessage = 'Could not load this data. Please try again.' } = {}
) {
    const [data, setData] = useState(initialData)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const controllerRef = useRef(null)

    const reload = useCallback(async () => {
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
        } catch (err) {
            if (err?.name === 'AbortError') return
            setError(errorMessage)
        } finally {
            if (!controller.signal.aborted) setLoading(false)
        }
    }, [url, errorMessage])

    useEffect(() => {
        reload()
        return () => controllerRef.current?.abort()
    }, [reload])

    return { data, setData, loading, error, setError, reload }
}
