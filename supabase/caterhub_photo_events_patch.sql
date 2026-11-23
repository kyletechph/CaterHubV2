-- Run once in the Supabase SQL editor (safe to run again).
-- Lets each package photo belong to an event (Birthday, Wedding...) so the public gallery can be filtered by event.
alter table package_photos add column if not exists event_type text;
notify pgrst, 'reload schema';
