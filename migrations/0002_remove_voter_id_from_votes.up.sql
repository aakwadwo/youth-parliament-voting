-- Removes the direct link between a ballot and the voter who cast it. After
-- this migration, votes contains only candidate_id, constituency_id and
-- voted_at — there is no column anywhere that can be joined back to voters.
-- Double-voting is now prevented entirely by the atomic has_voted flag on
-- voters (see the cast_vote() function in 0003), not by anything on votes.

alter table votes
    add column if not exists voted_at timestamptz not null default now();

-- Dropping voter_id automatically drops any constraint/index defined on it
-- (e.g. a unique constraint used previously to prevent double voting).
alter table votes
    drop column if exists voter_id;
