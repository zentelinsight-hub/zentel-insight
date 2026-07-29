create or replace function public.tutor_search_assigned_students(
  search_text text default '',
  status_filter text default 'all',
  assignment_filter text default 'all',
  track_filter uuid default null,
  page_limit integer default 20,
  page_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  avatar_path text,
  account_status text,
  profile_completion integer,
  program_id uuid,
  program_title text,
  track_id uuid,
  track_name text,
  assignment_type text,
  connected_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  active_tutor_id uuid := auth.uid();
  active_role text;
  clean_search text := lower(btrim(coalesce(search_text, '')));
begin
  select role_record.role into active_role
  from public.user_roles role_record
  where role_record.user_id = active_tutor_id;

  if active_tutor_id is null
    or active_role <> 'tutor'
    or not public.is_account_active(active_tutor_id) then
    raise exception 'Tutor access is not available.';
  end if;

  if status_filter not in ('all', 'active', 'inactive', 'suspended') then
    raise exception 'Invalid account status filter.';
  end if;

  if assignment_filter not in ('all', 'official', 'preference') then
    raise exception 'Invalid assignment filter.';
  end if;

  return query
  with active_assignment as (
    select assignment.program_id, assignment.track_id
    from public.tutor_program_assignments assignment
    where assignment.tutor_id = active_tutor_id
      and assignment.active = true
    order by assignment.updated_at desc, assignment.created_at desc
    limit 1
  ),
  official as (
    select
      enrolment.id as source_id,
      enrolment.user_id,
      enrolment.program_id,
      enrolment.program_level_id as track_id,
      'official'::text as assignment_type,
      enrolment.created_at as connected_at
    from public.enrolments enrolment
    join active_assignment assigned
      on assigned.program_id = enrolment.program_id
     and (assigned.track_id is null or assigned.track_id = enrolment.program_level_id)
    where enrolment.status = 'active'
  ),
  preferences as (
    select
      preference.id as source_id,
      preference.user_id,
      preference.program_id,
      preference.track_id,
      'preference'::text as assignment_type,
      preference.created_at as connected_at
    from public.student_program_preferences preference
    join active_assignment assigned
      on assigned.program_id = preference.program_id
     and (assigned.track_id is null or assigned.track_id = preference.track_id)
    where not exists (
      select 1
      from official enrolled
      where enrolled.user_id = preference.user_id
    )
  ),
  connected as (
    select * from official
    union all
    select * from preferences
  ),
  filtered as (
    select
      connected.source_id,
      connected.user_id,
      profile.full_name,
      profile.avatar_path,
      profile.account_status,
      profile.profile_completion,
      connected.program_id,
      program.title as program_title,
      connected.track_id,
      level.level_name as track_name,
      connected.assignment_type,
      connected.connected_at
    from connected
    join public.profiles profile on profile.id = connected.user_id
    join public.programs program on program.id = connected.program_id
    left join public.program_levels level on level.id = connected.track_id
    where (status_filter = 'all' or profile.account_status = status_filter)
      and (assignment_filter = 'all' or connected.assignment_type = assignment_filter)
      and (track_filter is null or connected.track_id = track_filter)
      and (
        clean_search = ''
        or lower(concat_ws(' ', profile.full_name, program.title, level.level_name, profile.account_status)) like '%' || clean_search || '%'
      )
  )
  select
    filtered.source_id,
    filtered.user_id,
    filtered.full_name,
    filtered.avatar_path,
    filtered.account_status,
    filtered.profile_completion,
    filtered.program_id,
    filtered.program_title,
    filtered.track_id,
    filtered.track_name,
    filtered.assignment_type,
    filtered.connected_at,
    count(*) over() as total_count
  from filtered
  order by
    case when filtered.assignment_type = 'official' then 0 else 1 end,
    filtered.connected_at desc,
    filtered.full_name
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
end;
$$;

revoke all on function public.tutor_search_assigned_students(text, text, text, uuid, integer, integer) from public;
grant execute on function public.tutor_search_assigned_students(text, text, text, uuid, integer, integer) to authenticated;

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

notify pgrst, 'reload schema';
