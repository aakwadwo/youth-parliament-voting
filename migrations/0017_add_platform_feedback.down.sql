-- Drops the feedback table and everything defined on it (its index and check
-- constraints go with it).
--
-- Nothing else in the schema references platform_feedback — no foreign key
-- points at it and no function reads it — so this cannot cascade into voter,
-- ballot or election data. It does destroy any feedback collected, which is
-- the intended meaning of rolling this migration back.
drop table if exists platform_feedback;
