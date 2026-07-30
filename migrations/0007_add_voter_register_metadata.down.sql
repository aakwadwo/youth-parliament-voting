drop index if exists voters_registered_at_idx;
drop index if exists voters_is_verified_idx;

alter table voters drop constraint if exists voters_verification_method_check;

alter table voters drop column if exists verification_method;
alter table voters drop column if exists is_verified;
alter table voters drop column if exists registered_at;
