-- Enforce the current Tutor Portal's single-assignment model and expose only
-- the minimum connected-Student fields through role-checked server functions.

with ranked_active_assignments as (
  select
    id,
    row_number() over (
      partition by tutor_id
      order by updated_at desc, created_at desc, id desc
    ) as assignment_rank
  from public.tutor_program_assignments
  where active = true
)
update public.tutor_program_assignments assignment
set active = false,
    updated_at = now()
from ranked_active_assignments ranked
where ranked.id = assignment.id
  and ranked.assignment_rank > 1;

create unique index if not exists tutor_program_assignments_one_active_tutor_idx
  on public.tutor_program_assignments(tutor_id)
  where active = true;

create or replace function public.admin_assign_tutor_programme(
  target_tutor_id uuid,
  target_program_id uuid,
  target_track_id uuid default null,
  assignment_active boolean default true
)
returns public.tutor_program_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
  selected_program public.programs;
  selected_track public.program_levels;
  saved_assignment public.tutor_program_assignments;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if target_tutor_id is null or target_program_id is null then
    raise exception 'Tutor and programme are required.';
  end if;

  select role into target_role
  from public.user_roles
  where user_id = target_tutor_id;

  if target_role <> 'tutor' then
    raise exception 'Only Tutor accounts can receive Tutor programme assignments.';
  end if;

  select * into selected_program
  from public.programs
  where id = target_program_id
    and active = true;

  if selected_program.id is null then
    raise exception 'Programme was not found or is not active.';
  end if;

  if target_track_id is not null then
    select * into selected_track
    from public.program_levels
    where id = target_track_id
      and program_id = target_program_id
      and active = true;

    if selected_track.id is null then
      raise exception 'Track was not found for the selected programme.';
    end if;
  end if;

  if assignment_active then
    update public.tutor_program_assignments
    set active = false,
        updated_at = now()
    where tutor_id = target_tutor_id
      and active = true;

    update public.tutor_program_assignments
    set active = true,
        assigned_by = auth.uid(),
        updated_at = now()
    where id = (
      select id
      from public.tutor_program_assignments
      where tutor_id = target_tutor_id
        and program_id = target_program_id
        and track_id is not distinct from target_track_id
      order by updated_at desc, created_at desc
      limit 1
    )
    returning * into saved_assignment;

    if saved_assignment.id is null then
      insert into public.tutor_program_assignments (
        tutor_id,
        program_id,
        track_id,
        assigned_by,
        active
      )
      values (
        target_tutor_id,
        target_program_id,
        target_track_id,
        auth.uid(),
        true
      )
      returning * into saved_assignment;
    end if;
  else
    update public.tutor_program_assignments
    set active = false,
        assigned_by = auth.uid(),
        updated_at = now()
    where id = (
      select id
      from public.tutor_program_assignments
      where tutor_id = target_tutor_id
        and program_id = target_program_id
        and track_id is not distinct from target_track_id
      order by updated_at desc, created_at desc
      limit 1
    )
    returning * into saved_assignment;

    if saved_assignment.id is null then
      insert into public.tutor_program_assignments (
        tutor_id,
        program_id,
        track_id,
        assigned_by,
        active
      )
      values (
        target_tutor_id,
        target_program_id,
        target_track_id,
        auth.uid(),
        false
      )
      returning * into saved_assignment;
    end if;
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
    case when assignment_active then 'tutor_programme_assigned' else 'tutor_programme_unassigned' end,
    'tutor_program_assignments',
    saved_assignment.id,
    jsonb_build_object(
      'tutor_id', target_tutor_id,
      'program_id', target_program_id,
      'program_title', selected_program.title,
      'track_id', target_track_id,
      'track_name', selected_track.level_name,
      'active', assignment_active
    )
  );

  return saved_assignment;
end;
$$;

