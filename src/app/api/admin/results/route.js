import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createServerSupabaseClient()

    const { data: votes, error } = await supabase
        .from('votes')
        .select('candidate_id, constituency_id, candidates(full_name), constituencies(name)')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const map = {}

    for (const vote of votes) {
        const cid = vote.constituency_id
        const cname = vote.constituencies?.name || 'Unknown'
        const candId = vote.candidate_id
        const candName = vote.candidates?.full_name || 'Unknown'

        if (!map[cid]) {
            map[cid] = {
                constituency_id: cid,
                constituency_name: cname,
                total_votes: 0,
                candidates: {},
            }
        }

        map[cid].total_votes++

        if (!map[cid].candidates[candId]) {
            map[cid].candidates[candId] = { name: candName, votes: 0 }
        }

        map[cid].candidates[candId].votes++
    }

    const result = Object.values(map).map(c => ({
        ...c,
        candidates: Object.values(c.candidates).sort((a, b) => b.votes - a.votes),
    })).sort((a, b) => b.total_votes - a.total_votes)

    return NextResponse.json(result)
}