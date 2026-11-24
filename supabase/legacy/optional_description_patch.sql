-- Run once in the Supabase SQL editor (safe to run again).
-- Makes the business description optional: a profile can be Published without one.
-- (The other publishing rules stay: business name, contact number, event type, guest capacity.)
create or replace function public.enforce_publish_rules() returns trigger
language plpgsql as $$
begin
  if new.status = 'Published' and (
       coalesce(trim(new.business_name), '') = ''
    or coalesce(trim(new.contact_number), '') = ''
    or coalesce(array_length(new.event_types, 1), 0) = 0
    or coalesce(new.max_guests, 0) <= 0
    or coalesce(new.min_guests, 0) > new.max_guests
  ) then
    raise exception 'Complete the publishing checklist before publishing.';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';