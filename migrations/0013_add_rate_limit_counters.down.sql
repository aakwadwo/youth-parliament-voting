-- Reverting this does NOT leave the application unprotected: src/lib/rate-limit.js
-- fails closed when check_rate_limit() is absent, so in production every
-- rate-limited route — voter registration, voter login, vote submission, admin
-- sign-in, report export — will return 503 until the table and functions are
-- restored. In other words this takes the election offline rather than running
-- it unmetered. Do not run it against a live election.

drop function if exists prune_rate_limit_counters(interval, integer);
drop function if exists check_rate_limit(text, text, integer, integer);
drop table if exists rate_limit_counters;
