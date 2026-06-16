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
        const key = `${vote.constituency_id}_${vote.candidate_id}`
        if (!map[key]) {
            map[key] = {
                constituency: vote.constituencies?.name || 'Unknown',
                candidate: vote.candidates?.full_name || 'Unknown',
                votes: 0,
            }
        }
        map[key].votes++
    }

    const rows = Object.values(map).sort((a, b) =>
        a.constituency.localeCompare(b.constituency) || b.votes - a.votes
    )

    const csv = [
        'Constituency,Candidate,Votes',
        ...rows.map(r => `"${r.constituency}","${r.candidate}",${r.votes}`)
    ].join('\n')

    return new NextResponse(csv, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="results.csv"',
        },
    })
}