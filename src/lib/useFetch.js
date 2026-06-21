'use client'

import { useCallback, useEffect, useState } from 'react'

// Shared GET-on-mount-with-reload pattern used by every admin dashboard
// section (Dashboard, Candidates, Constituencies, Results, Settings) so each
// one doesn't hand-roll the same fetch/loading/error boilerplate.
export function useFetch(url, { initialData = null, errorMessage = 'Could not load data. Please refresh the page.' } = {}) {
    const [data, setData] = useState(initialData)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const reload = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const res = await fetch(url)
            const json = await res.json()
            if (!res.ok) throw new Error(json?.error || 'Request failed')
            setData(json)
        } catch {
            setError(errorMessage)
        } finally {
            setLoading(false)
        }
    }, [url, errorMessage])

    useEffect(() => {
        reload()
    }, [reload])

    return { data, setData, loading, error, reload }
}
