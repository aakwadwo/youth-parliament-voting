import { jwtVerify } from 'jose'
import { NextResponse } from 'next/server'

const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET)

export async function proxy(request) {
    const { pathname } = request.nextUrl

    const isAdminApi = pathname.startsWith('/api/admin')
        && pathname !== '/api/admin/login'
        && pathname !== '/api/admin/logout'
    const isAdminPage = pathname.startsWith('/admin') && pathname !== '/admin/login'

    if (!isAdminApi && !isAdminPage) {
        return NextResponse.next()
    }

    const token = request.cookies.get('admin_token')?.value

    if (token) {
        try {
            await jwtVerify(token, secret)
            return NextResponse.next()
        } catch {
            // fall through to unauthenticated handling below
        }
    }

    if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.redirect(new URL('/admin/login', request.url))
}

export const config = {
    matcher: ['/admin/:path*', '/api/admin/:path*'],
}
