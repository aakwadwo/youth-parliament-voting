import { createAdminClient } from '@/lib/supabase-admin'
import { jsonError, dbError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(request) {
    let formData
    try {
        formData = await request.formData()
    } catch {
        return jsonError('Invalid form data', 400)
    }

    const file = formData.get('file')
    const candidateName = formData.get('candidate_name')

    if (!file || typeof file === 'string') {
        return jsonError('No file provided', 400)
    }
    if (!candidateName || typeof candidateName !== 'string' || !candidateName.trim()) {
        return jsonError('candidate_name is required', 400)
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
        return jsonError('Only JPEG, PNG, or WEBP images are allowed', 400)
    }
    if (file.size > MAX_FILE_SIZE) {
        return jsonError('Image must be 5MB or smaller', 400)
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = ALLOWED_EXTENSIONS[file.type]
    const safeName = candidateName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'candidate'
    const fileName = `${safeName}-${Date.now()}.${ext}`

    const supabase = createAdminClient()
    const { error } = await supabase.storage
        .from('candidate-photos')
        .upload(fileName, buffer, { contentType: file.type, upsert: true })

    if (error) return dbError(error, 'Could not upload photo.')

    const { data: { publicUrl } } = supabase.storage
        .from('candidate-photos')
        .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl })
}
