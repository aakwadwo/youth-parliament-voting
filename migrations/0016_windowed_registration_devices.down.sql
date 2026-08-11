-- Reverses 0016, restoring the lifetime-counter device controls from 0014.
--
-- Destroys the windowed event log. That log holds only digests and timestamps —
-- no personal data — and its loss simply grants every device a fresh allowance,
-- so this is safe to run. `registration_devices` was never dropped by the up
-- migration, so its counters are still there to be restored to service.

drop function if exists prune_registration_events(interval, integer);
drop function if exists record_registration_device(text, text);
drop function if exists check_registration_device(text, text, integer, integer, integer, integer, integer, integer);
drop function if exists registration_window_retry(text, integer, integer);
drop table if exists registration_events;

comment on table registration_devices is
    'Anti-abuse counters for voter registration, keyed by a peppered HMAC digest. Contains no personal data and no link to any voter. Safe to truncate, which releases all device restrictions.';

create or replace function check_registration_device(
    p_token_hash text,
    p_environment_hash text,
    p_token_limit integer,
    p_environment_limit integer
)
returns table (allowed boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_token_count integer := 0;
    v_environment_count integer := 0;
begin
    if p_token_hash is not null then
        select coalesce(registration_count, 0) into v_token_count
        from registration_devices
        where device_hash = p_token_hash;

        if coalesce(v_token_count, 0) >= p_token_limit then
            return query select false, 'device'::text;
            return;
        end if;
    end if;

    if p_environment_hash is not null then
        select coalesce(registration_count, 0) into v_environment_count
        from registration_devices
        where device_hash = p_environment_hash;

        if coalesce(v_environment_count, 0) >= p_environment_limit then
            return query select false, 'environment'::text;
            return;
        end if;
    end if;

    return query select true, 'ok'::text;
end;
$$;

create or replace function record_registration_device(
    p_token_hash text,
    p_environment_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_token_hash is not null then
        insert into registration_devices (device_hash, signal_kind, registration_count)
        values (p_token_hash, 'token', 1)
        on conflict (device_hash) do update
            set registration_count = registration_devices.registration_count + 1,
                last_registered_at = now();
    end if;

    if p_environment_hash is not null then
        insert into registration_devices (device_hash, signal_kind, registration_count)
        values (p_environment_hash, 'environment', 1)
        on conflict (device_hash) do update
            set registration_count = registration_devices.registration_count + 1,
                last_registered_at = now();
    end if;
end;
$$;

revoke all on function check_registration_device(text, text, integer, integer) from public, anon, authenticated;
revoke all on function record_registration_device(text, text) from public, anon, authenticated;
