-- This deployment runs one specific election: the National Youth Parliament
-- Election 2026.
--
-- `election_settings.election_name` is the source of truth for the name voters
-- see on the status panel and for the title printed on the exported PDF, Excel
-- and CSV report. The application constant in src/lib/election.js is only the
-- fallback used before the row is configured, so changing the code alone does
-- not rename a live election — this row has to be updated too.
--
-- Written as an update of the single settings row rather than a column default:
-- the row already exists in every environment, and a default would only apply
-- to a row that is never inserted again.

update election_settings
set election_name = 'National Youth Parliament Election 2026'
where election_name is null
   or election_name <> 'National Youth Parliament Election 2026';

-- Should the settings row not exist yet (a fresh project), create it closed.
-- Voting must never come up open by accident.
insert into election_settings (election_name, is_active)
select 'National Youth Parliament Election 2026', false
where not exists (select 1 from election_settings);
