import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const constituencyId = searchParams.get('constituency_id')

    if (!constituencyId) {
        return NextResponse.json({ error: 'constituency_id is required' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
        .from('candidates')
        .select('id, full_name, photo_url')
        .eq('constituency_id', constituencyId)
        .eq('is_active', true)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
}