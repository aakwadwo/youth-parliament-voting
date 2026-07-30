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
