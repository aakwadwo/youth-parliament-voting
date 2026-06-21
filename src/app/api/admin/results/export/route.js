import { createAdminClient } from '@/lib/supabase-admin'
import { dbError } from '@/lib/api-error'

function csvCell(value) {
    return `"${String(value).replace(/"/g, '""')}"`
}

export async function GET() {
    const supabase = createAdminClient()

    const { data: rows, error } = await supabase.rpc('get_results')

    if (error) return dbError(error, 'Could not export results.')

    const csv = [
        'Constituency,Candidate,Votes',
        // get_results() already orders by constituency name then votes desc.
        ...rows.map(r => `${csvCell(r.constituency_name)},${csvCell(r.candidate_name)},${r.votes}`)
    ].join('\n')

    return new Response(csv, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="results.csv"',
        },
    })
}
