-- ============================================================
-- CaterHub: SAFE UPDATE for an existing database
-- Can be run any number of times. Never deletes data. No "already exists" errors.
-- Supabase -> SQL Editor -> select all, delete, paste this file -> Run
-- ============================================================

-- A) Owners can see the customer of their own inquiries (no recursion)
create or replace function my_inquiry_customer_ids() returns setof bigint
  language sql stable security definer set search_path = public as
$$ select customer_id from inquiries where caterer_id = my_caterer_id() $$;
grant execute on function my_inquiry_customer_ids() to authenticated;

drop policy if exists customers_owner_read on customers;
create policy customers_owner_read on customers for select
  using (customer_id in (select my_inquiry_customer_ids()));

-- B) Photo storage (logo + package photos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true;

drop policy if exists photos_public_read   on storage.objects;
drop policy if exists photos_owner_insert  on storage.objects;
drop policy if exists photos_owner_update  on storage.objects;
drop policy if exists photos_owner_delete  on storage.objects;
create policy photos_public_read on storage.objects for select
  using (bucket_id = 'photos');
create policy photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- C) Notifications
create or replace function public.set_inquiry_status(p_id bigint, p_status inquiry_status, p_message text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inq inquiries%rowtype;
  is_owner boolean;
  is_customer boolean;
  notify_user uuid;
  biz text;
  who text;
begin
  select * into inq from inquiries where inquiry_id = p_id;
  if not found then
    raise exception 'Inquiry not found.';
  end if;

  is_owner := inq.caterer_id = my_caterer_id();
  is_customer := inq.customer_id in (select customer_id from customers where user_id = auth.uid());

  if not (is_owner or is_customer) then
    raise exception 'Not allowed.';
  end if;

  if not is_owner and not (inq.status = 'Pending' and p_status = 'Cancelled') then
    raise exception 'Customers can only cancel a Pending inquiry.';
  end if;

  if p_status in ('Unavailable', 'Cancelled') and coalesce(trim(p_message), '') = '' then
    raise exception 'A reply is required for Unavailable or Cancelled.';
  end if;

  update inquiries set status = p_status where inquiry_id = p_id;

  insert into inquiry_status_history (inquiry_id, previous_status, status, message, changed_by)
  values (p_id, inq.status, p_status, nullif(trim(p_message), ''), auth.uid());

  select business_name into biz from caterer_profiles where caterer_id = inq.caterer_id;

  if is_owner then
    select user_id into notify_user from customers where customer_id = inq.customer_id;
    who := coalesce(biz, 'The caterer');
  else
    select user_id into notify_user from caterer_profiles where caterer_id = inq.caterer_id;
    select name into who from customers where customer_id = inq.customer_id;
    who := coalesce(who, 'The customer');
  end if;

  if notify_user is not null and notify_user is distinct from auth.uid() then
    insert into notifications (user_id, message, type)
    values (notify_user,
            who || ' updated ' || inq.ref || ' to "' || p_status || '"' || coalesce(': ' || nullif(trim(p_message), ''), '.'),
            'inquiry');
  end if;
end $$;

grant execute on function public.set_inquiry_status(bigint, inquiry_status, text) to authenticated;

-- 2) New inquiry: notify the caterer owner AND confirm to the customer
create or replace function public.notify_new_inquiry() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid;
  biz text;
  cust_user uuid;
  cust_name text;
begin
  select user_id, business_name into owner_id, biz from caterer_profiles where caterer_id = new.caterer_id;
  select user_id, name into cust_user, cust_name from customers where customer_id = new.customer_id;

  if owner_id is not null then
    insert into notifications (user_id, message, type)
    values (owner_id,
            'New inquiry ' || new.ref || ' from ' || coalesce(cust_name, 'a customer') ||
            ' for ' || to_char(new.event_date, 'Mon DD, YYYY') || ' (' || new.guests || ' guests).',
            'inquiry');
  end if;

  if cust_user is not null then
    insert into notifications (user_id, message, type)
    values (cust_user,
            'Your inquiry ' || new.ref || ' was sent to ' || coalesce(biz, 'the caterer') ||
            '. You will be notified when they reply.',
            'inquiry');
  end if;
  return new;
end $$;