revoke all on function public.admin_assign_tutor_programme(uuid, uuid, uuid, boolean) from public;
grant execute on function public.admin_assign_tutor_programme(uuid, uuid, uuid, boolean) to authenticated;

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
  select role into active_role
  from public.user_roles
  where user_id = active_tutor_id;

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

create or replace function public.tutor_update_professional_profile(
  next_professional_bio text,
  next_qualifications text,
  next_teaching_experience text,
  next_specialisation text,
  next_availability text
)
returns public.tutor_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  active_tutor_id uuid := auth.uid();
  active_role text;
  saved_profile public.tutor_profiles;
begin
  select role into active_role
  from public.user_roles
  where user_id = active_tutor_id;

  if active_tutor_id is null
    or active_role <> 'tutor'
    or not public.is_account_active(active_tutor_id) then
    raise exception 'Tutor profile access is not available.';
  end if;

  insert into public.tutor_profiles (
    user_id,
    title,
    professional_bio,
    qualifications,
    teaching_experience,
    specialisation,
    availability
  )
  values (
    active_tutor_id,
    coalesce((select title from public.profiles where id = active_tutor_id), 'Mr'),
    btrim(coalesce(next_professional_bio, '')),
    btrim(coalesce(next_qualifications, '')),
    btrim(coalesce(next_teaching_experience, '')),
    btrim(coalesce(next_specialisation, '')),
    btrim(coalesce(next_availability, ''))
  )
  on conflict (user_id) do update set
    professional_bio = excluded.professional_bio,
    qualifications = excluded.qualifications,
    teaching_experience = excluded.teaching_experience,
    specialisation = excluded.specialisation,
    availability = excluded.availability,
    updated_at = now()
  returning * into saved_profile;

  insert into public.audit_logs (
    actor_user_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    active_tutor_id,
    'tutor_professional_profile_updated',
    'tutor_profiles',
    saved_profile.user_id,
    jsonb_build_object('tutor_id', active_tutor_id)
  );

  return saved_profile;
end;
$$;

revoke all on function public.tutor_update_professional_profile(text, text, text, text, text) from public;
grant execute on function public.tutor_update_professional_profile(text, text, text, text, text) to authenticated;

alter table public.assignments
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.resources
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.resources drop constraint if exists resources_resource_type_check;
alter table public.resources
  add constraint resources_resource_type_check
  check (resource_type in ('document', 'video', 'link', 'template', 'download', 'guide', 'assignment'));

drop policy if exists "Tutors can manage assigned assignments" on public.assignments;
drop policy if exists "Tutors can read assigned assignments" on public.assignments;
drop policy if exists "Tutors can create assigned assignments" on public.assignments;
drop policy if exists "Tutors can update own assignments" on public.assignments;
drop policy if exists "Tutors can delete own assignments" on public.assignments;

create policy "Tutors can read assigned assignments"
  on public.assignments for select
  to authenticated
  using (
    public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  );

create policy "Tutors can create assigned assignments"
  on public.assignments for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  );

create policy "Tutors can update own assignments"
  on public.assignments for update
  to authenticated
  using (
    created_by = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  )
  with check (
    created_by = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  );

create policy "Tutors can delete own assignments"
  on public.assignments for delete
  to authenticated
  using (
    created_by = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  );

drop policy if exists "Tutors can manage assigned resources" on public.resources;
drop policy if exists "Tutors can read assigned resources" on public.resources;
drop policy if exists "Tutors can create assigned resources" on public.resources;
drop policy if exists "Tutors can update own resources" on public.resources;
drop policy if exists "Tutors can delete own resources" on public.resources;

create policy "Tutors can read assigned resources"
  on public.resources for select
  to authenticated
  using (
    public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  );

create policy "Tutors can create assigned resources"
  on public.resources for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  );

create policy "Tutors can update own resources"
  on public.resources for update
  to authenticated
  using (
    created_by = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  )
  with check (
    created_by = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  );

create policy "Tutors can delete own resources"
  on public.resources for delete
  to authenticated
  using (
    created_by = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and public.is_tutor_for_program(program_id, program_level_id)
  );

