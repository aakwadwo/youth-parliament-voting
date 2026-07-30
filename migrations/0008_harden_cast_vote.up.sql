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