drop trigger if exists notify_inquiry_created on inquiries;
create trigger notify_inquiry_created after insert on inquiries
  for each row execute function public.notify_new_inquiry();

-- D) Caterer address + map link (fixes: "Could not find the 'map_link' column")
alter table caterer_profiles add column if not exists address text;
alter table caterer_profiles add column if not exists map_link text;

-- E) Notifications: let users clear (delete) their OWN notifications
drop policy if exists notif_del on notifications;
create policy notif_del on notifications for delete using (user_id = auth.uid());
grant delete on notifications to authenticated;

-- G) Profile status: add "Deactivated" (hidden from customers, like Draft)
alter table caterer_profiles drop constraint if exists caterer_profiles_status_check;
alter table caterer_profiles add constraint caterer_profiles_status_check
  check (status in ('Draft','Published','Deactivated'));

-- H) Calendar of inquiries (owner + customer): owners can read the customer of their
--    inquiries (see A); speed indexes for looking up inquiries by date
create index if not exists inquiries_caterer_date_idx on inquiries (caterer_id, event_date);
create index if not exists inquiries_customer_date_idx on inquiries (customer_id, event_date);

-- I) Customers (and guests) can SEE a Published caterer's Reserved / Unavailable dates,
--    and inquiries for those dates are refused
drop policy if exists avail_public_read on caterer_availability;
create policy avail_public_read on caterer_availability for select
  using (caterer_id in (select caterer_id from caterer_profiles where status = 'Published'));
grant select on caterer_availability to anon, authenticated;

create or replace function public.block_unavailable_dates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from caterer_availability
             where caterer_id = new.caterer_id and day = new.event_date
               and status in ('Reserved', 'Unavailable')) then
    raise exception 'That date is not available. Please choose another date.';
  end if;
  return new;
end $$;

drop trigger if exists block_unavailable_dates on inquiries;
create trigger block_unavailable_dates before insert on inquiries
  for each row execute function public.block_unavailable_dates();

-- J) Customer replies to the caterer (from Notifications)
create table if not exists inquiry_messages (
  message_id  bigint generated always as identity primary key,
  inquiry_id  bigint not null references inquiries(inquiry_id) on delete cascade,
  sender_id   uuid not null,
  sender_role text not null check (sender_role in ('Customer', 'Caterer')),
  message     text not null check (length(trim(message)) > 0),
  created_at  timestamptz not null default now()
);
create index if not exists inquiry_messages_inquiry_idx on inquiry_messages (inquiry_id, created_at);
alter table inquiry_messages enable row level security;

drop policy if exists msg_read on inquiry_messages;
create policy msg_read on inquiry_messages for select using (
  inquiry_id in (
    select inquiry_id from inquiries
    where caterer_id = my_caterer_id()
       or customer_id in (select customer_id from customers where user_id = auth.uid())
  )
);
grant select on inquiry_messages to authenticated;

create or replace function public.reply_to_inquiry(p_ref text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inq inquiries%rowtype;
  cust customers%rowtype;
  owner_id uuid;
  txt text := nullif(trim(p_message), '');
begin
  if txt is null then
    raise exception 'Please type your reply.';
  end if;
  if length(txt) > 1000 then
    raise exception 'Reply is too long (max 1000 characters).';
  end if;

  select * into inq from inquiries where ref = p_ref;
  if not found then
    raise exception 'Inquiry not found.';
  end if;

  select * into cust from customers where customer_id = inq.customer_id and user_id = auth.uid();
  if not found then
    raise exception 'Not allowed.';
  end if;

  insert into inquiry_messages (inquiry_id, sender_id, sender_role, message)
  values (inq.inquiry_id, auth.uid(), 'Customer', txt);

  select user_id into owner_id from caterer_profiles where caterer_id = inq.caterer_id;
  if owner_id is not null then
    insert into notifications (user_id, message, type)
    values (owner_id, coalesce(cust.name, 'The customer') || ' replied on ' || inq.ref || ': ' || txt, 'inquiry');
  end if;
end $$;

grant execute on function public.reply_to_inquiry(text, text) to authenticated;

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

-- F) Refresh Supabase's schema cache so the new columns are found right away
notify pgrst, 'reload schema';
