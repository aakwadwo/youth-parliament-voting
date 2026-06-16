import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const body = await request.json()
    const { full_name, voter_dob, voter_phone, constituency_id } = body

    if (!full_name || !voter_dob || !voter_phone || !constituency_id) {
        return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    // Validate age
    const dob = new Date(voter_dob)
    const age = Math.floor((new Date() - dob) / (1000 * 60 * 60 * 24 * 365.25))
    if (age < 18 || age > 35) {
        return NextResponse.json({ error: 'You must be between 18 and 35 years old' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    // Check if phone already registered
    const { data: existing } = await supabase
        .from('voters')
        .select('id')
        .eq('voter_phone', voter_phone)
        .single()

    if (existing) {
        return NextResponse.json({ error: 'This phone number is already registered. Please login instead.' }, { status: 409 })
    }

    // Register voter
    const { data, error } = await supabase
        .from('voters')
        .insert({ full_name, voter_dob, voter_phone, constituency_id })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
}