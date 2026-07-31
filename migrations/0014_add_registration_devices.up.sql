-- One device, one registration.
--
-- WHAT THIS IS FOR
--
-- Voter authentication here is a phone number plus a date of birth. Neither is
-- secret, and a SIM card costs very little, so the cheapest attack on the
-- register is one person sitting with a stack of SIMs registering voters who
-- will never turn up. The unique index on voters.voter_phone stops the *same*
-- number being registered twice; nothing stopped one operator registering many
-- different numbers. This table is that missing constraint.
--
-- WHAT IS STORED, AND WHAT IS DELIBERATELY NOT
--
-- Only an HMAC-SHA256 digest, a count, and two timestamps. No IP address, no
-- user agent, no voter id, no phone number — nothing that identifies a person,
-- and no column that links a device back to the voter it registered. That link
-- is omitted on purpose: correlating "which device registered which voter"
-- would create exactly the kind of dossier an electoral register should not
-- keep, and nothing in the product needs it.
--
-- The digest is keyed with a server-side pepper derived from VOTER_JWT_SECRET
-- (see src/lib/device-registration.js). Without that secret the digests cannot
-- be reversed or even brute-forced from a candidate IP list, so a leaked dump
-- of this table reveals nothing about who registered from where.
--
-- TWO KINDS OF ROW, BECAUSE ONE SIGNAL IS NOT ENOUGH
--
--   'token'        digest of a random id held in an httpOnly cookie. Exact and
--                  collision-free: it identifies one browser profile and
--                  nothing else. Limit 1 — this is the actual "one device, one
--                  registration" rule.
--
--   'environment'  digest of coarse network and client characteristics. This
--                  exists only because the token is defeated by clearing
--                  cookies. It is a backstop, NOT an identity.
--
-- THE TRADE-OFF, STATED PLAINLY
--
-- There is no way on the open web to bind a registration to a physical device
-- in a way a determined person cannot defeat. Anything strong enough to survive
-- cookie clearing is invasive fingerprinting with a real false-positive rate.
-- On Ghana's mobile networks, where carrier-grade NAT puts very large numbers
-- of subscribers behind very few addresses, an environment digest WILL collide
-- between unrelated people — the same collapse this codebase already accounts
-- for in its per-IP rate limits.
--
-- Wrongly refusing a real voter is worse than admitting a duplicate the phone
-- constraint would catch anyway. So the two layers are tuned differently: the
-- token layer is exact and hard-limited to 1, while the environment layer is
-- given deliberate headroom (see ENVIRONMENT_REGISTRATION_LIMIT) so that a
-- shared address or a household phone does not disenfranchise anyone, while a
-- SIM farm still runs into a wall quickly.

create table if not exists registration_devices (
    -- HMAC-SHA256 hex digest. Never a raw identifier.
    device_hash text primary key,

    signal_kind text not null check (signal_kind in ('token', 'environment')),

    registration_count integer not null default 0,
    first_seen_at timestamptz not null default now(),
    last_registered_at timestamptz not null default now()
);

comment on table registration_devices is
    'Anti-abuse counters for voter registration, keyed by a peppered HMAC digest. Contains no personal data and no link to any voter. Safe to truncate, which releases all device restrictions.';

-- Supports the operational query "what has been registering recently", and any
-- future retention policy that drops rows after the election.
create index if not exists registration_devices_last_registered_at_idx
    on registration_devices (last_registered_at);

-- No policies: PostgREST must refuse this table to anon and authenticated
-- entirely. The app reaches it only via the service-role key. Were the anon key
-- able to write here, an attacker could pre-claim digests and lock real voters
-- out of registering — a denial-of-registration attack.
alter table registration_devices enable row level security;

/**
 * Read-only eligibility check. Runs before the voter row is inserted.
 *
 * Separated from recording on purpose. If this function also consumed the
 * allowance, a registration that then failed validation or hit the unique
 * phone index would burn the device's only slot and permanently lock out a
 * legitimate voter. Checking first and recording only after the insert
 * succeeds leaves a narrow race — two simultaneous registrations from one
 * device could both pass — which is a far better failure than false lockout,
 * and is bounded by the phone uniqueness constraint regardless.
 */
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

/**
 * Records a completed registration against both digests.
 *
 * Called only after the voter row exists, so a device is never charged for a
 * registration that did not happen.
 */
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

-- security definer functions must not be reachable with the public anon key.
revoke all on function check_registration_device(text, text, integer, integer) from public, anon, authenticated;
revoke all on function record_registration_device(text, text) from public, anon, authenticated;
