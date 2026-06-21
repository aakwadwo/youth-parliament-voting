import { createAdminClient } from '@/lib/supabase-admin'
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
import { rateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { jsonError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET)

export async function POST(request) {
    const ip = getClientIp(request)
    const limit = await rateLimit('admin-login', ip, RATE_LIMITS.adminLogin)
    if (!limit.allowed) {
        return jsonError('Too many attempts. Please try again later.', 429)
    }

    let body
    try {
        body = await request.json()
    } catch {
        return jsonError('Invalid request body', 400)
    }

    const { email, password } = body ?? {}

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
        return jsonError('Email and password required', 400)
    }

    const supabase = createAdminClient()

    const { data: admin, error } = await supabase
        .from('admins')
        .select('id, email, role, password_hash')
        .eq('email', email.trim().toLowerCase())
        .single()

    if (error || !admin) {
        return jsonError('Invalid credentials', 401)
    }

    const valid = await bcrypt.compare(password, admin.password_hash)
    if (!valid) {
        return jsonError('Invalid credentials', 401)
    }

    const token = await new SignJWT({ id: admin.id, email: admin.email, role: admin.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('8h')
        .sign(secret)

    const response = NextResponse.json({ success: true })
    response.cookies.set('admin_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 8,
        path: '/',
    })

    return response
}
