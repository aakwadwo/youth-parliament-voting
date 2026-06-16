import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request) {
    const formData = await request.formData()
    const file = formData.get('file')
    const candidateName = formData.get('candidate_name')

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = file.name.split('.').pop()
    const fileName = `${candidateName.replace(/\s+g/, '-').toLowerCase()}-${Date.now()}.${ext}`

    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.storage
        .from('candidate-photos')
        .upload(fileName, buffer, { contentType: file.type, upsert: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: { publicUrl } } = supabase.storage
        .from('candidate-photos')
        .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl })
}