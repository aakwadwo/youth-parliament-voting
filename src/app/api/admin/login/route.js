import { createServerSupabaseClient } from '@/lib/supabase-server'
import { SignJWT } from 'jose'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET)

export async function POST(request) {
    const { email, password } = await request.json()

    if (!email || !password) {
        return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    const { data: admin, error } = await supabase
        .from('admins')
        .select('*')
        .eq('email', email)
        .single()

    if (error || !admin) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, admin.password_hash)
    if (!valid) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
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