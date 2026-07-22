alter table public.enrolments drop constraint if exists enrolments_status_check;
alter table public.enrolments
  add constraint enrolments_status_check
  check (status in ('pending','active','paid_unlinked','completed','cancelled','inactive'));

with ranked_active as (
  select
    id,
    row_number() over (
      partition by user_id
      order by coalesce(enrolled_date, created_at::date) desc, updated_at desc, created_at desc, id desc
    ) as active_rank
  from public.enrolments
  where user_id is not null
    and status = 'active'
)
update public.enrolments e
set status = 'inactive',
    updated_at = now()
from ranked_active ranked
where e.id = ranked.id
  and ranked.active_rank > 1;

create or replace function public.deactivate_other_active_enrolments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.status = 'active' then
    update public.enrolments
    set status = 'inactive',
        updated_at = now()
    where user_id = new.user_id
      and status = 'active'
      and id is distinct from new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists enrolments_deactivate_other_active on public.enrolments;
create trigger enrolments_deactivate_other_active
  before insert or update of user_id, status on public.enrolments
  for each row
  when (new.status = 'active')
  execute procedure public.deactivate_other_active_enrolments();

create unique index if not exists enrolments_one_active_program_per_student_idx
  on public.enrolments(user_id)
  where status = 'active' and user_id is not null;

create or replace function public.admin_assign_student_programme(
  target_user_id uuid,
  target_program_id uuid,
  target_program_level_id uuid,
  assignment_status text default 'active'
)
returns public.enrolments
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(btrim(coalesce(assignment_status, 'active')));
  target_role text;
  target_profile public.profiles;
  selected_program public.programs;
  selected_track public.program_levels;
  saved_enrolment public.enrolments;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if target_user_id is null or target_program_id is null or target_program_level_id is null then
    raise exception 'Student, programme and track are required.';
  end if;

  if clean_status not in ('active', 'pending') then
    raise exception 'Student programme assignment must be active or pending.';
  end if;

  select * into target_profile
  from public.profiles
  where id = target_user_id;

  if target_profile.id is null then
    raise exception 'Student profile was not found.';
  end if;

  select coalesce(
    (select role from public.user_roles where user_id = target_user_id),
    'student'
  )
  into target_role;

  if target_role <> 'student' then
    raise exception 'Only student programme assignments can be changed here.';
  end if;

  select * into selected_program
  from public.programs
  where id = target_program_id
    and active = true;

  if selected_program.id is null then
    raise exception 'Programme was not found or is not active.';
  end if;

  select * into selected_track
  from public.program_levels
  where id = target_program_level_id
    and program_id = target_program_id
    and active = true;

  if selected_track.id is null then
    raise exception 'Track was not found for the selected programme.';
  end if;

  if clean_status = 'active' then
    update public.enrolments
    set status = 'inactive',
        updated_at = now()
    where user_id = target_user_id
      and status = 'active';
  end if;

  insert into public.enrolments (
    user_id,
    program_id,
    program_level_id,
    status,
    enrolled_date
  )
  values (
    target_user_id,
    target_program_id,
    target_program_level_id,
    clean_status,
    current_date
  )
  returning * into saved_enrolment;

  insert into public.audit_logs (
    actor_user_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    'student_programme_assigned',
    'enrolments',
    saved_enrolment.id,
    jsonb_build_object(
      'student_id', target_user_id,
      'program_id', target_program_id,
      'program_title', selected_program.title,
      'track_id', target_program_level_id,
      'track_name', selected_track.level_name,
      'status', clean_status
    )
  );

  return saved_enrolment;
end;
$$;

revoke all on function public.admin_assign_student_programme(uuid, uuid, uuid, text) from public;
grant execute on function public.admin_assign_student_programme(uuid, uuid, uuid, text) to authenticated;

