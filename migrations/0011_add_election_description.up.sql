-- The official election report carries an election description alongside the
-- title. `buildElectionReport()` reads `election_settings.description` and the
-- PDF, Excel and CSV exports each print it.
--
-- Without this column the report still generates — the field simply reads "—"
-- — because the settings row is fetched with select('*') rather than a named
-- column list. It is added so the published report can actually describe what
-- the election was, which is a stated requirement of the report format.

alter table election_settings
    add column if not exists description text;

comment on column election_settings.description is
    'Free-text description of the election, printed on the exported report.';
