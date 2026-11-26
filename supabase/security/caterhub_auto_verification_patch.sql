-- Run in the Supabase SQL editor (safe to run again, also if you ran an older version). Run AFTER caterhub_reviews_verification_patch.sql.
-- Makes business verification AUTOMATIC: when the owner saves their details, the database runs the checks below
-- and switches the verified badge on or off. No person has to approve it.
--
-- IMPORTANT: no software can tell a good fake permit from a real one. These checks stop lazy fakes, reused
-- documents and copied numbers, but a careful forger can still pass. Spot-check businesses against the
-- agency's public online search (DTI / SEC / CDA / city permit) when they start getting inquiries.

alter table caterer_profiles     add column if not exists verified_until date;
alter table caterer_verification add column if not exists check_status  text not null default 'Failed' check (check_status in ('Passed', 'Failed'));
alter table caterer_verification add column if not exists check_note    text;
alter table caterer_verification add column if not exists document_etag text;

-- photo_check = the app read the permit photo and matched the name and number. The first time this patch runs,
-- rows that were already accepted keep working; after that a new photo is needed whenever the details change.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'caterer_verification' and column_name = 'photo_check') then
    alter table caterer_verification add column photo_check boolean not null default false;
    update caterer_verification set photo_check = true;
  end if;
end $$;

-- obvious junk numbers: too short, one repeated character, or a plain run like 12345 / 98765
create or replace function public.is_junk_number(s text) returns boolean language sql immutable as $$
  select s is null
      or length(s) < 5
      or s ~ '^(.)\1+$'
      or position(s in '01234567890123456789') > 0
      or position(s in '98765432109876543210') > 0
$$;

-- the badge can only be changed by the automatic check below (or by an admin / the SQL editor)
create or replace function public.guard_is_verified() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('caterhub.auto_verify', true), '') = '1'
     or auth.uid() is null or coalesce(public.my_role(), '') = 'Admin' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_verified := false; new.verified_until := null;
  else
    new.is_verified := old.is_verified; new.verified_until := old.verified_until;
  end if;
  return new;
end $$;

-- the automatic check (duplicates are compared by digits only, so 'DTI-4829371' and '4829371' count as the same number)
create or replace function public.verif_auto() returns trigger language plpgsql security definer set search_path = public as $$
declare
  prof  caterer_profiles%rowtype;
  reg   text; prm text; nm text; bn text; etag text;
  notes text[] := '{}';
  ok    boolean;
begin
  select * into prof from caterer_profiles where caterer_id = new.caterer_id;

  -- changed the details without taking a new photo: the old photo check no longer counts
  if tg_op = 'UPDATE' and new.document_path is not distinct from old.document_path
     and (new.registration_no is distinct from old.registration_no
          or new.permit_no is distinct from old.permit_no
          or new.legal_name is distinct from old.legal_name) then
    new.photo_check := false;
  end if;

  reg := regexp_replace(lower(coalesce(new.registration_no, '')), '[^a-z0-9]', '', 'g');
  prm := regexp_replace(lower(coalesce(new.permit_no, '')), '[^a-z0-9]', '', 'g');
  nm  := regexp_replace(lower(coalesce(new.legal_name, '')), '[^a-z0-9]', '', 'g');
  bn  := regexp_replace(lower(coalesce(prof.business_name, '')), '[^a-z0-9]', '', 'g');

  if length(nm) < 3 or bn = '' or not (nm like '%' || bn || '%' or bn like '%' || nm || '%') then
    notes := array_append(notes, 'The registered business name must match your CaterHub business name.');
  end if;

  if length(reg) < 6 or length(reg) > 20 or reg !~ '[0-9].*[0-9].*[0-9].*[0-9].*[0-9]' or public.is_junk_number(reg) then
    notes := array_append(notes, 'The registration number does not look valid.');
  elsif exists (select 1 from caterer_verification o
                where o.caterer_id <> new.caterer_id and o.check_status = 'Passed'
                  and o.registration_type = new.registration_type
                  and regexp_replace(coalesce(o.registration_no, ''), '[^0-9]', '', 'g') = regexp_replace(reg, '[^0-9]', '', 'g')) then
    notes := array_append(notes, 'This registration number is already used by another business. Contact CaterHub if it is yours.');
  end if;

  if length(prm) < 5 or prm !~ '[0-9].*[0-9].*[0-9]' or public.is_junk_number(prm) then
    notes := array_append(notes, 'The permit number does not look valid.');
  elsif exists (select 1 from caterer_verification o
                where o.caterer_id <> new.caterer_id and o.check_status = 'Passed'
                  and regexp_replace(coalesce(o.permit_no, ''), '[^0-9]', '', 'g') = regexp_replace(prm, '[^0-9]', '', 'g')) then
    notes := array_append(notes, 'This permit number is already used by another business. Contact CaterHub if it is yours.');
  end if;

  if new.permit_expiry is null then
    notes := array_append(notes, 'Add the permit expiry date.');
  elsif new.permit_expiry < current_date or new.permit_expiry > current_date + interval '3 years' then
    notes := array_append(notes, 'The permit expiry date must be in the future, within 3 years.');
  end if;

  if new.document_path is null or split_part(new.document_path, '/', 1) <> prof.user_id::text then
    notes := array_append(notes, 'Upload a clear photo or scan of your permit or registration.');
  else
    select o.metadata ->> 'eTag' into etag from storage.objects o
      where o.bucket_id = 'verification' and o.name = new.document_path;
    if not found then
      notes := array_append(notes, 'The uploaded file could not be found. Upload it again.');
    elsif etag is not null and exists (select 1 from caterer_verification o
                where o.caterer_id <> new.caterer_id and o.check_status = 'Passed' and o.document_etag = etag) then
      notes := array_append(notes, 'This exact file was already used by another business.');
    end if;
  end if;

  if not new.photo_check then
    notes := array_append(notes, 'Take a photo of your permit with your camera so it can be matched with these details.');
  end if;

  ok := array_length(notes, 1) is null;
  new.check_status := case when ok then 'Passed' else 'Failed' end;
  new.check_note   := array_to_string(notes, ' ');
  new.document_etag := etag;
  new.updated_at   := now();

  perform set_config('caterhub.auto_verify', '1', true);
  update caterer_profiles set is_verified = ok, verified_until = case when ok then new.permit_expiry else null end
   where caterer_id = new.caterer_id;
  return new;
end $$;

drop trigger if exists verif_changed on caterer_verification;
drop trigger if exists verif_auto on caterer_verification;
create trigger verif_auto before insert or update on caterer_verification
  for each row execute function public.verif_auto();

-- deleting the details removes the badge
create or replace function public.verif_removed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('caterhub.auto_verify', '1', true);
  update caterer_profiles set is_verified = false, verified_until = null where caterer_id = old.caterer_id;
  return old;
end $$;
drop trigger if exists verif_removed on caterer_verification;
create trigger verif_removed after delete on caterer_verification
  for each row execute function public.verif_removed();

-- renaming the business re-runs the check (the registered name must still match)
create or replace function public.verif_recheck() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update caterer_verification set updated_at = now() where caterer_id = new.caterer_id;
  return new;
end $$;
drop trigger if exists verif_recheck on caterer_profiles;
create trigger verif_recheck after update of business_name on caterer_profiles
  for each row when (old.business_name is distinct from new.business_name)
  execute function public.verif_recheck();

-- check everything that was already submitted
update caterer_verification set updated_at = now();

notify pgrst, 'reload schema';