create or replace function public.tutor_save_assignment(
  target_assignment_id uuid,
  next_title text,
  next_instructions text,
  next_due_at timestamptz,
  next_maximum_score integer,
  next_published boolean
)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  active_tutor_id uuid := auth.uid();
  active_role text;
  active_assignment public.tutor_program_assignments;
  saved_assignment public.assignments;
  was_published boolean := false;
begin
  select role into active_role from public.user_roles where user_id = active_tutor_id;
  if active_tutor_id is null or active_role <> 'tutor' or not public.is_account_active(active_tutor_id) then
    raise exception 'Tutor assignment access is not available.';
  end if;

  select * into active_assignment
  from public.tutor_program_assignments
  where tutor_id = active_tutor_id and active = true
  order by updated_at desc, created_at desc
  limit 1;

  if active_assignment.id is null then
    raise exception 'An active programme assignment is required.';
  end if;
  if char_length(btrim(coalesce(next_title, ''))) < 3 then
    raise exception 'Assignment title is required.';
  end if;
  if coalesce(next_maximum_score, 0) <= 0 then
    raise exception 'Maximum score must be greater than zero.';
  end if;

  if target_assignment_id is null then
    insert into public.assignments (
      program_id, program_level_id, title, instructions, due_at,
      maximum_score, published, created_by
    )
    values (
      active_assignment.program_id, active_assignment.track_id,
      btrim(next_title), btrim(coalesce(next_instructions, '')), next_due_at,
      next_maximum_score, coalesce(next_published, false), active_tutor_id
    )
    returning * into saved_assignment;
  else
    select published into was_published
    from public.assignments
    where id = target_assignment_id
      and created_by = active_tutor_id
      and program_id = active_assignment.program_id
      and program_level_id is not distinct from active_assignment.track_id;

    if not found then
      raise exception 'Assignment was not found for this Tutor programme.';
    end if;

    update public.assignments
    set title = btrim(next_title),
        instructions = btrim(coalesce(next_instructions, '')),
        due_at = next_due_at,
        maximum_score = next_maximum_score,
        published = coalesce(next_published, false),
        updated_at = now()
    where id = target_assignment_id
    returning * into saved_assignment;
  end if;

  if saved_assignment.published and not was_published then
    insert into public.portal_notifications (user_id, title, message, notification_type, link_path)
    select distinct
      connected.user_id,
      'New assignment: ' || saved_assignment.title,
      'A new assignment has been published for your programme.',
      'assignment',
      '/portal/assignments'
    from (
      select enrolment.user_id
      from public.enrolments enrolment
      where enrolment.program_id = active_assignment.program_id
        and enrolment.status = 'active'
        and (active_assignment.track_id is null or enrolment.program_level_id = active_assignment.track_id)
      union
      select preference.user_id
      from public.student_program_preferences preference
      where preference.program_id = active_assignment.program_id
        and (active_assignment.track_id is null or preference.track_id = active_assignment.track_id)
    ) connected
    join public.profiles profile on profile.id = connected.user_id and profile.account_status = 'active';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (
    active_tutor_id,
    case when target_assignment_id is null then 'tutor_assignment_created' else 'tutor_assignment_updated' end,
    'assignments',
    saved_assignment.id,
    jsonb_build_object('program_id', saved_assignment.program_id, 'published', saved_assignment.published)
  );

  return saved_assignment;
end;
$$;

revoke all on function public.tutor_save_assignment(uuid, text, text, timestamptz, integer, boolean) from public;
grant execute on function public.tutor_save_assignment(uuid, text, text, timestamptz, integer, boolean) to authenticated;

create or replace function public.tutor_save_resource(
  target_resource_id uuid,
  next_title text,
  next_description text,
  next_resource_type text,
  next_external_url text,
  next_published boolean
)
returns public.resources
language plpgsql
security definer
set search_path = public
as $$
declare
  active_tutor_id uuid := auth.uid();
  active_role text;
  active_assignment public.tutor_program_assignments;
  saved_resource public.resources;
  was_published boolean := false;
  clean_url text := btrim(coalesce(next_external_url, ''));
