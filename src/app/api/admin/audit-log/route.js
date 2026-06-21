import { createAdminClient } from '@/lib/supabase-admin'
import { dbError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('admin_audit_log')
        .select('id, action, details, performed_at')
        .order('performed_at', { ascending: false })
        .limit(20)

    if (error) return dbError(error, 'Could not load audit log.')

    return NextResponse.json(data)
}
