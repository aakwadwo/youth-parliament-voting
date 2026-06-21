import { createAdminClient } from '@/lib/supabase-admin'
import { isUUID } from '@/lib/validation'
import { jsonError, dbError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const constituencyId = searchParams.get('constituency_id')

    if (!isUUID(constituencyId)) {
        return jsonError('A valid constituency_id is required', 400)
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('candidates')
        .select('id, full_name, photo_url')
        .eq('constituency_id', constituencyId)
        .eq('is_active', true)
        .order('full_name')

    if (error) return dbError(error, 'Could not load candidates.')

    return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    })
}
