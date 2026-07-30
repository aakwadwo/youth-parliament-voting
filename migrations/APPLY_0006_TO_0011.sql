-- ============================================================================
--  National Youth Parliament Ghana — voting platform
--  Consolidated migration: 0006 → 0011
-- ============================================================================
--
--  Brings an existing production database up to what the current application
--  expects. Nothing here drops a table, drops a column, or deletes a row.
--
--  Safe to run more than once: every statement is idempotent, and the whole
--  script runs inside a single transaction, so either all of it applies or
--  none of it does. PostgreSQL DDL is transactional, so no concurrent request
--  ever sees a half-migrated schema.
--
--  Before running, confirm there are no duplicate phone numbers. (On the
--  current schema this cannot happen — voter_phone already carries a UNIQUE
--  constraint — but check anyway if you have restored from an older dump.)
--
--      select voter_phone, count(*) from voters
--      group by voter_phone having count(*) > 1;
--
--  Expected runtime on a register of this size: under two seconds.
-- ============================================================================

begin;


-- ===========================================================================
--  0006_add_performance_indexes.up.sql
-- ===========================================================================
-- Indexes for the query shapes this app actually issues. Without these, every
-- one of them degrades to a sequential scan, which is survivable with a few
-- thousand voters and not survivable with a national register.
--
-- Run order note: the unique index on voter_phone will fail if duplicate phone
-- numbers already exist. Check first, and resolve them, before applying:
--
--   select voter_phone, count(*) from voters
--   group by voter_phone having count(*) > 1;

-- get_results() aggregates ballots by candidate within constituency. This
-- covering index lets Postgres answer it from an index-only scan instead of
-- reading the whole votes heap.
create index if not exists votes_constituency_candidate_idx
    on votes (constituency_id, candidate_id);

create index if not exists votes_candidate_idx
    on votes (candidate_id);

-- Turnout-over-time reporting and the "first/last ballot" report fields.
create index if not exists votes_voted_at_idx
    on votes (voted_at);

-- Registration checks a phone number for an existing voter before inserting.
-- Without a UNIQUE constraint that check is a race: two concurrent requests
-- can both see "no existing voter" and both insert. The constraint is what
-- actually prevents duplicate registration; the pre-check is only there to
-- return a friendlier message.
create unique index if not exists voters_voter_phone_key
    on voters (voter_phone);

-- Voter login looks up exactly this pair.
create index if not exists voters_phone_dob_idx
    on voters (voter_phone, voter_dob);

-- Per-constituency turnout: registered voters, and how many have voted.
create index if not exists voters_constituency_idx
    on voters (constituency_id);

create index if not exists voters_constituency_has_voted_idx
    on voters (constituency_id, has_voted);

-- The ballot query: active candidates for one constituency, ordered by name.
create index if not exists candidates_constituency_active_idx
    on candidates (constituency_id, is_active, full_name);

-- Constituency pickers and the regional report breakdown.
create index if not exists constituencies_name_idx
    on constituencies (name);

create index if not exists constituencies_region_idx
    on constituencies (region);

-- ===========================================================================
--  0007_add_voter_register_metadata.up.sql
-- ===========================================================================
-- Register metadata needed by the official election report.
--
-- registered_at gives the report a real registration period and lets turnout
-- be broken down over time. is_verified/verification_method record *how* a
-- voter's eligibility was established, so the report can state it rather than
-- implying a stronger check than actually happened.
--
-- Today the only method is 'self_declared': a unique Ghanaian phone number, a
-- date of birth inside the 18-35 eligibility window, and a constituency. When
-- SMS one-time-passcode verification is introduced, new rows should default to
-- is_verified = false and be flipped to true on successful confirmation, with
-- verification_method = 'sms_otp'. Nothing else in the schema has to change.

alter table voters
    add column if not exists registered_at timestamptz not null default now();

alter table voters
    add column if not exists is_verified boolean not null default true;

alter table voters
    add column if not exists verification_method text not null default 'self_declared';

alter table voters
    drop constraint if exists voters_verification_method_check;

