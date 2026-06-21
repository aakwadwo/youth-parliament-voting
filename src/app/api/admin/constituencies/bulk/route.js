import { createAdminClient } from '@/lib/supabase-admin'
import { jsonError, dbError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

const MAX_ROWS = 500

export async function POST(request) {
    let body
    try {
        body = await request.json()
    } catch {
        return jsonError('Invalid request body', 400)
    }

    const { constituencies } = body ?? {}

    if (!Array.isArray(constituencies) || constituencies.length === 0) {
        return jsonError('No data provided', 400)
    }
    if (constituencies.length > MAX_ROWS) {
        return jsonError(`Cannot import more than ${MAX_ROWS} rows at a time`, 400)
    }

    const sanitized = []
    for (const row of constituencies) {
        const name = typeof row?.name === 'string' ? row.name.trim() : ''
        const region = typeof row?.region === 'string' ? row.region.trim() : ''
        const code = parseInt(row?.code, 10)
        if (!name || !region || !Number.isInteger(code) || code < 0) {
            return jsonError('Each row must have a name, region, and valid numeric code', 400)
        }
        sanitized.push({ name, region, code })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
        .from('constituencies')
        .upsert(sanitized, { onConflict: 'code' })

    if (error) return dbError(error, 'Could not import constituencies.')

    return NextResponse.json({ success: true, count: sanitized.length })
}
