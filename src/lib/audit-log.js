// Inserts a row into admin_audit_log. Logging failures are swallowed (and
// logged server-side) rather than failing the admin action itself — an audit
// log gap is bad, but it should never be the reason a legitimate settings
// change or candidate update gets rejected.
export async function logAdminAction(supabase, action, details = {}) {
    const { error } = await supabase.from('admin_audit_log').insert({ action, details })
    if (error) {
        console.error('[audit-log] failed to record action', action, error)
    }
}
