import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
        .from('election_settings')
        .select('*')
        .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
}

export async function PATCH(request) {
    const body = await request.json()
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
        .from('election_settings')
        .update({
            election_name: body.election_name,
            voting_opens_at: body.voting_opens_at,
            voting_closes_at: body.voting_closes_at,
            is_active: body.is_active,
        })
        .eq('id', body.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}