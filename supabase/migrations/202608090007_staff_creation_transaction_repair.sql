-- Keep Staff Auth creation and the public Staff control plane in agreement.
-- The Edge Function is the only caller and supplies a verified active Admin ID.

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
set search_path = public, auth
as $$
declare
  auth_email text;
  auth_role text;
  provisioned_portal_id text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role access is required.';
  end if;

  if not exists (
    select 1
    from public.user_roles role_record
    join public.profiles profile on profile.id = role_record.user_id
    where role_record.user_id = $2
      and role_record.role = 'admin'
      and profile.account_status = 'active'
  ) then
    raise exception 'A verified active Admin account is required.';
  end if;

  select lower(coalesce(user_record.email, '')),
         coalesce(user_record.raw_app_meta_data ->> 'zentel_role', '')
  into auth_email, auth_role
  from auth.users user_record
  where user_record.id = $1;

  if auth_email is null then
    raise exception 'The Staff Auth account was not found.';
  end if;
  if auth_email <> lower(btrim($4)) or auth_role <> 'staff' then
    raise exception 'The Staff Auth identity did not pass verification.';
  end if;

  select profile.portal_id into provisioned_portal_id
  from public.profiles profile
  where profile.id = $1;

  if provisioned_portal_id is null then
    provisioned_portal_id := public.generate_account_portal_id('staff');
  elsif provisioned_portal_id !~ '^ZIF-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' then
    raise exception 'The Staff Portal ID did not pass verification.';
  end if;

  insert into public.profiles (
    id, portal_id, full_name, email, phone, account_status, status_reason,
    status_changed_at, status_changed_by, must_change_password,
    profile_completed, profile_completion, updated_at
  ) values (
    $1, provisioned_portal_id, btrim($3), lower(btrim($4)), btrim($5),
    'inactive', 'New Staff account pending Admin activation', now(), $2,
    true, true, 100, now()
  )
  on conflict (id) do update set
    portal_id = coalesce(public.profiles.portal_id, excluded.portal_id),
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    account_status = 'inactive',
    status_reason = excluded.status_reason,
    status_changed_at = now(),
    status_changed_by = $2,
    must_change_password = true,
    profile_completed = true,
    profile_completion = 100,
    updated_at = now();

  insert into public.user_roles(user_id, role)
  values ($1, 'staff')
  on conflict (user_id) do update set role = 'staff', updated_at = now();

  insert into public.staff_profiles(user_id, job_title, department, created_by)
  values ($1, btrim($6), btrim($7), $2)
  on conflict (user_id) do update set
    job_title = excluded.job_title,
    department = excluded.department,
    created_by = excluded.created_by,
    updated_at = now();

  insert into public.staff_capabilities(staff_user_id, capability, enabled, granted_by)
  select $1, allowed_capability, false, $2
  from unnest(array[
    'account_search', 'view_basic_profile', 'view_programme_assignment',
    'view_payment_status', 'view_loan_status', 'correct_contact_information',
    'send_support_notification', 'resolve_support_case', 'create_admin_escalation'
  ]::text[]) allowed_capability
  on conflict (staff_user_id, capability) do update set
    enabled = false,
    granted_by = $2,
    granted_at = null,
    updated_at = now();

  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (
    $2,
    'staff_account_created',
    'profiles',
    $1,
    jsonb_build_object(
      'job_title', btrim($6),
      'department', btrim($7),
      'account_status', 'inactive',
      'capabilities_enabled', false
    )
  );

  return query
  select profile.portal_id, profile.account_status
  from public.profiles profile
  join public.user_roles role_record
    on role_record.user_id = profile.id and role_record.role = 'staff'
  join public.staff_profiles staff_profile on staff_profile.user_id = profile.id
  where profile.id = $1
    and profile.portal_id ~ '^ZIF-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'
    and profile.account_status = 'inactive'
    and not exists (
      select 1 from public.staff_capabilities capability
      where capability.staff_user_id = profile.id and capability.enabled
    );
end;
$$;

revoke all on function public.provision_staff_account(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_staff_account(uuid, uuid, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
