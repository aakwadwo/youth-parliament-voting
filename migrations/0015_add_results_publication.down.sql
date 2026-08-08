-- Reverting this drops the record of whether the Commission released the
-- results, so the application falls back to treating them as unpublished — the
-- public results page will refuse for every election, ended or not, until the
-- column is restored. That is the safe direction: rolling back cannot publish a
-- count that was being withheld.
--
-- Run only alongside a deployment of application code that predates the
-- controlled release, which reads publication from the election state alone.

alter table election_settings drop column if exists results_published_at;
