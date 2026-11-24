-- Run once in the Supabase SQL editor (safe to run again).
-- Splits packages into "food" (food only) and "catering" (full service). Existing packages stay "catering".
alter table catering_packages add column if not exists package_type text not null default 'catering';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catering_packages_package_type_check') then
    alter table catering_packages
      add constraint catering_packages_package_type_check check (package_type in ('food', 'catering'));
  end if;
end $$;

notify pgrst, 'reload schema';
