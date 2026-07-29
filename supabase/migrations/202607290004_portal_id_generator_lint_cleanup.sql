create or replace function public.generate_account_portal_id(account_role text)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  prefix text;
  random_bytes bytea;
  token text;
  candidate text;
begin
  if account_role = 'student' then
    prefix := 'ZIS-';
  elsif account_role = 'tutor' then
    prefix := 'ZIT-';
  else
    raise exception 'Portal IDs are available only for Student and Tutor accounts.';
  end if;

  for attempt in 1..50 loop
    random_bytes := gen_random_bytes(8);
    token := '';
    for byte_index in 0..7 loop
      token := token || substr(alphabet, (get_byte(random_bytes, byte_index) % length(alphabet)) + 1, 1);
    end loop;
    candidate := prefix || substr(token, 1, 4) || '-' || substr(token, 5, 4);
    if not exists (select 1 from public.profiles where portal_id = candidate) then
      return candidate;
    end if;
  end loop;

  raise exception 'A unique Portal ID could not be generated.';
end;
$$;

revoke all on function public.generate_account_portal_id(text) from public;

notify pgrst, 'reload schema';
