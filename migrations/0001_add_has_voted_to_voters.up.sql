-- Adds a has_voted flag to voters. This becomes the sole gate for "has this
-- voter already cast a ballot", replacing a lookup against votes.voter_id
-- (which is being removed in migration 0002 so that ballots can no longer be
-- traced back to a voter's identity).

alter table voters
    add column if not exists has_voted boolean not null default false;

-- Backfill from existing data before voter_id is dropped from votes, so no
-- history of "who has already voted" is lost during the migration.
update voters
set has_voted = true
where id in (select distinct voter_id from votes where voter_id is not null);
