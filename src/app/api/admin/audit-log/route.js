import { createAdminClient } from '@/lib/supabase-admin'
import { dbError } from '@/lib/api-error'
import { jsonNoStore } from '@/lib/http'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(request) {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)

    // Bounded so a crafted ?limit= cannot ask Postgres for the entire trail.
    const requested = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const limit = Number.isInteger(requested)
        ? Math.min(Math.max(requested, 1), MAX_LIMIT)
        : DEFAULT_LIMIT

    const action = searchParams.get('action')

    let query = supabase
        .from('admin_audit_log')
        .select('id, action, details, actor_email, actor_ip, entity, performed_at')
        .order('performed_at', { ascending: false })
        .limit(limit)

    if (action) query = query.eq('action', action)

    const { data, error } = await query

    if (error) return dbError(error, 'Could not load the audit log.')

    return jsonNoStore(data)
}
