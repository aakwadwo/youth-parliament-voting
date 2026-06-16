import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
        .from('constituencies')
        .select('id, name, region')
        .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
}