import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET)

export const ADMIN_COOKIE = 'admin_token'

// Eight hours covers a full polling day without an administrator being signed
// out mid-count, and expires overnight so an unattended machine is not a
// standing session.
const MAX_AGE_SECONDS = 8 * 60 * 60

export async function signAdminToken(admin) {
    return new SignJWT({ id: admin.id, email: admin.email, role: admin.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${MAX_AGE_SECONDS}s`)
        .sign(secret)
}

export function setAdminCookie(response, token) {
    response.cookies.set(ADMIN_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        // Strict rather than Lax: nothing ever links into the admin portal from
        // another site, so there is no legitimate cross-site navigation that
        // needs to arrive already signed in.
        sameSite: 'strict',
        maxAge: MAX_AGE_SECONDS,
        path: '/',
    })
    return response
}

export function clearAdminCookie(response) {
    response.cookies.set(ADMIN_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0,
        path: '/',
    })
    return response
}

/**
 * The admin making the current request, used to attribute audit entries.
 *
 * Route access itself is already enforced in proxy.js before any handler runs,
 * so this never gates anything — a null result means "we could not attribute
 * this action", not "this request is unauthorised".
 */
export async function getAdminFromRequest(request) {
    const token = request.cookies.get(ADMIN_COOKIE)?.value
    if (!token) return null
    try {
        const { payload } = await jwtVerify(token, secret)
        return { id: payload.id, email: payload.email, role: payload.role }
    } catch {
        return null
    }
}
