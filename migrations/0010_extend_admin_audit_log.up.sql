-- Promotes the fields an auditor actually filters on out of the details jsonb
-- and into real, indexed columns, and starts recording who acted from where.
--
-- An election audit trail is only useful if you can answer "who closed voting,
-- from what address, and when" without scanning a JSON blob.

alter table admin_audit_log
    add column if not exists actor_email text;

alter table admin_audit_log
    add column if not exists actor_ip text;

alter table admin_audit_log
    add column if not exists entity text;

-- Backfill the actor from rows written before these columns existed.
update admin_audit_log
   set actor_email = details ->> 'admin_email'
 where actor_email is null
   and details ? 'admin_email';

create index if not exists admin_audit_log_action_idx
    on admin_audit_log (action, performed_at desc);

create index if not exists admin_audit_log_actor_idx
    on admin_audit_log (actor_email, performed_at desc);
