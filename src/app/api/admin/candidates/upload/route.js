import { createAdminClient } from '@/lib/supabase-admin'
import { jsonError, dbError } from '@/lib/api-error'
import { requireSameOrigin, noStore, jsonNoStore } from '@/lib/http'
import { CANDIDATE_PHOTO_BUCKET } from '@/lib/storage'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/**
 * Magic-number signatures for the formats we accept.
 *
 * The declared Content-Type on a multipart part is supplied by the client and
 * is trivially spoofed, so the bytes themselves are checked. Without this, an
 * HTML or SVG file could be stored under a .jpg name and then served from the
 * Storage bucket's own origin.
 */
const SIGNATURES = [
    { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    // WEBP is "RIFF" .... "WEBP"; the size field between them is skipped.
    { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, also: { at: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
]

function detectImageType(buffer) {
    for (const sig of SIGNATURES) {
        const start = sig.offset ?? 0
        const matches = sig.bytes.every((b, i) => buffer[start + i] === b)
        if (!matches) continue
        if (sig.also && !sig.also.bytes.every((b, i) => buffer[sig.also.at + i] === b)) continue
        return sig.type
    }
    return null
}

export async function POST(request) {
    const crossOrigin = requireSameOrigin(request)
    if (crossOrigin) return crossOrigin

    let formData
    try {
        formData = await request.formData()
    } catch {
        return noStore(jsonError('Invalid form data', 400))
    }

    const file = formData.get('file')
    const candidateName = formData.get('candidate_name')

    if (!file || typeof file === 'string') {
        return noStore(jsonError('No file provided', 400))
    }
    if (!candidateName || typeof candidateName !== 'string' || !candidateName.trim()) {
        return noStore(jsonError('A candidate name is required', 400))
    }
    // Checked before reading the body into memory.
    if (file.size > MAX_FILE_SIZE) {
        return noStore(jsonError('The image must be 5MB or smaller.', 400))
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const detectedType = detectImageType(buffer)

    if (!detectedType) {
        return noStore(jsonError('Only JPEG, PNG or WebP images are allowed.', 400))
    }

    const ext = ALLOWED_EXTENSIONS[detectedType]
    const safeName =
        candidateName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'candidate'
    // Random suffix rather than a timestamp: two uploads in the same
    // millisecond would otherwise collide, and upsert would silently replace
    // one candidate's photograph with another's.
    const fileName = `${safeName}-${crypto.randomUUID().slice(0, 8)}.${ext}`

    const supabase = createAdminClient()
    const { error } = await supabase.storage
        .from(CANDIDATE_PHOTO_BUCKET)
        .upload(fileName, buffer, {
            // The type the bytes actually are, not the one the client claimed.
            contentType: detectedType,
            upsert: false,
            cacheControl: '31536000',
        })

    if (error) return dbError(error, 'Could not upload the photo.')

    const {
        data: { publicUrl },
    } = supabase.storage.from(CANDIDATE_PHOTO_BUCKET).getPublicUrl(fileName)

    return jsonNoStore({ url: publicUrl })
}
