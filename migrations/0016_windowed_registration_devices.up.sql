-- Registration device controls become ROLLING WINDOWS instead of permanent counters.
--
-- WHY THIS REPLACES MIGRATION 0014
--
-- 0014 stored one row per device digest holding a lifetime `registration_count`,
-- and refused once that count reached its limit. Two consequences followed from
-- the word "lifetime", and both of them refuse real voters:
--
--   * The token limit was 1, so the second person to use a browser profile could
--     never register from it. A household phone, a school computer or a
--     cybercafé machine enrolled exactly one voter, ever. The people this hurt
--     are precisely the people least likely to own a device of their own.
--
--   * Neither counter ever decayed. A registration drive in June permanently
--     consumed capacity that a voter needed on polling day in August. The
--     controls got strictly more likely to refuse a legitimate voter the longer
--     the election ran, which is exactly backwards.
--
-- The replacement records one timestamped row per successful registration and
-- counts the rows inside a moving window. Capacity is returned automatically as
-- events age out, so a device that registered its allowance last week starts
-- polling day with a clean allowance.
--
-- THE POLICY THIS ENFORCES (limits are supplied by the caller, not hardcoded
-- here — see REGISTRATION_DEVICE_LIMITS in src/lib/device-registration.js)
--
--   token layer        the real device identity: a server-minted id in an
--                      httpOnly cookie. Governed by two windows. The short one
--                      carries the anti-abuse work: filling in this form takes
--                      a person a minute or two and takes a script a second, so
--                      a brief window is invisible to a family or a queue at a
--                      registration desk and expensive for anything automated.
--                      The daily figure is a ceiling set well above any
--                      realistic legitimate volume — it exists only to bound an
--                      unattended script, because a daily cap cannot tell a
--                      busy desk apart from a bot and an attacker can simply
--                      wait or move network to defeat one.
--
--   environment layer  a digest of the client address and a coarsened device
--                      class. Exists only because the cookie is defeated by
--                      clearing site data or opening a private window. It
--                      collides between unrelated people behind carrier-grade
--                      NAT, so its limits are deliberately several times looser
--                      than the token layer's. It is a backstop, never an
--                      identity.
--
-- WHAT IS STORED, AND WHAT IS DELIBERATELY NOT
--
-- A digest, a signal kind and a timestamp. No IP address, no user agent, no
-- voter id, no phone number, and no column that could associate a device with
-- the voter it registered — that association is omitted on purpose, because
-- correlating "which device registered which voter" would build exactly the
-- dossier an electoral register must not keep. Nothing here is read by the
-- login or voting paths, so nothing here can ever decide whether a ballot is
-- accepted.
--
-- The digests are HMAC-SHA256 keyed with a server-side pepper derived from
-- VOTER_JWT_SECRET (src/lib/device-registration.js). Without that secret they
-- cannot be reversed, nor brute-forced from a candidate list of addresses.
--
-- WHAT HAPPENS TO THE 0014 TABLE
--
-- `registration_devices` is left in place but is no longer read or written by
-- any application code, so its stale lifetime counters cannot refuse anyone.
-- It is kept rather than dropped so that this migration destroys no data and
-- can be reversed; drop it separately once the new path has been observed in
-- production.

create table if not exists registration_events (
    id bigint generated always as identity primary key,

    -- HMAC-SHA256 hex digest of either the device token or the coarse
    -- environment. Never a raw identifier.
    device_hash text not null,

    signal_kind text not null check (signal_kind in ('token', 'environment')),

    occurred_at timestamptz not null default now()
);

comment on table registration_events is
    'One row per successful voter registration, keyed by a peppered HMAC device digest. Used only to rate-limit registration over rolling windows. Contains no personal data and no link to any voter, and is never consulted when authorising a vote. Safe to truncate, which releases all device restrictions.';

-- Every read is "count the rows for this digest since a cutoff", so the digest
-- leads and the timestamp follows. Descending, because the retry calculation
-- also wants the most recent rows first.
create index if not exists registration_events_hash_time_idx
    on registration_events (device_hash, occurred_at desc);

-- Pruning scans by age alone.
create index if not exists registration_events_occurred_at_idx
    on registration_events (occurred_at);

-- No policies, so PostgREST refuses this table to anon and authenticated
-- entirely; the app reaches it only through the service-role key. Were the
-- public key able to write here, an attacker could pre-fill a digest's window
-- and lock real voters out of registering — a denial-of-registration attack.
alter table registration_events enable row level security;

comment on table registration_devices is
    'DEPRECATED by migration 0016. Lifetime registration counters, no longer read or written by the application. Superseded by registration_events, which applies the same controls over rolling windows. Retained only so 0016 is reversible; safe to drop once the windowed path is confirmed in production.';

/**
 * How long one digest must wait before it is under `p_limit` again, or NULL
 * when it is already under the limit and the registration may proceed.
 *
 * Factored out because the check below applies it four times — two windows
 * against each of two signals — and four hand-written copies of a window
 * calculation is four chances to get one of them subtly wrong.
 *
 * The wait is derived from the p_limit-th most recent event inside the window:
 * that is the event whose expiry frees the first slot. Returning it costs one
 * extra pass over rows already fetched, and it is what lets the application
 * distinguish "wait a moment" from "wait until tomorrow" in its own logs.
 */
