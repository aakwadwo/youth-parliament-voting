import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

import { createAdminClient } from '@/lib/supabase-admin'
import { signAdminToken, setAdminCookie } from '@/lib/admin-session'
import { logAdminAction, AUDIT_ACTIONS } from '@/lib/audit-log'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, requireSameOrigin, noStore } from '@/lib/http'
import { jsonError } from '@/lib/api-error'

// A bcrypt hash of 32 random bytes that were discarded — no plaintext matches
// it. When the email does not exist we still run one comparison against this,
// so a wrong email and a wrong password cost the same ~50ms. Without it,
// response timing tells an attacker which administrator addresses are real.
const TIMING_DECOY_HASH = '$2b$10$cNgGeakq0DN.2V3DzL75J.NMgCGUsfEmo8SmfbJWAKPrf/PRPw5.u'

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    const ip = getClientIp(request)
    const ipLimit = await rateLimit('admin-login-ip', ip, RATE_LIMITS.adminLoginIp)
    if (!ipLimit.allowed) {
        return noStore(jsonError('Too many attempts. Please try again later.', 429))
    }

    let body
    try {
        body = await request.json()
    } catch {
        return noStore(jsonError('Invalid request body', 400))
    }

    const { email, password } = body ?? {}

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
        return noStore(jsonError('Email and password are required.', 400))
    }

    const normalisedEmail = email.trim().toLowerCase()

    // Per-account limit as well as per-IP, so rotating IPs does not buy an
    // attacker more guesses against one administrator's password.
    const accountLimit = await rateLimit(
        'admin-login-account',
        normalisedEmail,
        RATE_LIMITS.adminLoginAccount
    )
    if (!accountLimit.allowed) {
        return noStore(
            jsonError('This account is temporarily locked. Please try again later.', 429)
        )
    }

    const supabase = createAdminClient()

    const { data: admin } = await supabase
        .from('admins')
        .select('id, email, role, password_hash')
        .eq('email', normalisedEmail)
        .maybeSingle()

    const valid = await bcrypt.compare(password, admin?.password_hash ?? TIMING_DECOY_HASH)

    if (!admin || !valid) {
        // Failed sign-ins are part of the audit trail: a burst of them against
        // the admin portal during an election is exactly what an investigation
        // needs to see. The password is never recorded.
        await logAdminAction(supabase, AUDIT_ACTIONS.ADMIN_LOGIN_FAILED, {
            actor: normalisedEmail,
            ip,
        })
        return noStore(jsonError('Invalid credentials.', 401))
    }

    const token = await signAdminToken(admin)

    await logAdminAction(supabase, AUDIT_ACTIONS.ADMIN_LOGIN, {
        actor: admin.email,
        ip,
        role: admin.role ?? null,
    })

    return setAdminCookie(
        noStore(NextResponse.json({ success: true, admin: { email: admin.email, role: admin.role } })),
        token
    )
}
