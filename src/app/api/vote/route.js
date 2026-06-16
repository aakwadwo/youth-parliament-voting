import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const body = await request.json()
    const { voter_id, candidate_id, constituency_id } = body

    if (!voter_id || !candidate_id || !constituency_id) {
        return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    // Check election is active and within window
    const { data: settings } = await supabase
        .from('election_settings')
        .select('is_active, voting_opens_at, voting_closes_at')
        .single()

    if (!settings?.is_active) {
        return NextResponse.json({ error: 'Voting is not currently open' }, { status: 403 })
    }

    const now = new Date()
    if (settings.voting_opens_at && new Date(settings.voting_opens_at) > now) {
        return NextResponse.json({ error: 'Voting has not opened yet' }, { status: 403 })
    }
    if (settings.voting_closes_at && new Date(settings.voting_closes_at) < now) {
        return NextResponse.json({ error: 'Voting has closed' }, { status: 403 })
    }

    // Check voter hasn't already voted
    const { data: existing } = await supabase
        .from('votes')
        .select('id')
        .eq('voter_id', voter_id)
        .single()

    if (existing) {
        return NextResponse.json({ error: 'You have already voted' }, { status: 409 })
    }

    // Insert vote
    const { error } = await supabase.from('votes').insert({
        voter_id,
        candidate_id,
        constituency_id,
    })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}