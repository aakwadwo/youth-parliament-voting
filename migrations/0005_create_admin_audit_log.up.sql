create table if not exists admin_audit_log (
    id uuid primary key default gen_random_uuid(),
    action text not null,
    details jsonb,
    performed_at timestamptz not null default now()
);

create index if not exists admin_audit_log_performed_at_idx
    on admin_audit_log (performed_at desc);
