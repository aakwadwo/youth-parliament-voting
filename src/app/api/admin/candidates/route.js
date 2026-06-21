import { createAdminClient } from '@/lib/supabase-admin'
import { isUUID, isValidName } from '@/lib/validation'
import { jsonError, dbError, PG_FOREIGN_KEY_VIOLATION } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('candidates')
        .select('id, full_name, photo_url, is_active, constituency_id, constituencies(name)')
        .order('full_name')
    if (error) return dbError(error, 'Could not load candidates.')
    return NextResponse.json(data)
}

export async function POST(request) {
    let body
    try {
        body = await request.json()
    } catch {
        return jsonError('Invalid request body', 400)
    }

    const { full_name, constituency_id, photo_url } = body ?? {}

    if (!full_name || !isValidName(full_name)) {
        return jsonError('A valid candidate name is required', 400)
    }
    if (!isUUID(constituency_id)) {
        return jsonError('A valid constituency is required', 400)
    }
    if (photo_url !== undefined && photo_url !== null && typeof photo_url !== 'string') {
        return jsonError('Invalid photo URL', 400)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('candidates')
        .insert({ full_name: full_name.trim(), constituency_id, photo_url: photo_url ?? null })
        .select('id, full_name, photo_url, is_active, constituency_id')
        .single()

    if (error) {
        if (error.code === PG_FOREIGN_KEY_VIOLATION) {
            return jsonError('Please select a valid constituency', 400)
        }
        return dbError(error, 'Could not add candidate.')
    }
    return NextResponse.json(data)
}
