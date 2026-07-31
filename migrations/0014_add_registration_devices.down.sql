-- Removing this drops the one-device-one-registration restriction. Voter
-- registration keeps working; it simply loses that anti-abuse layer, falling
-- back to the unique index on voters.voter_phone and the per-phone rate limit.
--
-- Unlike 0013, reverting this does not take the service offline: the
-- application treats a missing check_registration_device() as "no device
-- restriction configured" rather than failing closed, precisely so that
-- dropping it cannot stop legitimate voters registering.

drop function if exists record_registration_device(text, text);
drop function if exists check_registration_device(text, text, integer, integer);
drop table if exists registration_devices;
