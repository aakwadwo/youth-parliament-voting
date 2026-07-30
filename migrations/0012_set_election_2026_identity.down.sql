-- Restores the previous generic name. The original value is not recoverable
-- from the database once overwritten, so this reinstates the name the platform
-- shipped with rather than whatever a particular deployment had set.

update election_settings
set election_name = 'Youth Parliament Ghana Election'
where election_name = 'National Youth Parliament Election 2026';
