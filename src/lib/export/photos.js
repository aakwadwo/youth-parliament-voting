import sharp from 'sharp'

import { isAllowedPhotoUrl } from '@/lib/storage'

/**
 * Fetches candidate photographs and prepares them for embedding in a PDF.
 *
 * The photos live in Supabase Storage, so a PDF that shows them has to pull the
 * bytes back over the network. Four things matter here, and none of them is the
 * happy path:
 *
 * 1. **Nothing may block the export.** A register with a missing photograph is
 *    still a usable register; a register that never downloads is not. Every
 *    failure — a timeout, a 404, an oversized file, an unreadable format —
 *    resolves to "no photo" and the document carries on.
 *
 * 2. **The URL is not trusted.** `isAllowedPhotoUrl` already gates what can be
 *    written to `candidates.photo_url`, but this is the place where the server
 *    makes an outbound request to whatever that column happens to contain, so
 *    the same check runs again before the fetch. Without it, a row written by
 *    any future path that forgets to validate turns this export into an SSRF
 *    primitive pointed at the cluster's internal network.
 *
 * 3. **Bounded work.** Concurrency, per-image bytes and decoded pixel count are
 *    all capped, so a register of several hundred candidates is a few seconds
 *    of parallel work rather than a serial crawl or a heap full of images.
 *
 * 4. **The original resolution is thrown away before it reaches the PDF.** See
 *    `toPortrait` below — this is what keeps the register a document somebody
 *    can email.
 */

/**
 * The size a portrait is embedded at.
 *
 * The register draws each photograph as a 24pt circle. 24pt is a third of an
 * inch, so a 144px square is 432 dpi on paper — comfortably past the ~300 dpi
 * where print stops improving, with headroom for a reader zooming in on screen.
 *
 * The photographs as uploaded are phone-camera originals: a real register of
 * 125 candidates carried 26MB of them, and pdfkit passes JPEG through
 * untouched, so the finished PDF was 27.9MB of multi-megapixel images displayed
 * at a third of an inch. Downscaling first is the entire difference between a
 * document that can be emailed to a returning officer and one that cannot.
 */
const PORTRAIT_PX = 144
const PORTRAIT_QUALITY = 82

/**
 * How large a source image may be before it is refused.
 *
 * Deliberately larger than the 5MB the upload endpoint enforces, and not the
 * same policy. The upload limit governs what may be *stored*; this governs what
 * this function is willing to *download and decode*, and its job is to stop one
 * pathological file exhausting the export's time and memory. A handful of
 * photographs in the register predate the upload limit and sit above it — since
 * they are downscaled to a 144px thumbnail before anything else sees them,
 * refusing to process them would drop a portrait for no benefit to anyone.
 */
const MAX_BYTES = 12 * 1024 * 1024

/** Roughly a 46-megapixel image: past any real camera, short of a decode bomb. */
const MAX_PIXELS = 46e6

const TIMEOUT_MS = 15000
const CONCURRENCY = 8

/**
 * Downscales one photograph to the size it is actually shown at.
 *
 * `rotate()` with no argument applies the EXIF orientation tag and then strips
 * it, which matters because these are phone photographs: several in the real
 * register are stored rotated with an orientation flag, and pdfkit does not
 * read EXIF. Without this they would print sideways.
 *
 * `fit: 'cover'` crops to a square rather than letterboxing, matching the
 * circular mask the register draws — the alternative would put bars inside the
 * circle. `position: 'top'` because these are portraits and the head is at the
 * top; centring a tall photograph crops the face out of a head-and-shoulders
 * shot.
 *
 * The output is always baseline JPEG, so a WebP upload — which pdfkit cannot
 * decode at all and which previously fell back to initials — now embeds fine.
 */
async function toPortrait(buffer) {
    return sharp(buffer, { limitInputPixels: MAX_PIXELS })
        .rotate()
        .resize(PORTRAIT_PX, PORTRAIT_PX, { fit: 'cover', position: 'top' })
        .jpeg({ quality: PORTRAIT_QUALITY, mozjpeg: true, progressive: false })
        .toBuffer()
}

async function fetchOne(url) {
    if (!isAllowedPhotoUrl(url)) return null

    let source
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: 'no-store',
        })
        if (!response.ok) return null

        // Trusted only as an early exit; the real limit is the byte length
        // below, since Content-Length can be absent or wrong.
        const declared = Number(response.headers.get('content-length'))
        if (Number.isFinite(declared) && declared > MAX_BYTES) return null

        source = Buffer.from(await response.arrayBuffer())
        if (source.length === 0 || source.length > MAX_BYTES) return null
    } catch {
        return null
    }

    try {
        return await toPortrait(source)
    } catch (error) {
        // A photograph that cannot be decoded is not a reason to fail the
        // export, and it is not a reason to embed the original either — the
        // original is what this function exists to avoid. The candidate gets
        // the lettered placeholder, and the reason is logged so a genuinely
        // corrupt upload can be found and replaced.
        console.warn('[photos] could not prepare portrait', url, error.message)
        return null
    }
}

/**
 * @param {string[]} urls
 * @returns {Promise<Map<string, Buffer>>} url → portrait JPEG, missing on failure
 */
export async function fetchPhotos(urls) {
    // De-duplicated: two candidates sharing a photo URL is unusual but costs
    // nothing to handle, and the map is keyed by URL anyway.
    const unique = [...new Set(urls.filter(Boolean))]
    const photos = new Map()

    let cursor = 0
    const workers = Array.from({ length: Math.min(CONCURRENCY, unique.length) }, async () => {
        while (cursor < unique.length) {
            const url = unique[cursor++]
            const buffer = await fetchOne(url)
            if (buffer) photos.set(url, buffer)
        }
    })

    await Promise.all(workers)
    return photos
}
