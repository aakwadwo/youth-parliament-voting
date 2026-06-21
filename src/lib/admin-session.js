import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET)

// Best-effort lookup of the admin making the current request, used only to
// attach context to audit log entries. Route access itself is already
// enforced by proxy before the handler runs — this never gates anything.
export async function getAdminFromRequest(request) {
    const token = request.cookies.get('admin_token')?.value
    if (!token) return null
    try {
        const { payload } = await jwtVerify(token, secret)
        return { id: payload.id, email: payload.email, role: payload.role }
    } catch {
        return null
    }
}
