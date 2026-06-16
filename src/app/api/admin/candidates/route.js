import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
        .from('candidates')
        .select('*, constituencies(name)')
        .order('full_name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
}

export async function POST(request) {
    const body = await request.json()
    const { full_name, constituency_id, photo_url } = body

    if (!full_name || !constituency_id) {
        return NextResponse.json({ error: 'Name and constituency are required' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
        .from('candidates')
        .insert({ full_name, constituency_id, photo_url })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
}