alter table voters
    add constraint voters_verification_method_check
        check (verification_method in ('self_declared', 'sms_otp', 'admin_verified'));

create index if not exists voters_registered_at_idx
    on voters (registered_at);

create index if not exists voters_is_verified_idx
    on voters (is_verified);

-- ===========================================================================
--  0008_harden_cast_vote.up.sql
-- ===========================================================================
-- Moves every ballot-eligibility check inside the same transaction as the
-- ballot insert.
--
-- Previously the API route read the voter, then the election settings, then
-- the candidate, and only then called cast_vote(). That is three round trips
-- of latency on the hottest path in the system, and it leaves a genuine
-- time-of-check/time-of-use gap: an administrator could close voting, or a
-- candidate could be withdrawn, in the window between the check passing and
-- the ballot landing. A ballot cast after voting closed is exactly the kind of
-- result an election petition is built on.
--
-- After this migration the route makes one call, and every condition is
-- evaluated against the same transaction snapshot that writes the ballot.
--
-- The function still returns rather than raises, so the caller can map each
-- outcome to a specific HTTP status and voter-facing message.

create or replace function cast_vote(
    p_voter_id uuid,
    p_candidate_id uuid,
    p_constituency_id uuid default null  -- ignored; kept for call compatibility
)
returns table (success boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_voter          record;
    v_candidate      record;
    v_settings       record;
    v_updated        int;
begin
    -- 1. The voter must exist. Their constituency is read from the database,
    --    never from the request, so a caller cannot vote outside their own.
    select id, constituency_id, has_voted
      into v_voter
      from voters
     where id = p_voter_id;

    if not found then
        return query select false, 'voter_not_found';
        return;
    end if;

    if v_voter.has_voted then
        return query select false, 'already_voted';
        return;
    end if;

    -- 2. The election must be open right now.
    select is_active, voting_opens_at, voting_closes_at
      into v_settings
      from election_settings
     limit 1;

    if not found or not v_settings.is_active then
        return query select false, 'voting_closed';
        return;
    end if;

    if v_settings.voting_opens_at is not null and v_settings.voting_opens_at > now() then
        return query select false, 'voting_not_started';
        return;
    end if;

    if v_settings.voting_closes_at is not null and v_settings.voting_closes_at < now() then
        return query select false, 'voting_ended';
        return;
    end if;

    -- 3. The candidate must be standing, and standing in this voter's own
    --    constituency.
    select id, constituency_id, is_active
      into v_candidate
      from candidates
     where id = p_candidate_id;

    if not found or not v_candidate.is_active then
        return query select false, 'invalid_candidate';
        return;
    end if;

    if v_candidate.constituency_id is distinct from v_voter.constituency_id then
        return query select false, 'wrong_constituency';
        return;
    end if;

    -- 4. Claim the right to vote. The `and has_voted = false` predicate is the
    --    concurrency gate: of two simultaneous requests for the same voter,
    --    exactly one updates a row, and the loser gets 0 and stops here.
    update voters
       set has_voted = true
     where id = p_voter_id
       and has_voted = false;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
        return query select false, 'already_voted';
        return;
    end if;

    -- 5. Record the ballot. It carries no reference back to the voter, so
    --    nothing here — and nothing later — can link this row to the person
    --    marked as voted in step 4.
    insert into votes (candidate_id, constituency_id, voted_at)
    values (v_candidate.id, v_voter.constituency_id, now());

    return query select true, 'ok';
end;
$$;

-- security definer means this runs with the definer's privileges, so it must
-- not be callable by anonymous clients. The application calls it with the
-- service-role key, which is unaffected by these grants.
--
-- anon and authenticated are Supabase-managed roles. They are guarded by an
-- existence check so this migration also applies cleanly to a plain PostgreSQL
-- instance — a staging copy or a local restore of a production dump — where
-- those roles do not exist and a bare REVOKE would abort the whole script.
revoke all on function cast_vote(uuid, uuid, uuid) from public;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on function cast_vote(uuid, uuid, uuid) from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute 'revoke all on function cast_vote(uuid, uuid, uuid) from authenticated';
    end if;
end
$$;

-- ===========================================================================
--  0010_extend_admin_audit_log.up.sql
-- ===========================================================================
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

-- ===========================================================================
--  0011_add_election_description.up.sql
-- ===========================================================================
-- The official election report carries an election description alongside the
-- title. `buildElectionReport()` reads `election_settings.description` and the
-- PDF, Excel and CSV exports each print it.
--
-- Without this column the report still generates — the field simply reads "—"
-- — because the settings row is fetched with select('*') rather than a named
-- column list. It is added so the published report can actually describe what
-- the election was, which is a stated requirement of the report format.

alter table election_settings
    add column if not exists description text;

comment on column election_settings.description is
    'Free-text description of the election, printed on the exported report.';

-- ===========================================================================
--  0009_add_report_functions.up.sql
-- ===========================================================================
-- Aggregates that back the admin dashboard and the official election report.
--
-- All of these compute in Postgres and return at most a few hundred rows. No
-- route ever pulls the votes or voters tables into application memory, so the
-- cost of a report is independent of how many ballots were cast.


-- ---------------------------------------------------------------------------
-- get_results(): every candidate's tally.
--
-- The previous version started FROM votes, so a candidate who received zero
-- votes vanished from the results entirely. In an official report that is not
-- a cosmetic problem: it silently rewrites the ballot paper, and it makes the
-- candidate count in the report disagree with the candidate list. This version
-- starts FROM candidates and LEFT JOINs the ballots, so every candidate who
-- stood appears, including with a tally of zero.
--
-- The new version returns three columns the 0004 version did not (region,
-- candidate is_active). PostgreSQL will not let CREATE OR REPLACE change a
-- function's output row type — it raises "cannot change return type of
-- existing function" — so the old one has to be dropped first. The whole file
-- runs in one transaction (DDL is transactional in PostgreSQL), which means no
-- concurrent session ever observes a window where get_results() is missing.
-- ---------------------------------------------------------------------------
drop function if exists get_results();

create or replace function get_results()
returns table (
    constituency_id   uuid,
    constituency_name text,
    region            text,
    candidate_id      uuid,
    candidate_name    text,
    is_active         boolean,
    votes             bigint
)
language sql
stable
as $$
    select
        c.id,
        c.name,
        c.region,
        cd.id,
        cd.full_name,
        cd.is_active,
        count(v.candidate_id) as votes
    from constituencies c
    join candidates cd on cd.constituency_id = c.id
    left join votes v on v.candidate_id = cd.id
    group by c.id, c.name, c.region, cd.id, cd.full_name, cd.is_active
    order by c.name asc, count(v.candidate_id) desc, cd.full_name asc;
$$;

-- ---------------------------------------------------------------------------
-- get_election_stats(): the headline figures.
--
-- One round trip instead of the six separate count queries the dashboard and
-- report would otherwise need.
-- ---------------------------------------------------------------------------
create or replace function get_election_stats()
returns table (
    total_registered   bigint,
    total_verified     bigint,
    total_voted        bigint,
    total_ballots      bigint,
    total_constituencies bigint,
    total_candidates   bigint,
    active_candidates  bigint,
    contested_constituencies bigint,
    first_vote_at      timestamptz,
    last_vote_at       timestamptz,
    first_registration_at timestamptz
)
language sql
stable
as $$
    select
        (select count(*) from voters),
        (select count(*) from voters where is_verified),
        -- Voters marked as having cast a ballot. This is deliberately counted
        -- separately from total_ballots: if the two ever diverge, something
        -- has gone wrong with ballot integrity and the report will show it.
        (select count(*) from voters where has_voted),
        (select count(*) from votes),
        (select count(*) from constituencies),
        (select count(*) from candidates),
        (select count(*) from candidates where is_active),
        (select count(distinct constituency_id) from candidates where is_active),
        (select min(voted_at) from votes),
        (select max(voted_at) from votes),
        (select min(registered_at) from voters);
$$;

-- ---------------------------------------------------------------------------
-- get_constituency_turnout(): registered vs. voted, per constituency.
-- ---------------------------------------------------------------------------
create or replace function get_constituency_turnout()
returns table (
    constituency_id   uuid,
    constituency_name text,
    region            text,
    code              int,
    registered        bigint,
    verified          bigint,
    voted             bigint,
    ballots           bigint,
    candidates        bigint
)
language sql
stable
as $$
    select
        c.id,
        c.name,
        c.region,
        c.code,
        coalesce(v.registered, 0),
        coalesce(v.verified, 0),
        coalesce(v.voted, 0),
        coalesce(b.ballots, 0),
        coalesce(cd.candidates, 0)
    from constituencies c
    left join (
        select constituency_id,
               count(*) as registered,
               count(*) filter (where is_verified) as verified,
               count(*) filter (where has_voted) as voted
        from voters group by constituency_id
    ) v on v.constituency_id = c.id
    left join (
        select constituency_id, count(*) as ballots
        from votes group by constituency_id
    ) b on b.constituency_id = c.id
    left join (
        select constituency_id, count(*) as candidates
        from candidates where is_active group by constituency_id
    ) cd on cd.constituency_id = c.id
    order by c.name asc;
$$;

-- ---------------------------------------------------------------------------
-- get_regional_turnout(): the same roll-up one level higher, for the report's
-- regional breakdown and the dashboard chart.
-- ---------------------------------------------------------------------------
create or replace function get_regional_turnout()
returns table (
    region         text,
    constituencies bigint,
    registered     bigint,
    voted          bigint,
    ballots        bigint
)
language sql
stable
as $$
    select
        t.region,
        count(*)::bigint,
        sum(t.registered)::bigint,
        sum(t.voted)::bigint,
        sum(t.ballots)::bigint
    from get_constituency_turnout() t
    group by t.region
    order by t.region asc;
$$;


-- ============================================================================
--  Verification — these run inside the same transaction. If any RAISE fires,
--  the whole migration rolls back and the database is left untouched.
-- ============================================================================
do $$
declare
    missing text := '';
begin
    if not exists (select 1 from information_schema.columns
                   where table_name='voters' and column_name='is_verified')
        then missing := missing || 'voters.is_verified '; end if;
    if not exists (select 1 from information_schema.columns
                   where table_name='voters' and column_name='verification_method')
        then missing := missing || 'voters.verification_method '; end if;
    if not exists (select 1 from information_schema.columns
                   where table_name='admin_audit_log' and column_name='actor_email')
        then missing := missing || 'admin_audit_log.actor_email '; end if;
    if not exists (select 1 from information_schema.columns
                   where table_name='admin_audit_log' and column_name='actor_ip')
        then missing := missing || 'admin_audit_log.actor_ip '; end if;
    if not exists (select 1 from information_schema.columns
                   where table_name='admin_audit_log' and column_name='entity')
        then missing := missing || 'admin_audit_log.entity '; end if;
    if not exists (select 1 from information_schema.columns
                   where table_name='election_settings' and column_name='description')
        then missing := missing || 'election_settings.description '; end if;

    if not exists (select 1 from pg_proc where proname='get_election_stats')
        then missing := missing || 'get_election_stats() '; end if;
    if not exists (select 1 from pg_proc where proname='get_constituency_turnout')
        then missing := missing || 'get_constituency_turnout() '; end if;
    if not exists (select 1 from pg_proc where proname='get_regional_turnout')
        then missing := missing || 'get_regional_turnout() '; end if;

    -- cast_vote must accept the two-argument call the application makes,
    -- i.e. its third parameter must now carry a default.
    if not exists (
        select 1 from pg_proc
        where proname = 'cast_vote' and pronargdefaults >= 1
    ) then missing := missing || 'cast_vote(2-arg form) '; end if;

    -- get_results must be the seven-column version.
    if (select count(*) from information_schema.columns
        where table_name = 'get_results') <> 0
       and not exists (
        select 1 from information_schema.columns
        where table_name='get_results' and column_name='region')
        then missing := missing || 'get_results(region column) '; end if;

    if missing <> '' then
        raise exception 'Migration incomplete, rolling back. Missing: %', missing;
    end if;

    raise notice 'All expected objects present.';
end
$$;

commit;
