create or replace function public.admin_search_people_v2(
  role_filter text default 'all',
  search_text text default '',
  status_filter text default 'all',
  assignment_filter text default 'all',
  program_filter uuid default null,
  page_limit integer default 25,
  page_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  role_name text,
  title text,
  full_name text,
  email text,
  phone text,
  date_of_birth date,
  education_level text,
  address text,
  avatar_path text,
  account_status text,
  status_changed_at timestamptz,
  status_changed_by uuid,
  status_reason text,
  profile_completion integer,
  failed_login_attempts integer,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  program_id uuid,
  program_level_id uuid,
  track_id uuid,
  assignment_id uuid,
  program_title text,
  level_name text,
  track_name text,
  assignment_count integer,
  assignment_status text,
  specialisation text,
  professional_bio text,
  qualifications text,
  teaching_experience text,
  availability text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_role text := lower(btrim(coalesce(role_filter, 'all')));
  clean_search text := lower(btrim(coalesce(search_text, '')));
  clean_status text := lower(btrim(coalesce(status_filter, 'all')));
  clean_assignment text := lower(btrim(coalesce(assignment_filter, 'all')));
  safe_limit integer := least(greatest(coalesce(page_limit, 25), 1), 50);
  safe_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if clean_role not in ('all', 'student', 'tutor') then
    raise exception 'People role filter must be all, student or tutor.';
  end if;
  if clean_status not in ('all', 'active', 'inactive', 'suspended') then
    raise exception 'People status filter must be all, active, inactive or suspended.';
  end if;
  if clean_assignment not in ('all', 'assigned', 'unassigned') then
    raise exception 'People assignment filter must be all, assigned or unassigned.';
  end if;

  return query
  with student_assignments as (
    select distinct on (e.user_id)
      e.id,
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
  student_counts as (
    select e.user_id, count(*)::integer as assignment_count
    from public.enrolments e
    where e.status = 'active'
    group by e.user_id
  ),
  tutor_assignments as (
    select distinct on (tpa.tutor_id)
      tpa.id,
      tpa.tutor_id,
      tpa.program_id,
      tpa.track_id,
      p.title as program_title,
      pl.level_name as track_name
    from public.tutor_program_assignments tpa
    join public.programs p on p.id = tpa.program_id
    left join public.program_levels pl on pl.id = tpa.track_id
    where tpa.active = true
    order by tpa.tutor_id, tpa.updated_at desc, tpa.created_at desc
  ),
  tutor_counts as (
    select tpa.tutor_id, count(*)::integer as assignment_count
    from public.tutor_program_assignments tpa
    where tpa.active = true
    group by tpa.tutor_id
  ),
  candidates as (
    select
      pr.id,
      coalesce(ur.role::text, 'student') as role_name,
      coalesce(tp.title, pr.title, case when ur.role = 'tutor' then 'Mr' else '' end) as title,
      pr.full_name,
      pr.email,
      pr.phone,
      pr.date_of_birth,
      pr.education_level,
      pr.address,
      pr.avatar_path,
      pr.account_status,
      pr.status_changed_at,
      pr.status_changed_by,
      pr.status_reason,
      pr.profile_completion,
      pr.failed_login_attempts,
      coalesce(au.created_at, pr.created_at) as created_at,
      au.last_sign_in_at,
      case when ur.role = 'tutor' then ta.program_id else sa.program_id end as program_id,
      case when ur.role = 'tutor' then null::uuid else sa.program_level_id end as program_level_id,
      case when ur.role = 'tutor' then ta.track_id else sa.program_level_id end as track_id,
      case when ur.role = 'tutor' then ta.id else sa.id end as assignment_id,
      case when ur.role = 'tutor' then ta.program_title else sa.program_title end as program_title,
      case when ur.role = 'tutor' then ta.track_name else sa.level_name end as level_name,
      case when ur.role = 'tutor' then ta.track_name else sa.level_name end as track_name,
      case when ur.role = 'tutor' then coalesce(tc.assignment_count, 0) else coalesce(sc.assignment_count, 0) end as assignment_count,
      coalesce(tp.specialisation, '') as specialisation,
      coalesce(tp.professional_bio, '') as professional_bio,
      coalesce(tp.qualifications, '') as qualifications,
      coalesce(tp.teaching_experience, '') as teaching_experience,
      coalesce(tp.availability, '') as availability
    from public.profiles pr
    left join public.user_roles ur on ur.user_id = pr.id
    left join auth.users au on au.id = pr.id
    left join public.tutor_profiles tp on tp.user_id = pr.id
    left join student_assignments sa on sa.user_id = pr.id
    left join student_counts sc on sc.user_id = pr.id
    left join tutor_assignments ta on ta.tutor_id = pr.id
    left join tutor_counts tc on tc.tutor_id = pr.id
    where coalesce(ur.role::text, 'student') in ('student', 'tutor')
  ),
  filtered as (
    select c.*
    from candidates c
    where (clean_role = 'all' or c.role_name = clean_role)
      and (clean_status = 'all' or c.account_status = clean_status)
      and (
        clean_assignment = 'all'
        or (clean_assignment = 'assigned' and c.assignment_count > 0)
        or (clean_assignment = 'unassigned' and c.assignment_count = 0)
      )
      and (program_filter is null or c.program_id = program_filter)
      and (
        clean_search = ''
        or lower(coalesce(c.full_name, '')) like '%' || clean_search || '%'
        or lower(coalesce(c.email, '')) like '%' || clean_search || '%'
        or lower(coalesce(c.phone, '')) like '%' || clean_search || '%'
        or lower(coalesce(c.account_status, '')) like '%' || clean_search || '%'
        or lower(coalesce(c.program_title, '')) like '%' || clean_search || '%'
        or lower(coalesce(c.level_name, '')) like '%' || clean_search || '%'
        or lower(coalesce(c.specialisation, '')) like '%' || clean_search || '%'
      )
  )
  select
    f.id,
    f.id as user_id,
    f.role_name,
    f.title,
    f.full_name,
    f.email,
    f.phone,
    f.date_of_birth,
    f.education_level,
    f.address,
    f.avatar_path,
    f.account_status,
    f.status_changed_at,
    f.status_changed_by,
    f.status_reason,
    f.profile_completion,
    f.failed_login_attempts,
    f.created_at,
    f.last_sign_in_at,
    f.program_id,
    f.program_level_id,
    f.track_id,
    f.assignment_id,
    f.program_title,
    f.level_name,
    f.track_name,
    f.assignment_count,
    case when f.assignment_count > 0 then 'assigned' else 'unassigned' end,
    f.specialisation,
    f.professional_bio,
    f.qualifications,
    f.teaching_experience,
    f.availability,
    count(*) over()
  from filtered f
  order by lower(coalesce(nullif(f.full_name, ''), f.email, '')), f.created_at desc
  limit safe_limit
  offset safe_offset;
end;
$$;

revoke all on function public.admin_search_people_v2(text, text, text, text, uuid, integer, integer) from public;
grant execute on function public.admin_search_people_v2(text, text, text, text, uuid, integer, integer) to authenticated;
