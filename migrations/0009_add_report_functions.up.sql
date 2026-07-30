-- Aggregates that back the admin dashboard and the official election report.
--
-- All of these compute in Postgres and return at most a few hundred rows. No
-- route ever pulls the votes or voters tables into application memory, so the
-- cost of a report is independent of how many ballots were cast.

begin;

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

commit;
