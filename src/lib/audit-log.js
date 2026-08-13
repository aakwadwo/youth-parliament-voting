/**
 * Every administrative action that can affect an election outcome is recorded
 * here: opening and closing voting, changing the voting window, activating or
 * deactivating a candidate, signing in, and exporting results.
 *
 * Failures are logged and swallowed rather than failing the action itself. A
 * gap in the audit trail is bad, but it must never be the reason a returning
 * officer cannot close voting at the scheduled time.
 */
export const AUDIT_ACTIONS = {
    ADMIN_LOGIN: 'admin_login',
    ADMIN_LOGIN_FAILED: 'admin_login_failed',
    ADMIN_LOGOUT: 'admin_logout',
    VOTING_OPENED: 'voting_opened',
    VOTING_CLOSED: 'voting_closed',
    SETTINGS_CHANGED: 'election_settings_changed',
    CANDIDATE_CREATED: 'candidate_created',
    CANDIDATE_UPDATED: 'candidate_updated',
    CANDIDATE_ACTIVATED: 'candidate_activated',
    CANDIDATE_DEACTIVATED: 'candidate_deactivated',
    CONSTITUENCY_CREATED: 'constituency_created',
    CONSTITUENCY_IMPORTED: 'constituency_imported',
    // Renaming a constituency changes a label the whole platform renders, so
    // the entry carries the previous name as well as the new one.
    CONSTITUENCY_UPDATED: 'constituency_updated',
    RESULTS_EXPORTED: 'results_exported',
    // Releasing the count to the public, and withdrawing it again. Recorded
    // separately from the export because exporting a report is an internal act
    // and this one puts figures in front of the country.
    RESULTS_PUBLISHED: 'results_published',
    RESULTS_UNPUBLISHED: 'results_unpublished',
    CANDIDATE_LIST_EXPORTED: 'candidate_list_exported',
    // Aggregate registration figures leaving the portal as a document. Recorded
    // with the totals it stated, so the trail shows what was circulated.
    REGISTRATION_STATS_EXPORTED: 'registration_stats_exported',
    // Correcting the constituency on a registration. The only administrative
    // action in the platform that writes to the `voters` table, and the only
    // one that changes which ballot paper a person is shown — so the entry
    // carries the previous constituency as well as the new one. It carries no
    // name, number or date of birth: see `constituencyChangeAudit` in
    // `@/lib/voter-admin` for why.
    VOTER_CONSTITUENCY_CHANGED: 'voter_constituency_changed',
}

export async function logAdminAction(supabase, action, { actor, ip, entity, ...details } = {}) {
    const { error } = await supabase.from('admin_audit_log').insert({
        action,
        actor_email: actor ?? null,
        actor_ip: ip ?? null,
        entity: entity ?? null,
        // admin_email stays inside details as well, so entries written before
        // migration 0010 and entries written after it read identically.
        details: { ...details, admin_email: actor ?? null },
    })

    if (error) {
        console.error('[audit-log] failed to record action', action, error)
    }
}
