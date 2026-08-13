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

/**
 * The role that may reach voter records.
 *
 * `admins.role` has existed since the table was created and has been signed
 * into the session token all along, but until now nothing read it: `proxy.js`
 * verifies the signature and every `/api/admin/*` route trusted that alone, so
 * any administrator was effectively a full administrator. That was harmless
 * while the portal only ever showed aggregates.
 *
 * It stops being harmless with voter search, which is the first surface in the
 * platform that returns a row describing a person. Checking the role here means
 * the day a second, lesser account is created — a returning officer who needs
 * the results screen on polling day, say — it does not silently arrive with
 * access to the register.
 */
export const SUPERADMIN_ROLE = 'superadmin'

/**
 * Whether this request may act on voter records.
 *
 * This is a *second* gate, not the only one: `proxy.js` has already refused
 * every `/api/admin/*` request without a valid session before any handler runs.
 * A null admin here therefore means a token that verified in middleware and did
 * not verify here, which should not happen — so it is treated as a refusal
 * rather than as an attribution failure, unlike `getAdminFromRequest`.
 *
 * @returns {Promise<{ admin: object|null, allowed: boolean }>}
 */
export async function requireSuperadmin(request) {
    const admin = await getAdminFromRequest(request)
    return { admin, allowed: admin?.role === SUPERADMIN_ROLE }
}
