import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
        .from('constituencies')
        .select('*, candidates(count)')
        .order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
}

export async function POST(request) {
    const body = await request.json()
    const { name, region, code } = body

    if (!name || !region || !code) {
        return NextResponse.json({ error: 'Name, region and code are required' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
        .from('constituencies')
        .insert({ name, region, code: parseInt(code) })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
}