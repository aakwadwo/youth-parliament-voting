begin;

drop function if exists get_regional_turnout();
drop function if exists get_constituency_turnout();
drop function if exists get_election_stats();

-- Restores the 0004 version of get_results(), which omits candidates that
-- received no votes. Dropped rather than replaced for the same reason as in the
-- up migration: PostgreSQL refuses to change a function's output row type.
drop function if exists get_results();

create or replace function get_results()
returns table (
    constituency_id uuid,
    constituency_name text,
    candidate_id uuid,
    candidate_name text,
    votes bigint
)
language sql
stable
as $$
    select
        c.id as constituency_id,
        c.name as constituency_name,
        cd.id as candidate_id,
        cd.full_name as candidate_name,
        count(*) as votes
    from votes v
    join candidates cd on cd.id = v.candidate_id
    join constituencies c on c.id = v.constituency_id
    group by c.id, c.name, cd.id, cd.full_name
    order by c.name asc, votes desc;
$$;

commit;
