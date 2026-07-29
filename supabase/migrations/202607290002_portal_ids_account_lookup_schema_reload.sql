create extension if not exists "pgcrypto";

alter table public.profiles
  add column if not exists portal_id text;

alter table public.profiles drop constraint if exists profiles_portal_id_format_check;
alter table public.profiles
  add constraint profiles_portal_id_format_check
  check (portal_id is null or portal_id ~ '^ZI[ST]-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');

create unique index if not exists profiles_portal_id_unique_idx
  on public.profiles(portal_id)
  where portal_id is not null;

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
  byte_index integer;
  attempt integer;
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

create or replace function public.assign_profile_portal_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_role text;
begin
  if tg_op = 'UPDATE' and old.portal_id is not null and new.portal_id is distinct from old.portal_id then
    raise exception 'Portal IDs are permanent and cannot be changed.';
  end if;

  if new.portal_id is not null then
    new.portal_id := upper(btrim(new.portal_id));
    return new;
  end if;

  select role into account_role
  from public.user_roles
  where user_id = new.id;

  if account_role is null then
    select case
      when lower(coalesce(user_record.email, '')) = 'zentelinsight@gmail.com' then 'admin'
      when coalesce(user_record.raw_app_meta_data ->> 'zentel_role', '') = 'tutor'
        and coalesce(user_record.raw_app_meta_data ->> 'zentel_provisioned_by', '') = 'admin' then 'tutor'
      else 'student'
    end
    into account_role
    from auth.users user_record
    where user_record.id = new.id;
  end if;

  if account_role in ('student', 'tutor') then
    new.portal_id := public.generate_account_portal_id(account_role);
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_assign_portal_id on public.profiles;
create trigger profiles_assign_portal_id
  before insert or update of portal_id on public.profiles
  for each row execute procedure public.assign_profile_portal_id();

create or replace function public.assign_portal_id_after_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('student', 'tutor') then
    update public.profiles
    set portal_id = public.generate_account_portal_id(new.role),
        updated_at = now()
    where id = new.user_id
      and portal_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists user_roles_assign_portal_id on public.user_roles;
create trigger user_roles_assign_portal_id
  after insert or update of role on public.user_roles
  for each row execute procedure public.assign_portal_id_after_role_change();

create or replace function public.require_portal_id_for_learner_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('student', 'tutor') and not exists (
    select 1
    from public.profiles profile
    where profile.id = new.user_id
      and profile.portal_id is not null
  ) then
    raise exception 'Student and Tutor accounts require a permanent Portal ID.';
  end if;
  return new;
end;
$$;

drop trigger if exists user_roles_require_portal_id on public.user_roles;
create constraint trigger user_roles_require_portal_id
  after insert or update of role on public.user_roles
  deferrable initially deferred
  for each row execute procedure public.require_portal_id_for_learner_role();

do $$
declare
  account record;
  student_backfill_count integer := 0;
  tutor_backfill_count integer := 0;
begin
  for account in
    select profile.id, role_record.role
    from public.profiles profile
    join public.user_roles role_record on role_record.user_id = profile.id
    where role_record.role in ('student', 'tutor')
      and profile.portal_id is null
    order by profile.created_at, profile.id
  loop
    update public.profiles
    set portal_id = public.generate_account_portal_id(account.role),
        updated_at = now()
    where id = account.id
      and portal_id is null;
    if found and account.role = 'student' then
      student_backfill_count := student_backfill_count + 1;
    elsif found and account.role = 'tutor' then
      tutor_backfill_count := tutor_backfill_count + 1;
    end if;
  end loop;

  insert into public.audit_logs (action, target_table, metadata)
  values (
    'portal_id_backfill_completed',
    'profiles',
    jsonb_build_object(
      'students_updated', student_backfill_count,
      'tutors_updated', tutor_backfill_count,
      'students_total', (
        select count(*) from public.profiles profile
        join public.user_roles role_record on role_record.user_id = profile.id
        where role_record.role = 'student' and profile.portal_id is not null
      ),
      'tutors_total', (
        select count(*) from public.profiles profile
        join public.user_roles role_record on role_record.user_id = profile.id
        where role_record.role = 'tutor' and profile.portal_id is not null
      )
    )
  );
end;
$$;

do $$
declare
  matching_functions integer;
  deployed_signature text;
begin
  select count(*), min(pg_get_function_identity_arguments(procedure.oid))
  into matching_functions, deployed_signature
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'tutor_search_assigned_students';

  if matching_functions <> 1
    or deployed_signature <> 'search_text text, status_filter text, assignment_filter text, track_filter uuid, page_limit integer, page_offset integer' then
    raise exception 'The canonical Tutor Student lookup function signature is not installed.';
  end if;
end;
$$;

