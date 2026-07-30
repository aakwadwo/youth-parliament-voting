-- Rate limiting, moved from Upstash Redis into Postgres.
--
-- WHY THIS MOVED
--
-- The Redis dependency was the only piece of infrastructure in this system that
-- was not Supabase, and it bought nothing that Postgres cannot do at this
-- scale. It also failed in the worst possible direction: when Redis was
-- unreachable the limiter allowed the request, so anyone able to disrupt
-- Upstash could switch off every brute-force protection in the app —
-- including the eight-guesses-a-day cap that is the only thing standing
-- between a known phone number and a low-entropy date of birth. Postgres is
-- already a hard dependency of every one of these routes: if it is down there
-- is no voter table to authenticate against, so there is nothing left to
-- brute-force. Consolidating removes a failure mode rather than adding one.
--
-- THE ALGORITHM
--
-- Deliberately identical to @upstash/ratelimit's `slidingWindow`, so the
-- limits in src/lib/rate-limit.js keep the exact meaning they were tuned for.
-- That is an approximated sliding window:
--
--   * time is divided into fixed windows aligned to the epoch
--   * each (bucket, identifier, window) keeps one integer counter
--   * a request is judged against the current window's count plus the previous
--     window's count weighted by how much of it still overlaps the trailing
--     `window` interval
--
-- One row per identifier per window, not one row per request, so a national
-- election writes thousands of rows rather than millions.

create table if not exists rate_limit_counters (
    bucket text not null,
    identifier text not null,
    window_start timestamptz not null,
    request_count integer not null default 0,

    -- Composite primary key doubles as the only lookup index the hot path
    -- needs: every read is an equality match on all three columns, so this
    -- resolves to a single unique index probe.
    primary key (bucket, identifier, window_start)
);

comment on table rate_limit_counters is
    'Sliding-window rate limit counters. One row per (bucket, identifier, window). Written on every rate-limited request; safe to truncate, which resets all limits.';

-- Pruning scans by age alone and would otherwise sequential-scan the whole
-- table. Kept separate from the primary key because its leading column differs.
create index if not exists rate_limit_counters_window_start_idx
    on rate_limit_counters (window_start);

-- No policies, so PostgREST refuses this table to the anon and authenticated
-- roles entirely. The app reaches it only through the service-role key, which
-- bypasses RLS. Without this, the public anon key could read the table and
-- learn which phone numbers are being tried, or write to it and grant itself
-- unlimited attempts.
alter table rate_limit_counters enable row level security;

/**
 * Consume one unit of the limit for (p_bucket, p_identifier).
 *
 * Returns whether the request may proceed, and if not, how many seconds until
 * the current window rolls over.
 *
 * Concurrency: the counter row is created if absent, then locked FOR UPDATE
 * before it is read, so the check and the increment are one atomic step even
 * with hundreds of concurrent requests against the same key. This matters most
 * for exactly the case an attacker creates — many simultaneous guesses at one
 * phone number — where a non-atomic read-then-write would let the whole burst
 * through on a stale count.
 *
 * A refused request is NOT counted, matching Upstash. Counting refusals would
 * mean an attacker hammering a shared carrier-NAT address could hold the
 * counter above the limit indefinitely and lock out every legitimate voter
 * behind it.
 */
create or replace function check_rate_limit(
    p_bucket text,
    p_identifier text,
    p_limit integer,
    p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := now();
    v_epoch double precision;
    v_window_index bigint;
    v_window_start timestamptz;
    v_previous_start timestamptz;
    v_current integer;
    v_previous integer;
    v_elapsed_fraction double precision;
    v_weighted_previous integer;
    v_retry integer;
begin
    if p_limit <= 0 or p_window_seconds <= 0 then
        raise exception 'check_rate_limit: limit and window must be positive (got % / %)',
            p_limit, p_window_seconds;
    end if;

    v_epoch := extract(epoch from v_now);
    v_window_index := floor(v_epoch / p_window_seconds);
    v_window_start := to_timestamp(v_window_index * p_window_seconds);
    v_previous_start := to_timestamp((v_window_index - 1) * p_window_seconds);

    -- Ensure the current row exists so there is something to lock. Racing
    -- callers either insert it here or block until the winner commits.
    insert into rate_limit_counters (bucket, identifier, window_start, request_count)
    values (p_bucket, p_identifier, v_window_start, 0)
    on conflict (bucket, identifier, window_start) do nothing;

    select request_count into v_current
    from rate_limit_counters
    where bucket = p_bucket
      and identifier = p_identifier
      and window_start = v_window_start
    for update;

    select coalesce(request_count, 0) into v_previous
    from rate_limit_counters
    where bucket = p_bucket
      and identifier = p_identifier
      and window_start = v_previous_start;

    v_previous := coalesce(v_previous, 0);

    -- How far into the current window we are, 0.0 -> 1.0. The previous window
    -- contributes the complement: at the instant a window opens it counts in
    -- full, and it has decayed to nothing by the time the next one opens.
    v_elapsed_fraction := (v_epoch - (v_window_index * p_window_seconds))::double precision
                          / p_window_seconds;
    v_weighted_previous := floor((1 - v_elapsed_fraction) * v_previous);

    if (v_weighted_previous + v_current) >= p_limit then
        v_retry := greatest(
            1,
            ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer
        );
        return query select false, v_retry;
        return;
    end if;

    update rate_limit_counters
    set request_count = request_count + 1
    where bucket = p_bucket
      and identifier = p_identifier
      and window_start = v_window_start;

    return query select true, 0;
end;
$$;

/**
 * Deletes counters that can no longer affect any decision.
 *
 * The longest window in use is 24 hours and a decision reads at most one window
 * back, so anything older than 48 hours is dead weight. Bounded per call so it
 * can be run from the request path without turning into a long lock.
 */
create or replace function prune_rate_limit_counters(
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
    delete from rate_limit_counters
    where ctid in (
        select ctid from rate_limit_counters
        where window_start < now() - p_older_than
        limit p_max_rows
    );

    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

-- These run with the definer's privileges, so they must not be callable by the
-- public anon key: check_rate_limit writes, and an attacker who could call it
-- directly could burn a victim's allowance to lock them out.
revoke all on function check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function prune_rate_limit_counters(interval, integer) from public, anon, authenticated;