begin
  select role into active_role from public.user_roles where user_id = active_tutor_id;
  if active_tutor_id is null or active_role <> 'tutor' or not public.is_account_active(active_tutor_id) then
    raise exception 'Tutor resource access is not available.';
  end if;

  select * into active_assignment
  from public.tutor_program_assignments
  where tutor_id = active_tutor_id and active = true
  order by updated_at desc, created_at desc
  limit 1;

  if active_assignment.id is null then
    raise exception 'An active programme assignment is required.';
  end if;
  if char_length(btrim(coalesce(next_title, ''))) < 3 then
    raise exception 'Resource title is required.';
  end if;
  if next_resource_type not in ('document', 'video', 'link', 'template', 'download', 'guide') then
    raise exception 'Select a supported resource type.';
  end if;
  if clean_url !~* '^https://[^[:space:]]+$' then
    raise exception 'Enter a valid HTTPS resource URL.';
  end if;

  if target_resource_id is null then
    insert into public.resources (
      program_id, program_level_id, title, description, resource_type,
      url, external_url, active, published, created_by
    )
    values (
      active_assignment.program_id, active_assignment.track_id,
      btrim(next_title), btrim(coalesce(next_description, '')), next_resource_type,
      clean_url, clean_url, true, coalesce(next_published, false), active_tutor_id
    )
    returning * into saved_resource;
  else
    select published into was_published
    from public.resources
    where id = target_resource_id
      and created_by = active_tutor_id
      and program_id = active_assignment.program_id
      and program_level_id is not distinct from active_assignment.track_id;

    if not found then
      raise exception 'Resource was not found for this Tutor programme.';
    end if;

    update public.resources
    set title = btrim(next_title),
        description = btrim(coalesce(next_description, '')),
        resource_type = next_resource_type,
        url = clean_url,
        external_url = clean_url,
        active = true,
        published = coalesce(next_published, false),
        updated_at = now()
    where id = target_resource_id
    returning * into saved_resource;
  end if;

  if saved_resource.published and not was_published then
    insert into public.portal_notifications (user_id, title, message, notification_type, link_path)
    select distinct
      connected.user_id,
      'New learning resource: ' || saved_resource.title,
      'A new resource has been published for your programme.',
      'resource',
      '/portal/resources'
    from (
      select enrolment.user_id
      from public.enrolments enrolment
      where enrolment.program_id = active_assignment.program_id
        and enrolment.status = 'active'
        and (active_assignment.track_id is null or enrolment.program_level_id = active_assignment.track_id)
      union
      select preference.user_id
      from public.student_program_preferences preference
      where preference.program_id = active_assignment.program_id
        and (active_assignment.track_id is null or preference.track_id = active_assignment.track_id)
    ) connected
    join public.profiles profile on profile.id = connected.user_id and profile.account_status = 'active';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (
    active_tutor_id,
    case when target_resource_id is null then 'tutor_resource_created' else 'tutor_resource_updated' end,
    'resources',
    saved_resource.id,
    jsonb_build_object('program_id', saved_resource.program_id, 'published', saved_resource.published)
  );

  return saved_resource;
end;
$$;

revoke all on function public.tutor_save_resource(uuid, text, text, text, text, boolean) from public;
grant execute on function public.tutor_save_resource(uuid, text, text, text, text, boolean) to authenticated;

create index if not exists enrolments_tutor_directory_idx
  on public.enrolments(program_id, program_level_id, status, created_at desc);

create index if not exists student_preferences_tutor_directory_idx
  on public.student_program_preferences(program_id, track_id, created_at desc);

create index if not exists assignments_created_by_idx
  on public.assignments(created_by, program_id, updated_at desc);

create index if not exists resources_created_by_idx
  on public.resources(created_by, program_id, updated_at desc);
