import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.VOTER_JWT_SECRET)
const COOKIE_NAME = 'voter_token'
const MAX_AGE_SECONDS = 30 * 60 // 30 minutes is plenty to pick a candidate and confirm

export async function signVoterToken(voterId) {
    return new SignJWT({ voterId })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(`${MAX_AGE_SECONDS}s`)
        .sign(secret)
}

export function setVoterCookie(response, token) {
    response.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: MAX_AGE_SECONDS,
        path: '/',
    })
}

export function clearVoterCookie(response) {
    response.cookies.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' })
}

// Returns the authenticated voterId from the request cookie, or null if
// missing/invalid/expired. Callers must never trust a client-supplied voter_id.
export async function getVoterIdFromRequest(request) {
    return verifyToken(request.cookies.get(COOKIE_NAME)?.value)
}

/**
 * The same check for server components, which are handed no request object.
 *
 * The ballot page needs this: its identity check used to live in a `useEffect`
 * reading sessionStorage, which is display data the browser can edit, so the
 * page rendered for anyone who put a plausible object there and only the vote
 * API ever checked the real credential. Reading the httpOnly cookie during the
 * server render moves that check in front of the page instead of behind it.
 */
export async function getVoterIdFromCookies(cookieStore) {
    return verifyToken(cookieStore.get(COOKIE_NAME)?.value)
}

async function verifyToken(token) {
    if (!token) return null
    try {
        const { payload } = await jwtVerify(token, secret)
        return payload.voterId ?? null
    } catch {
        return null
    }
}
