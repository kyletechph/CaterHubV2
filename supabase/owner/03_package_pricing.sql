-- Run once in the Supabase SQL editor (safe to run again).
-- Lets a package have one fixed price for a set number of guests (like a family combo),
-- as well as the usual price per guest. Existing packages stay "per guest".
alter table catering_packages add column if not exists price_type text not null default 'per_guest';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catering_packages_price_type_check') then
    alter table catering_packages
      add constraint catering_packages_price_type_check check (price_type in ('per_guest', 'fixed'));
  end if;
end $$;

notify pgrst, 'reload schema';
