import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const { constituencies } = await request.json()

    if (!Array.isArray(constituencies) || constituencies.length === 0) {
        return NextResponse.json({ error: 'No data provided' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const { error } = await supabase
        .from('constituencies')
        .upsert(constituencies, { onConflict: 'code' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, count: constituencies.length })
}