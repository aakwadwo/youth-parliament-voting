import { jwtVerify } from 'jose'
import { NextResponse } from 'next/server'

const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET)

export async function middleware(request) {
    const { pathname } = request.nextUrl

    if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
        const token = request.cookies.get('admin_token')?.value

        if (!token) {
            return NextResponse.redirect(new URL('/admin/login', request.url))
        }

        try {
            await jwtVerify(token, secret)
            return NextResponse.next()
        } catch {
            return NextResponse.redirect(new URL('/admin/login', request.url))
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/admin/:path*'],
}