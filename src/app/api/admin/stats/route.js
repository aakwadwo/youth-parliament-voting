import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createServerSupabaseClient()

    const [{ count: totalVotes }, { data: settings }] = await Promise.all([
        supabase.from('votes').select('*', { count: 'exact', head: true }),
        supabase.from('election_settings').select('*').single(),
    ])

    return NextResponse.json({
        totalVotes: totalVotes ?? 0,
        isActive: settings?.is_active,
        opensAt: settings?.voting_opens_at,
        closesAt: settings?.voting_closes_at,
        electionName: settings?.election_name,
    })
}