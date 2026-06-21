-- NOTE: this restores the column shape only. The original voter_id values
-- cannot be recovered — once anonymized, that mapping is gone by design.
alter table votes
    add column if not exists voter_id uuid references voters (id);

alter table votes
    drop column if exists voted_at;
