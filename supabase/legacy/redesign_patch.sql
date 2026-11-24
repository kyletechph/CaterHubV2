-- New design columns and tables. Run once in the Supabase SQL editor (safe to run again).
-- K) New design: tagline, package price range, dietary/allergy requests, private calendar notes
alter table caterer_profiles add column if not exists tagline text;
alter table catering_packages add column if not exists price_range text;
alter table inquiries add column if not exists dietary text[] not null default '{}';
alter table inquiries add column if not exists allergies text[] not null default '{}';

-- private notes on calendar dates (only the owner can see them; never public)
create table if not exists caterer_day_notes (
  caterer_id bigint not null references caterer_profiles(caterer_id) on delete cascade,
  day        date not null,
  note       text not null,
  updated_at timestamptz not null default now(),
  primary key (caterer_id, day)
);
alter table caterer_day_notes enable row level security;
drop policy if exists day_notes_owner on caterer_day_notes;
create policy day_notes_owner on caterer_day_notes for all
  using (caterer_id = my_caterer_id()) with check (caterer_id = my_caterer_id());
grant select, insert, update, delete on caterer_day_notes to authenticated;

-- refresh Supabase's schema cache so the new columns are found right away
notify pgrst, 'reload schema';
