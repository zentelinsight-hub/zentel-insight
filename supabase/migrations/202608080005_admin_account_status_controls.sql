-- Canonical verified-Admin status control for Student, Tutor and Staff accounts.

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active', 'inactive', 'restricted', 'suspended'));

create or replace function public.admin_set_account_status(
  target_user_id uuid,
  next_status text,
  status_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(btrim(coalesce(next_status, '')));
  clean_reason text := nullif(btrim(coalesce(status_reason, '')), '');
  target_role text;
  previous_status text;
  updated_profile public.profiles;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;
  if target_user_id is null then
    raise exception 'Choose a valid account.';
  end if;
  if clean_status not in ('active', 'inactive', 'restricted', 'suspended') then
    raise exception 'Choose a valid account status.';
  end if;

  select profile.account_status,
         coalesce((select role from public.user_roles where user_id = profile.id), 'student')
  into previous_status, target_role
  from public.profiles profile
  where profile.id = target_user_id
  for update;

  if previous_status is null then
    raise exception 'Account profile was not found.';
  end if;
  if target_role = 'admin' then
    raise exception 'The Admin account status cannot be changed.';
  end if;
  if target_role not in ('student', 'tutor', 'staff') then
    raise exception 'This account role cannot be changed here.';
  end if;

  update public.profiles
  set account_status = clean_status,
      status_reason = coalesce(clean_reason, case clean_status
        when 'active' then 'Restored by Admin after account review'
        when 'inactive' then 'Deactivated by Admin after account review'
        when 'restricted' then 'Restricted by Admin after security review'
        else 'Suspended by Admin after account review'
      end),
      failed_login_attempts = case when clean_status = 'active' then 0 else failed_login_attempts end,
      last_failed_login_at = case when clean_status = 'active' then null else last_failed_login_at end,
      suspended_at = case when clean_status = 'suspended' then coalesce(suspended_at, now()) else null end,
      updated_at = now()
  where id = target_user_id
  returning * into updated_profile;

  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (
    auth.uid(),
    'account_status_changed',
    'profiles',
    target_user_id,
    jsonb_build_object('role', target_role, 'previous_status', previous_status, 'next_status', clean_status, 'reason', clean_reason)
  );

  return updated_profile;
end;
$$;

revoke all on function public.admin_set_account_status(uuid, text, text) from public;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
