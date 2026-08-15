-- Feedback on the platform, stored so the Commission and the supplier can
-- actually read it.
--
-- WHAT THIS TABLE DELIBERATELY DOES NOT HOLD
--
-- No voter id, no phone number, no name, no IP address, no user agent, no
-- session token, and no candidate or constituency reference. There is no
-- column here that can be joined to `voters`, and nothing that can be joined
-- to `votes` — which carries no voter reference by schema in any case. A
-- feedback row is an anonymous opinion about software and must never become a
-- second, softer route to the linkage that migration 0002 removed.
--
-- That is also why the free-text columns are capped rather than unbounded: the
-- cap makes the table cheap to hold, and a 4,000-character limit is far more
-- than anyone writes about a form while being too little to paste a register
-- into.
--
-- Spam control is a rate limit on the route (rate_limit_counters, migration
-- 0013) keyed by IP, plus the length and range checks below which are enforced
-- here as well as in the route — the route can be changed by a careless edit,
-- the constraint cannot be bypassed by one.
--
-- NOTHING ELSE IN THE SCHEMA IS TOUCHED. This migration creates one table and
-- one index. It does not reference voters, votes, candidates, constituencies
-- or election_settings, and it changes no existing object.

create table if not exists platform_feedback (
    id uuid primary key default gen_random_uuid(),

    -- 1 (very difficult) .. 5 (very easy). Nullable: every question on the
    -- form is optional, and a submission that only says what broke is the most
    -- useful kind.
    rating smallint,

    -- Which parts of the platform the person used. A plain text array rather
    -- than a lookup table: this is a fixed, short list of labels on one form,
    -- and a join table for it would be ceremony with no reader.
    parts text[] not null default '{}',

    device text,

    worked_well text,
    problems text,
    suggestions text,

    submitted_at timestamptz not null default now(),

    constraint platform_feedback_rating_range
        check (rating is null or rating between 1 and 5),

    constraint platform_feedback_device_len
        check (device is null or char_length(device) <= 40),

    constraint platform_feedback_parts_len
        check (cardinality(parts) <= 12),

    constraint platform_feedback_worked_len
        check (worked_well is null or char_length(worked_well) <= 4000),

    constraint platform_feedback_problems_len
        check (problems is null or char_length(problems) <= 4000),

    constraint platform_feedback_suggestions_len
        check (suggestions is null or char_length(suggestions) <= 4000),

    -- A row where every field is empty is a scripted POST, not feedback.
    constraint platform_feedback_not_empty check (
        rating is not null
        or cardinality(parts) > 0
        or device is not null
        or worked_well is not null
        or problems is not null
        or suggestions is not null
    )
);

comment on table platform_feedback is
    'Anonymous feedback about the voting platform. Contains no voter, ballot or contact data and cannot be joined to any other table.';

-- Reviewing feedback means reading it newest first. That is the only access
-- pattern this table has.
create index if not exists platform_feedback_submitted_at_idx
    on platform_feedback (submitted_at desc);

-- Same posture as every other table in this schema: RLS on with no policies,
-- so PostgREST's anon and authenticated roles can reach nothing here. The
-- application writes with the service-role key, which bypasses RLS. Without
-- this, the public anon key — which is embedded in the client bundle — would
-- be able to read every submission and write arbitrary ones.
alter table platform_feedback enable row level security;
