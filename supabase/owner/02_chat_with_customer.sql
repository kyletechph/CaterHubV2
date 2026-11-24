-- Run once in the Supabase SQL editor (safe to run again).
-- Lets the caterer send chat messages to the customer on an inquiry (without changing its status).
-- Requires the inquiry_messages table from caterhub_safe_update.sql / caterhub_reply_patch.sql.
create or replace function public.reply_as_caterer(p_ref text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inq inquiries%rowtype;
  prof caterer_profiles%rowtype;
  cust_user uuid;
  txt text := nullif(trim(p_message), '');
begin
  if txt is null then
    raise exception 'Please type your message.';
  end if;
  if length(txt) > 1000 then
    raise exception 'Message is too long (max 1000 characters).';
  end if;

  select * into inq from inquiries where ref = p_ref;
  if not found then
    raise exception 'Inquiry not found.';
  end if;

  select * into prof from caterer_profiles where caterer_id = inq.caterer_id and user_id = auth.uid();
  if not found then
    raise exception 'Not allowed.';
  end if;

  insert into inquiry_messages (inquiry_id, sender_id, sender_role, message)
  values (inq.inquiry_id, auth.uid(), 'Caterer', txt);

  select user_id into cust_user from customers where customer_id = inq.customer_id;
  if cust_user is not null then
    insert into notifications (user_id, message, type)
    values (cust_user, prof.business_name || ' replied on ' || inq.ref || ': ' || txt, 'inquiry');
  end if;
end $$;

grant execute on function public.reply_as_caterer(text, text) to authenticated;

notify pgrst, 'reload schema';