create or replace function public.admin_search_students(
  search_text text default '',
  status_filter text default 'all',
  program_filter uuid default null,
  page_limit integer default 25,
  page_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  date_of_birth date,
  education_level text,
  address text,
  account_status text,
  status_changed_at timestamptz,
  status_changed_by uuid,
  status_reason text,
  program_id uuid,
  program_level_id uuid,
  program_title text,
  level_name text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_search text := lower(btrim(coalesce(search_text, '')));
  clean_status text := lower(btrim(coalesce(status_filter, 'all')));
  safe_limit integer := least(greatest(coalesce(page_limit, 25), 1), 50);
  safe_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if clean_status not in ('all', 'active', 'inactive') then
    raise exception 'Student account status filter must be all, active or inactive.';
  end if;

  return query
  with active_enrolment as (
    select distinct on (e.user_id)
      e.user_id,
      e.program_id,
      e.program_level_id,
      p.title as program_title,
      pl.level_name
    from public.enrolments e
    join public.programs p on p.id = e.program_id
    join public.program_levels pl on pl.id = e.program_level_id
    where e.status = 'active'
    order by e.user_id, e.updated_at desc, e.created_at desc
  ),
  candidates as (
    select
      pr.id,
      pr.full_name,
      pr.email,
      pr.phone,
      pr.date_of_birth,
      pr.education_level,
      pr.address,
      pr.account_status,
      pr.status_changed_at,
      pr.status_changed_by,
      pr.status_reason,
      ae.program_id,
      ae.program_level_id,
      ae.program_title,
      ae.level_name,
      pr.created_at
    from public.profiles pr
    left join public.user_roles ur on ur.user_id = pr.id
    left join active_enrolment ae on ae.user_id = pr.id
    where coalesce(ur.role, 'student') = 'student'
      and (clean_status = 'all' or pr.account_status = clean_status)
      and (program_filter is null or ae.program_id = program_filter)
      and (
        clean_search = ''
        or lower(coalesce(pr.full_name, '')) like '%' || clean_search || '%'
        or lower(coalesce(pr.email, '')) like '%' || clean_search || '%'
        or lower(coalesce(pr.phone, '')) like '%' || clean_search || '%'
        or lower(coalesce(pr.account_status, '')) like '%' || clean_search || '%'
        or lower(coalesce(ae.program_title, '')) like '%' || clean_search || '%'
        or lower(coalesce(ae.level_name, '')) like '%' || clean_search || '%'
      )
  )
  select
    candidates.id,
    candidates.full_name,
    candidates.email,
    candidates.phone,
    candidates.date_of_birth,
    candidates.education_level,
    candidates.address,
    candidates.account_status,
    candidates.status_changed_at,
    candidates.status_changed_by,
    candidates.status_reason,
    candidates.program_id,
    candidates.program_level_id,
    candidates.program_title,
    candidates.level_name,
    count(*) over() as total_count
  from candidates
  order by lower(coalesce(nullif(candidates.full_name, ''), candidates.email, '')), candidates.created_at desc
  limit safe_limit
  offset safe_offset;
end;
$$;

revoke all on function public.admin_search_students(text, text, uuid, integer, integer) from public;
grant execute on function public.admin_search_students(text, text, uuid, integer, integer) to authenticated;

create or replace function public.admin_update_student_profile(
  target_user_id uuid,
  next_full_name text default '',
  next_phone text default '',
  next_date_of_birth date default null,
  next_education_level text default '',
  next_address text default '',
  next_program_id uuid default null,
  next_program_level_id uuid default null,
  next_account_status text default null,
  next_status_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
  clean_status text := nullif(lower(btrim(coalesce(next_account_status, ''))), '');
  previous_profile public.profiles;
  updated_profile public.profiles;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if target_user_id is null then
    raise exception 'Select a student before saving.';
  end if;

  select * into previous_profile
  from public.profiles
  where id = target_user_id;

  if previous_profile.id is null then
    raise exception 'Student profile was not found.';
  end if;

  select coalesce(
    (select role from public.user_roles where user_id = target_user_id),
    'student'
  )
  into target_role;

  if target_role <> 'student' then
    raise exception 'Only student records can be changed with this action.';
  end if;

  if clean_status is not null and clean_status not in ('active', 'inactive') then
    raise exception 'Account status must be active or inactive.';
  end if;

  if (next_program_id is null) <> (next_program_level_id is null) then
    raise exception 'Programme and track must be saved together.';
  end if;

  update public.profiles
  set
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
    profile_completed = (
      btrim(coalesce(next_full_name, '')) <> ''
      and btrim(coalesce(next_phone, '')) <> ''
      and next_date_of_birth is not null
      and btrim(coalesce(next_education_level, '')) <> ''
      and btrim(coalesce(next_address, '')) <> ''
    )
  where id = target_user_id
  returning * into updated_profile;

  if next_program_id is not null then
    perform public.admin_assign_student_programme(
      target_user_id,
      next_program_id,
      next_program_level_id,
      'active'
    );
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
    'student_profile_updated',
    'profiles',
    target_user_id,
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
        'program_level_id', next_program_level_id
      )
    )
  );

  return updated_profile;
end;
$$;

revoke all on function public.admin_update_student_profile(uuid, text, text, date, text, text, uuid, uuid, text, text) from public;
grant execute on function public.admin_update_student_profile(uuid, text, text, date, text, text, uuid, uuid, text, text) to authenticated;

create or replace function public.admin_update_program_level_price(
  target_program_level_id uuid,
  next_price_naira numeric,
  change_reason text default null
)
returns public.program_levels
language plpgsql
security definer
set search_path = public
as $$
declare
  next_price_kobo integer := round(coalesce(next_price_naira, -1) * 100)::integer;
  previous_level public.program_levels;
  updated_level public.program_levels;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if target_program_level_id is null then
    raise exception 'Choose a programme track before saving the price.';
  end if;

  if next_price_kobo < 0 then
    raise exception 'Price must be zero or higher.';
  end if;

  select * into previous_level
  from public.program_levels
  where id = target_program_level_id;

  if previous_level.id is null then
    raise exception 'Programme track was not found.';
  end if;

  update public.program_levels
  set price_kobo = next_price_kobo,
      updated_at = now()
  where id = target_program_level_id
  returning * into updated_level;

  update public.program_prices
  set active = false,
      updated_at = now()
  where track_id = target_program_level_id
    and active = true;

  insert into public.program_prices (
    program_id,
    track_id,
    price_kobo,
    currency,
    active,
    created_by
  )
  values (
    updated_level.program_id,
    updated_level.id,
    updated_level.price_kobo,
    'NGN',
    updated_level.active,
    auth.uid()
  );

  insert into public.audit_logs (
    actor_user_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    'program_level_price_updated',
    'program_levels',
    updated_level.id,
    jsonb_build_object(
      'program_id', updated_level.program_id,
      'previous_price_kobo', previous_level.price_kobo,
      'next_price_kobo', updated_level.price_kobo,
      'reason', nullif(btrim(coalesce(change_reason, '')), '')
    )
  );

  return updated_level;
end;
$$;

revoke all on function public.admin_update_program_level_price(uuid, numeric, text) from public;
grant execute on function public.admin_update_program_level_price(uuid, numeric, text) to authenticated;
