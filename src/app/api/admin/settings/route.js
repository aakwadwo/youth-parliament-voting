import { createAdminClient } from '@/lib/supabase-admin'
import { isUUID } from '@/lib/validation'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction } from '@/lib/audit-log'
import { jsonError, dbError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('election_settings')
        .select('*')
        .single()
    if (error) return dbError(error, 'Could not load settings.')
    return NextResponse.json(data)
}

export async function PATCH(request) {
    let body
    try {
        body = await request.json()
    } catch {
        return jsonError('Invalid request body', 400)
    }

    if (!isUUID(body?.id)) {
        return jsonError('Invalid settings id', 400)
    }
    if (body.election_name !== undefined && (typeof body.election_name !== 'string' || !body.election_name.trim())) {
        return jsonError('Election name cannot be empty', 400)
    }
    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
        return jsonError('is_active must be a boolean', 400)
    }
    for (const field of ['voting_opens_at', 'voting_closes_at']) {
        if (body[field] !== undefined && body[field] !== null && Number.isNaN(new Date(body[field]).getTime())) {
            return jsonError('Invalid date provided', 400)
        }
    }
    if (body.voting_opens_at && body.voting_closes_at
        && new Date(body.voting_opens_at) >= new Date(body.voting_closes_at)) {
        return jsonError('Voting open time must be before the close time', 400)
    }

    const supabase = createAdminClient()

    const { data: before } = await supabase
        .from('election_settings')
        .select('is_active, election_name, voting_opens_at, voting_closes_at')
        .eq('id', body.id)
        .single()

    const { error } = await supabase
        .from('election_settings')
        .update({
            election_name: body.election_name,
            voting_opens_at: body.voting_opens_at,
            voting_closes_at: body.voting_closes_at,
            is_active: body.is_active,
        })
        .eq('id', body.id)

    if (error) return dbError(error, 'Could not save settings.')

    const admin = await getAdminFromRequest(request)

    if (before && before.is_active !== body.is_active) {
        await logAdminAction(supabase, body.is_active ? 'voting_opened' : 'voting_closed', {
            admin_email: admin?.email ?? null,
        })
    }

    const detailFieldsChanged = before && (
        before.election_name !== body.election_name
        || before.voting_opens_at !== body.voting_opens_at
        || before.voting_closes_at !== body.voting_closes_at
    )
    if (detailFieldsChanged) {
        await logAdminAction(supabase, 'election_settings_changed', {
            admin_email: admin?.email ?? null,
            election_name: body.election_name,
            voting_opens_at: body.voting_opens_at,
            voting_closes_at: body.voting_closes_at,
        })
    }

    return NextResponse.json({ success: true })
}
