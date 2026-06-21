-- Aggregates vote counts per candidate per constituency in the database
-- instead of pulling every row in `votes` into a serverless function and
-- reducing it in JavaScript. Scales independently of how many ballots have
-- been cast — the function always returns at most (#constituencies x
-- #candidates) rows.
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