create index if not exists audit_logs_account_lookup_rate_idx
  on public.audit_logs(actor_user_id, action, created_at desc);

drop function if exists public.admin_update_tutor_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, uuid
);

create or replace function public.admin_update_tutor_profile(
  target_tutor_id uuid,
  next_title text default 'Mr',
  next_full_name text default '',
  next_phone text default '',
  next_date_of_birth date default null,
  next_education_level text default '',
  next_address text default '',
  next_specialisation text default '',
  next_professional_bio text default '',
  next_qualifications text default '',
  next_teaching_experience text default '',
  next_availability text default '',
  next_account_status text default null,
  next_status_reason text default null,
  next_program_id uuid default null,
  next_track_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_title text := btrim(coalesce(next_title, ''));
  clean_status text := nullif(lower(btrim(coalesce(next_account_status, ''))), '');
  target_role text;
  previous_profile public.profiles;
  updated_profile public.profiles;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if clean_title not in ('Mr', 'Mrs') then
    raise exception 'Tutor title must be Mr or Mrs.';
  end if;

  if clean_status is not null and clean_status not in ('active', 'inactive') then
    raise exception 'Account status must be active or inactive.';
  end if;

  select * into previous_profile
  from public.profiles
  where id = target_tutor_id;

  if previous_profile.id is null then
    raise exception 'Tutor profile was not found.';
  end if;

  select coalesce((select role from public.user_roles where user_id = target_tutor_id), 'student')
  into target_role;

  if target_role <> 'tutor' then
    raise exception 'Only Tutor records can be changed with this action.';
  end if;

  update public.profiles
  set
    title = clean_title,
    full_name = btrim(coalesce(next_full_name, '')),
    phone = btrim(coalesce(next_phone, '')),
    date_of_birth = next_date_of_birth,
    education_level = btrim(coalesce(next_education_level, '')),
    address = btrim(coalesce(next_address, '')),
    account_status = coalesce(clean_status, account_status),
    status_reason = case
      when clean_status is not null and clean_status is distinct from account_status
        then nullif(btrim(coalesce(next_status_reason, '')), '')
      else status_reason
    end,
    profile_completion = least(
      100,
      (
        (case when btrim(coalesce(next_full_name, '')) <> '' then 1 else 0 end) +
        (case when email <> '' then 1 else 0 end) +
        (case when btrim(coalesce(next_phone, '')) <> '' then 1 else 0 end) +
        (case when avatar_path is not null and avatar_path <> '' then 1 else 0 end)
      ) * 100 / 4
    )
  where id = target_tutor_id
  returning * into updated_profile;

  insert into public.tutor_profiles (
    user_id,
    title,
    specialisation,
    professional_bio,
    qualifications,
    teaching_experience,
    availability
  )
  values (
    target_tutor_id,
    clean_title,
    btrim(coalesce(next_specialisation, '')),
    btrim(coalesce(next_professional_bio, '')),
    btrim(coalesce(next_qualifications, '')),
    btrim(coalesce(next_teaching_experience, '')),
    btrim(coalesce(next_availability, ''))
  )
  on conflict (user_id) do update set
    title = excluded.title,
    specialisation = excluded.specialisation,
    professional_bio = excluded.professional_bio,
    qualifications = excluded.qualifications,
    teaching_experience = excluded.teaching_experience,
    availability = excluded.availability,
    updated_at = now();

  if next_program_id is not null then
    perform public.admin_assign_tutor_programme(target_tutor_id, next_program_id, next_track_id, true);
  end if;

  insert into public.audit_logs (
    actor_user_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    'tutor_profile_updated',
    'profiles',
    target_tutor_id,
    jsonb_build_object(
      'previous', jsonb_build_object(
        'full_name', previous_profile.full_name,
        'phone', previous_profile.phone,
        'date_of_birth', previous_profile.date_of_birth,
        'education_level', previous_profile.education_level,
        'address', previous_profile.address,
        'account_status', previous_profile.account_status
      ),
      'next', jsonb_build_object(
        'full_name', updated_profile.full_name,
        'phone', updated_profile.phone,
        'date_of_birth', updated_profile.date_of_birth,
        'education_level', updated_profile.education_level,
        'address', updated_profile.address,
        'account_status', updated_profile.account_status,
        'program_id', next_program_id,
        'track_id', next_track_id
      )
    )
  );

  return updated_profile;
end;
$$;

revoke all on function public.admin_update_tutor_profile(
  uuid, text, text, text, date, text, text, text, text, text, text, text, text, text, uuid, uuid
) from public;
grant execute on function public.admin_update_tutor_profile(
  uuid, text, text, text, date, text, text, text, text, text, text, text, text, text, uuid, uuid
) to authenticated;

notify pgrst, 'reload schema';
