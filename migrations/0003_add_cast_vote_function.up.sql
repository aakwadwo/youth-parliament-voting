-- Casts a ballot atomically: the has_voted check, the flip to true, and the
-- anonymous ballot insert all happen inside one Postgres function call, which
-- runs as a single transaction. If the insert fails for any reason, the
-- has_voted flip is rolled back automatically by Postgres — there is no
-- window where a voter is marked as voted without a corresponding ballot,
-- and no window where two concurrent requests can both succeed.
--
-- security definer so this can eventually be exposed to a restricted role;
-- the app currently calls it with the service-role key, which would bypass
-- RLS regardless, but this keeps the function safe to expose more narrowly
-- later without revisiting its body.
create or replace function cast_vote(
    p_voter_id uuid,
    p_candidate_id uuid,
    p_constituency_id uuid
)
returns table (success boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_updated int;
begin
    update voters
    set has_voted = true
    where id = p_voter_id
      and has_voted = false;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
        return query select false, 'already_voted';
        return;
    end if;

    insert into votes (candidate_id, constituency_id, voted_at)
    values (p_candidate_id, p_constituency_id, now());

    return query select true, 'ok';
end;
$$;
