-- Run once in the Supabase SQL editor (safe to run again).
-- Adds the owner's cover photo (the background behind the logo on the caterer card).
alter table caterer_profiles add column if not exists cover_image text;

notify pgrst, 'reload schema';