create or replace function registration_window_retry(
    p_hash text,
    p_limit integer,
    p_seconds integer
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_count integer;
    v_frees_at timestamptz;
begin
    -- A limit of zero would block every registration, and a non-positive window
    -- would make the count meaningless. Both indicate a caller bug, and both
    -- would otherwise fail silently in the direction of refusing voters.
    if p_limit <= 0 or p_seconds <= 0 then
        raise exception 'registration_window_retry: limit and window must be positive (got % / %)',
            p_limit, p_seconds;
    end if;

    if p_hash is null then
        return null;
    end if;

    select count(*), min(occurred_at) filter (where rn <= p_limit)
      into v_count, v_frees_at
      from (
          select occurred_at,
                 row_number() over (order by occurred_at desc) as rn
            from registration_events
           where device_hash = p_hash
             and occurred_at > now() - make_interval(secs => p_seconds)
      ) recent;

    if v_count < p_limit then
        return null;
    end if;

    return greatest(
        1,
        ceil(extract(epoch from (v_frees_at + make_interval(secs => p_seconds) - now())))::integer
    );
end;
$$;

-- The 0014 signature took two lifetime limits. Dropped explicitly rather than
-- left as an overload: two functions of the same name, one enforcing a policy
-- that has been withdrawn, is how a stale deployment silently keeps refusing
-- voters after the policy changed.
drop function if exists check_registration_device(text, text, integer, integer);

/**
 * Read-only eligibility check. Runs before the voter row is inserted.
 *
 * Separated from recording on purpose. If this also consumed the allowance,
 * a registration that then failed validation, or hit the unique phone index,
 * would burn a slot for an attempt that never created a voter. Checking first
 * and recording only after the insert succeeds leaves a narrow race — two
 * simultaneous registrations from one device can both pass — which is a far
 * better failure than refusing a legitimate voter, and is bounded by the phone
 * uniqueness constraint regardless.
 *
 * The two signals share the same pair of windows but carry their own limits,
 * because they mean different things: the token is one browser profile, while
 * the environment digest may be an entire town behind one NAT address.
 *
 * Checked tightest-scope-first, so the reason reported names the device's own
 * allowance rather than the fuzzy backstop wherever both would apply.
 */
create or replace function check_registration_device(
    p_token_hash               text,
    p_environment_hash         text,
    p_burst_seconds            integer,
    p_token_burst_limit        integer,
    p_environment_burst_limit  integer,
    p_daily_seconds            integer,
    p_token_daily_limit        integer,
    p_environment_daily_limit  integer
)
returns table (allowed boolean, reason text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_retry integer;
begin
    if p_token_hash is not null then
        v_retry := registration_window_retry(p_token_hash, p_token_burst_limit, p_burst_seconds);
        if v_retry is not null then
            return query select false, 'device_burst'::text, v_retry;
            return;
        end if;

        v_retry := registration_window_retry(p_token_hash, p_token_daily_limit, p_daily_seconds);
        if v_retry is not null then
            return query select false, 'device_daily'::text, v_retry;
            return;
        end if;
    end if;

    if p_environment_hash is not null then
        v_retry := registration_window_retry(
            p_environment_hash, p_environment_burst_limit, p_burst_seconds
        );
        if v_retry is not null then
            return query select false, 'environment_burst'::text, v_retry;
            return;
        end if;

        v_retry := registration_window_retry(
            p_environment_hash, p_environment_daily_limit, p_daily_seconds
        );
        if v_retry is not null then
            return query select false, 'environment_daily'::text, v_retry;
            return;
        end if;
    end if;

    return query select true, 'ok'::text, 0;
end;
$$;

/**
 * Records a completed registration against both digests.
 *
 * Called only after the voter row exists, so a device is never charged for a
 * registration that did not happen. Signature unchanged from 0014 so the call
 * site did not have to move; the storage underneath it did.
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
        insert into registration_events (device_hash, signal_kind)
        values (p_token_hash, 'token');
    end if;

    if p_environment_hash is not null then
        insert into registration_events (device_hash, signal_kind)
        values (p_environment_hash, 'environment');
    end if;
end;
$$;

/**
 * Deletes events that can no longer affect any decision.
 *
 * The longest window in use is 24 hours, so anything older than 48 is dead
 * weight. Bounded per call so it can be run from the request path without
 * turning into a long lock — the same shape as prune_rate_limit_counters().
 */
create or replace function prune_registration_events(
    p_older_than interval default interval '48 hours',
    p_max_rows integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted integer;
begin
    delete from registration_events
    where ctid in (
        select ctid from registration_events
        where occurred_at < now() - p_older_than
        limit p_max_rows
    );

    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

-- security definer functions must not be reachable with the public anon key:
-- record_* writes, and an attacker able to call it directly could fill a
-- victim's window and lock them out of registering.
revoke all on function registration_window_retry(text, integer, integer) from public;
revoke all on function check_registration_device(text, text, integer, integer, integer, integer, integer, integer) from public;
revoke all on function record_registration_device(text, text) from public;
revoke all on function prune_registration_events(interval, integer) from public;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on function registration_window_retry(text, integer, integer) from anon';
        execute 'revoke all on function check_registration_device(text, text, integer, integer, integer, integer, integer, integer) from anon';
        execute 'revoke all on function record_registration_device(text, text) from anon';
        execute 'revoke all on function prune_registration_events(interval, integer) from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute 'revoke all on function registration_window_retry(text, integer, integer) from authenticated';
        execute 'revoke all on function check_registration_device(text, text, integer, integer, integer, integer, integer, integer) from authenticated';
        execute 'revoke all on function record_registration_device(text, text) from authenticated';
        execute 'revoke all on function prune_registration_events(interval, integer) from authenticated';
    end if;
end
$$;
