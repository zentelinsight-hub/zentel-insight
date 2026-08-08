alter table public.technology_feed_items
  add column if not exists favicon_url text;

create or replace function public.provision_staff_account(
  staff_user_id uuid,
  admin_user_id uuid,
  staff_full_name text,
  staff_email text,
  staff_phone text,
  staff_job_title text,
  staff_department text
)
returns table (portal_id text, account_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role access is required.';
  end if;
  if not exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = admin_user_id and ur.role = 'admin' and p.account_status = 'active'
  ) then
    raise exception 'A verified active Admin account is required.';
  end if;

  insert into public.profiles (
    id, full_name, email, phone, account_status, status_reason,
    status_changed_at, status_changed_by, must_change_password,
    profile_completed, profile_completion, updated_at
  ) values (
    staff_user_id, btrim(staff_full_name), lower(btrim(staff_email)), btrim(staff_phone),
    'inactive', 'New Staff account pending Admin activation', now(), admin_user_id,
    true, true, 100, now()
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    account_status = 'inactive',
    status_reason = excluded.status_reason,
    status_changed_at = now(),
    status_changed_by = admin_user_id,
    must_change_password = true,
    profile_completed = true,
    profile_completion = 100,
    updated_at = now();

  insert into public.user_roles(user_id, role)
  values (staff_user_id, 'staff')
  on conflict (user_id) do update set role = 'staff', updated_at = now();

  insert into public.staff_profiles(user_id, job_title, department, created_by)
  values (staff_user_id, btrim(staff_job_title), btrim(staff_department), admin_user_id)
  on conflict (user_id) do update set
    job_title = excluded.job_title,
    department = excluded.department,
    updated_at = now();

  insert into public.staff_capabilities(staff_user_id, capability, enabled, granted_by)
  select staff_user_id, capability, false, admin_user_id
  from unnest(array[
    'account_search', 'view_basic_profile', 'view_programme_assignment',
    'view_payment_status', 'view_loan_status', 'correct_contact_information',
    'send_support_notification', 'resolve_support_case', 'create_admin_escalation'
  ]::text[]) capability
  on conflict (staff_user_id, capability) do update set
    enabled = false,
    granted_by = admin_user_id,
    granted_at = null,
    updated_at = now();

  return query
  select p.portal_id, p.account_status
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id and ur.role = 'staff'
  where p.id = staff_user_id
    and p.portal_id ~ '^ZIF-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'
    and p.account_status = 'inactive';
end;
$$;

revoke all on function public.provision_staff_account(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_staff_account(uuid, uuid, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
