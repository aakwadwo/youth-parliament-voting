-- Register metadata needed by the official election report.
--
-- registered_at gives the report a real registration period and lets turnout
-- be broken down over time. is_verified/verification_method record *how* a
-- voter's eligibility was established, so the report can state it rather than
-- implying a stronger check than actually happened.
--
-- Today the only method is 'self_declared': a unique Ghanaian phone number, a
-- date of birth inside the 18-35 eligibility window, and a constituency. When
-- SMS one-time-passcode verification is introduced, new rows should default to
-- is_verified = false and be flipped to true on successful confirmation, with
-- verification_method = 'sms_otp'. Nothing else in the schema has to change.

alter table voters
    add column if not exists registered_at timestamptz not null default now();

alter table voters
    add column if not exists is_verified boolean not null default true;

alter table voters
    add column if not exists verification_method text not null default 'self_declared';

alter table voters
    drop constraint if exists voters_verification_method_check;

alter table voters
    add constraint voters_verification_method_check
        check (verification_method in ('self_declared', 'sms_otp', 'admin_verified'));

create index if not exists voters_registered_at_idx
    on voters (registered_at);

create index if not exists voters_is_verified_idx
    on voters (is_verified);
