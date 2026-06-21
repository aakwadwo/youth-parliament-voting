import { createAdminClient } from '@/lib/supabase-admin'
import { dbError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createAdminClient()

    const [{ count: totalVotes, error: votesError }, { data: settings, error: settingsError }] = await Promise.all([
        supabase.from('votes').select('*', { count: 'exact', head: true }),
        supabase.from('election_settings').select('*').single(),
    ])

    if (votesError || settingsError) {
        return dbError(votesError || settingsError, 'Could not load dashboard stats.')
    }

    return NextResponse.json({
        totalVotes: totalVotes ?? 0,
        isActive: settings?.is_active,
        opensAt: settings?.voting_opens_at,
        closesAt: settings?.voting_closes_at,
        electionName: settings?.election_name,
    })
}
