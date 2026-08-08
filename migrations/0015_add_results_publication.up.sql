-- Publishing the result becomes a decision, not a consequence of the clock.
--
-- WHAT THIS CHANGES
--
-- Until now the public results page opened itself the instant the voting window
-- closed: `areResultsPublic()` was `status === 'ended'` and nothing more. That
-- makes the closing timestamp the publishing authority, which is not how a
-- declaration works. Between the last ballot and the declaration the Commission
-- has to reconcile the count against the register, look at the constituencies
-- with no ballots and the ones that tied, and decide the figures are right. On
-- the old behaviour that review happened, if at all, with the result already on
-- the internet.
--
-- This column is the Commission's signature. Voting ending stops ballots being
-- accepted; this releases the count. The two are separate facts and are stored
-- separately.
--
-- WHY A TIMESTAMP AND NOT A BOOLEAN
--
-- "Are the results public?" and "when were they declared?" are the same
-- question asked twice, and a boolean can only answer the first. Storing the
-- instant answers both from one column, which is one fewer pair of fields that
-- can contradict each other, and it puts the declaration time on the published
-- page where a reader can see it. NULL means not published — so an existing
-- deployment gains this column already closed, and a fresh one cannot come up
-- with a result on display by accident.
--
-- The application still refuses to publish until voting has ended (see
-- canPublishResults in src/lib/election-status.js), so a value here that
-- predates the close of the poll cannot be produced through the admin portal.
-- Publication is re-checked against the live election state on every read, so
-- reopening voting takes the result back off the public page without this
-- column being touched.

alter table election_settings
    add column if not exists results_published_at timestamptz;

comment on column election_settings.results_published_at is
    'When the Electoral Commission released the results to the public. NULL means the count is not published: the public results page refuses, and the landing page offers no link to it. Set and cleared only from Admin -> Results, and recorded in admin_audit_log either way.';
