import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PATCH(request, { params }) {
    const body = await request.json()
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
        .from('candidates')
        .update(body)
        .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}