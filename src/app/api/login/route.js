import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const body = await request.json()
    const { voter_phone, voter_dob } = body

    if (!voter_phone || !voter_dob) {
        return NextResponse.json({ error: 'Phone number and date of birth are required' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    const { data: voter, error } = await supabase
        .from('voters')
        .select('*, constituencies(name)')
        .eq('voter_phone', voter_phone)
        .eq('voter_dob', voter_dob)
        .single()

    if (error || !voter) {
        return NextResponse.json({ error: 'No voter found with these details. Please register first.' }, { status: 404 })
    }

    // Check if already voted
    const { data: vote } = await supabase
        .from('votes')
        .select('candidate_id, candidates(full_name)')
        .eq('voter_id', voter.id)
        .single()

    return NextResponse.json({
        voter: {
            id: voter.id,
            full_name: voter.full_name,
            voter_dob: voter.voter_dob,
            voter_phone: voter.voter_phone,
            constituency_id: voter.constituency_id,
            constituency_name: voter.constituencies?.name,
        },
        already_voted: !!vote,
        voted_for: vote ? vote.candidates?.full_name : null,
    })
}