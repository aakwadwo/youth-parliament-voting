import { createAdminClient } from '@/lib/supabase-admin'
import { dbError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createAdminClient()

    // get_results() aggregates with GROUP BY in Postgres (see
    // migrations/0004_add_get_results_function.up.sql) — this route never
    // pulls individual vote rows into memory, so it scales independently of
    // how many ballots have been cast.
    const { data: rows, error } = await supabase.rpc('get_results')

    if (error) return dbError(error, 'Could not load results.')

    const map = new Map()

    for (const row of rows) {
        if (!map.has(row.constituency_id)) {
            map.set(row.constituency_id, {
                constituency_id: row.constituency_id,
                constituency_name: row.constituency_name,
                total_votes: 0,
                candidates: [],
            })
        }
        const entry = map.get(row.constituency_id)
        entry.total_votes += Number(row.votes)
        entry.candidates.push({ name: row.candidate_name, votes: Number(row.votes) })
    }

    // get_results() already orders by constituency name then votes desc;
    // Map preserves that insertion order, so no further sorting is needed.
    return NextResponse.json(Array.from(map.values()))
}
