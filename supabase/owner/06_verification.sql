-- OWNER: business verification.
-- Run once in the Supabase SQL editor (safe to run again).
-- Owners submit their registration and permit details (private, behind a password in the app).
-- The public only ever sees the verified badge (caterer_profiles.is_verified), which only an admin can switch on.

-- ============ 1) VERIFIED BADGE (shown to everyone) ============
alter table caterer_profiles add column if not exists is_verified boolean not null default false;

-- owners can never switch the badge on themselves; only an admin (or you, in the SQL editor) can
create or replace function public.guard_is_verified() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and coalesce(public.my_role(), '') <> 'Admin' then new.is_verified := false; end if;
  elsif new.is_verified and not old.is_verified and auth.uid() is not null and coalesce(public.my_role(), '') <> 'Admin' then
    new.is_verified := old.is_verified;
  end if;
  return new;
end $$;
drop trigger if exists guard_is_verified on caterer_profiles;
create trigger guard_is_verified before insert or update on caterer_profiles
  for each row execute function public.guard_is_verified();

-- ============ 2) VERIFICATION DETAILS (owner-only, never public) ============
create table if not exists caterer_verification (
  caterer_id       bigint primary key references caterer_profiles(caterer_id) on delete cascade,
  legal_name       text,
  registration_type text check (registration_type in ('DTI', 'SEC', 'CDA')),
  registration_no  text,
  permit_no        text,
  permit_expiry    date,
  document_path    text,
  updated_at       timestamptz not null default now()
);
alter table caterer_verification enable row level security;
drop policy if exists verif_owner on caterer_verification;
create policy verif_owner on caterer_verification for all
  using (caterer_id = my_caterer_id()) with check (caterer_id = my_caterer_id());
drop policy if exists verif_admin on caterer_verification;
create policy verif_admin on caterer_verification for select using (my_role() = 'Admin');
grant select, insert, update, delete on caterer_verification to authenticated;

-- changing the details sends the business back to "pending review"
create or replace function public.verif_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update caterer_profiles set is_verified = false where caterer_id = new.caterer_id and is_verified;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists verif_changed on caterer_verification;
create trigger verif_changed before insert or update on caterer_verification
  for each row execute function public.verif_changed();

-- private bucket for the permit / registration scan
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification', 'verification', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
drop policy if exists verif_files_read   on storage.objects;
drop policy if exists verif_files_insert on storage.objects;
drop policy if exists verif_files_delete on storage.objects;
create policy verif_files_read on storage.objects for select to authenticated
  using (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
create policy verif_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
create policy verif_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ 3) REVIEWS ============
create table if not exists reviews (
  review_id     bigint generated always as identity primary key,
  caterer_id    bigint not null references caterer_profiles(caterer_id) on delete cascade,
  user_id       uuid not null references users(user_id) on delete cascade,
  rating        int not null check (rating between 1 and 5),
  comment       text,
  event_type    text,
  photos        text[] not null default '{}',
  reviewer_mask text,
  created_at    timestamptz not null default now(),
  unique (caterer_id, user_id)
);
alter table reviews add column if not exists food_rating    int check (food_rating between 1 and 5);
alter table reviews add column if not exists service_rating int check (service_rating between 1 and 5);
alter table reviews add column if not exists value_rating   int check (value_rating between 1 and 5);
alter table reviews enable row level security;

-- show only a masked name, like j*****6
create or replace function public.review_mask() returns trigger language plpgsql security definer set search_path = public as $$
declare n text;
begin
  select lower(trim(name)) into n from users where user_id = new.user_id;
  new.reviewer_mask := case when coalesce(length(n), 0) >= 2 then left(n, 1) || '*****' || right(n, 1) else 'customer' end;
  return new;
end $$;
drop trigger if exists review_mask on reviews;
create trigger review_mask before insert on reviews for each row execute function public.review_mask();

drop policy if exists reviews_read on reviews;
create policy reviews_read on reviews for select
  using (caterer_id in (select caterer_id from caterer_profiles where status = 'Published') or user_id = auth.uid());
drop policy if exists reviews_insert on reviews;
-- only a customer who sent an inquiry to this caterer can review them
create policy reviews_insert on reviews for insert to authenticated with check (
  user_id = auth.uid() and my_role() = 'Customer'
  and exists (select 1 from inquiries i join customers c on c.customer_id = i.customer_id
              where c.user_id = auth.uid() and i.caterer_id = reviews.caterer_id));
drop policy if exists reviews_delete on reviews;
create policy reviews_delete on reviews for delete to authenticated using (user_id = auth.uid());
grant select on reviews to anon, authenticated;
grant insert, delete on reviews to authenticated;

notify pgrst, 'reload schema';

-- ============ HOW TO VERIFY A BUSINESS ============
-- 1. Owner fills in "Business verification" in their Business profile (it then shows as "Pending review").
-- 2. Check their details and document, then run (replace 1 with the caterer_id):
--      update caterer_profiles set is_verified = true where caterer_id = 1;
--    The verified badge appears next to the caterer's name on the public pages.
