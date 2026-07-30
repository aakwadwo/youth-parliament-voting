drop index if exists admin_audit_log_action_idx;
drop index if exists admin_audit_log_actor_idx;

alter table admin_audit_log drop column if exists entity;
alter table admin_audit_log drop column if exists actor_ip;
alter table admin_audit_log drop column if exists actor_email;
