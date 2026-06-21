import { createAdminClient } from '@/lib/supabase-admin'
import { isUUID, isValidName } from '@/lib/validation'
import { getAdminFromRequest } from '@/lib/admin-session'
import { logAdminAction } from '@/lib/audit-log'
import { jsonError, dbError, PG_FOREIGN_KEY_VIOLATION } from '@/lib/api-error'
import { NextResponse } from 'next/server'

const ALLOWED_FIELDS = ['full_name', 'constituency_id', 'photo_url', 'is_active']

export async function PATCH(request, { params }) {
    const { id } = await params

    if (!isUUID(id)) {
        return jsonError('Invalid candidate id', 400)
    }

    let body
    try {
        body = await request.json()
    } catch {
        return jsonError('Invalid request body', 400)
    }

    const update = {}
    for (const field of ALLOWED_FIELDS) {
        if (body?.[field] !== undefined) update[field] = body[field]
    }

    if (Object.keys(update).length === 0) {
        return jsonError('No valid fields to update', 400)
    }
    if (update.full_name !== undefined && !isValidName(update.full_name)) {
        return jsonError('A valid candidate name is required', 400)
    }
    if (update.constituency_id !== undefined && !isUUID(update.constituency_id)) {
        return jsonError('A valid constituency is required', 400)
    }
    if (update.is_active !== undefined && typeof update.is_active !== 'boolean') {
        return jsonError('is_active must be a boolean', 400)
    }
    if (update.photo_url !== undefined && update.photo_url !== null && typeof update.photo_url !== 'string') {
        return jsonError('Invalid photo URL', 400)
    }
    if (update.full_name !== undefined) {
        update.full_name = update.full_name.trim()
    }

    const supabase = createAdminClient()

    const { error } = await supabase
        .from('candidates')
        .update(update)
        .eq('id', id)

    if (error) {
        if (error.code === PG_FOREIGN_KEY_VIOLATION) {
            return jsonError('Please select a valid constituency', 400)
        }
        return dbError(error, 'Could not update candidate.')
    }

    if (update.is_active !== undefined) {
        const admin = await getAdminFromRequest(request)
        const { data: candidate } = await supabase
            .from('candidates')
            .select('full_name')
            .eq('id', id)
            .single()

        await logAdminAction(supabase, update.is_active ? 'candidate_activated' : 'candidate_deactivated', {
            admin_email: admin?.email ?? null,
            candidate_id: id,
            candidate_name: candidate?.full_name ?? null,
        })
    }

    return NextResponse.json({ success: true })
}
