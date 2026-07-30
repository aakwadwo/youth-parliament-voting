const BUCKET = 'candidate-photos'

/**
 * The public URL prefix candidate photographs must sit under.
 *
 * Anything rendered into an `<img src>` on the ballot should come from storage
 * we control. An arbitrary external URL would let whoever set it observe every
 * voter who loads that ballot — their IP address, rough location and the fact
 * that they are voting in that constituency at that moment. Pinning the origin
 * to our own Supabase Storage bucket removes that as a possibility, and matches
 * what `next.config.mjs` will actually allow the image optimizer to fetch.
 */
export function allowedPhotoPrefix() {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!base) return null
    return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/`
}

export function isAllowedPhotoUrl(value) {
    if (typeof value !== 'string' || value === '') return false

    const prefix = allowedPhotoPrefix()
    // Without a configured Supabase URL there is nothing to validate against;
    // require an https URL rather than failing open on any string.
    if (!prefix) {
        try {
            return new URL(value).protocol === 'https:'
        } catch {
            return false
        }
    }

    return value.startsWith(prefix)
}

export const CANDIDATE_PHOTO_BUCKET = BUCKET
