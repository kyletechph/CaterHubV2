-- CUSTOMER: reviews (stars, comment, photos).
-- Run once in the Supabase SQL editor (safe to run again).
-- Only a logged-in customer who sent an inquiry to the caterer can post a review (one per caterer).
-- Everyone, including visitors who are not logged in, can read the reviews of Published caterers.

-- ============ REVIEWS ============
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
