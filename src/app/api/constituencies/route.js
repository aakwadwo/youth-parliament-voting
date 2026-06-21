import { createAdminClient } from '@/lib/supabase-admin'
import { dbError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('constituencies')
        .select('id, name, region')
        .order('name')

    if (error) return dbError(error, 'Could not load constituencies.')

    return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    })
}
