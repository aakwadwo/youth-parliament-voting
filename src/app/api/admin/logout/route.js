import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase-admin'
import { getAdminFromRequest, clearAdminCookie } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { getClientIp, requireSameOrigin, noStore } from '@/lib/http'

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    const admin = await getAdminFromRequest(request)

    if (admin) {
        // Recorded so the audit trail shows a complete session — when an
        // administrator signed in and when they signed out — rather than
        // sign-ins that never appear to end.
        await logAdminAction(createAdminClient(), AUDIT_ACTIONS.ADMIN_LOGOUT, {
            actor: admin.email,
            ip: getClientIp(request),
        })
    }

    return clearAdminCookie(noStore(NextResponse.json({ success: true })))
}
