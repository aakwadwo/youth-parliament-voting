-- Restores the 0003 version, which trusts the caller to have validated the
-- election window, the candidate, and the voter's constituency beforehand.
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
