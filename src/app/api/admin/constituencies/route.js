import { createAdminClient } from '@/lib/supabase-admin'
import { jsonError, dbError, PG_UNIQUE_VIOLATION } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('constituencies')
        .select('id, name, region, code, candidates(count)')
        .order('name')
    if (error) return dbError(error, 'Could not load constituencies.')
    return NextResponse.json(data)
}

export async function POST(request) {
    let body
    try {
        body = await request.json()
    } catch {
        return jsonError('Invalid request body', 400)
    }

    const { name, region, code } = body ?? {}
    const codeNum = parseInt(code, 10)

    if (!name?.trim() || !region?.trim() || !Number.isInteger(codeNum) || codeNum < 0) {
        return jsonError('Name, region and a valid numeric code are required', 400)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('constituencies')
        .insert({ name: name.trim(), region: region.trim(), code: codeNum })
        .select('id, name, region, code')
        .single()

    if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
            return jsonError('A constituency with this code already exists', 409)
        }
        return dbError(error, 'Could not add constituency.')
    }
    return NextResponse.json(data)
}
