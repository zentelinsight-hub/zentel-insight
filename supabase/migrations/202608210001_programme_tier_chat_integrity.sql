-- Programme tier is the authoritative cohort boundary. Preserve historical
-- classrooms and messages while enforcing one active official room per tier.

drop index if exists public.tutor_program_assignments_one_active_tutor_idx;

do $$
declare
  tier record;
begin
  for tier in
    select level.id, level.program_id
    from public.program_levels level
    join public.programs program on program.id = level.program_id
    where level.active and program.active
  loop
    perform public.ensure_current_classroom(tier.program_id, tier.id);
  end loop;
end;
$$;

create temporary table canonical_tier_classrooms on commit drop as
with ranked as (
  select
    classroom.track_id,
    classroom.id as classroom_id,
    classroom.cohort_id,
    row_number() over (
      partition by classroom.track_id
      order by
        (classroom.status = 'active') desc,
        (cohort.status = 'active') desc,
        (select count(*) from public.enrolments enrolment
          where enrolment.classroom_id = classroom.id and enrolment.status = 'active') desc,
        (select count(*) from public.program_chat_messages message
          join public.program_chat_rooms room on room.id = message.room_id
          where room.classroom_id = classroom.id) desc,
        classroom.created_at,
        classroom.id
    ) as tier_rank
  from public.classrooms classroom
  join public.cohorts cohort on cohort.id = classroom.cohort_id
)
select track_id, classroom_id, cohort_id
from ranked
where tier_rank = 1;

create unique index canonical_tier_classrooms_track_idx
  on canonical_tier_classrooms(track_id);

create temporary table canonical_tier_students on commit drop as
select distinct
  canonical.track_id,
  canonical.classroom_id,
  canonical.cohort_id,
  membership.user_id
from public.classroom_memberships membership
join public.classrooms classroom on classroom.id = membership.classroom_id
join canonical_tier_classrooms canonical on canonical.track_id = classroom.track_id
where membership.member_role = 'student'
  and membership.active
  and membership.left_at is null
union
select distinct
  canonical.track_id,
  canonical.classroom_id,
  canonical.cohort_id,
  enrolment.user_id
from public.enrolments enrolment
join canonical_tier_classrooms canonical on canonical.track_id = enrolment.program_level_id
where enrolment.status = 'active'
  and enrolment.user_id is not null;

-- A moved Student loses every old tier room immediately. Existing canonical
-- joins are retained only when the Student was already in that classroom.
update public.program_chat_members member
set active = false,
    left_at = coalesce(member.left_at, now()),
    updated_at = now()
from public.program_chat_rooms room
join public.classrooms classroom on classroom.id = room.classroom_id
join canonical_tier_classrooms canonical on canonical.track_id = classroom.track_id
where member.room_id = room.id
  and member.role = 'student'
  and member.active
  and classroom.id <> canonical.classroom_id;

update public.classroom_memberships membership
set active = false,
    left_at = coalesce(membership.left_at, now()),
    updated_at = now()
from public.classrooms classroom
join canonical_tier_classrooms canonical on canonical.track_id = classroom.track_id
where membership.classroom_id = classroom.id
  and membership.member_role = 'student'
  and membership.active
  and classroom.id <> canonical.classroom_id;

update public.enrolments enrolment
set classroom_id = canonical.classroom_id,
    cohort_id = canonical.cohort_id,
    updated_at = now()
from canonical_tier_classrooms canonical
where enrolment.program_level_id = canonical.track_id
  and enrolment.status = 'active'
  and enrolment.user_id is not null
  and enrolment.classroom_id is distinct from canonical.classroom_id;

insert into public.classroom_memberships (
  classroom_id, user_id, member_role, active, joined_at, left_at
)
select classroom_id, user_id, 'student', true, now(), null
from canonical_tier_students
on conflict (classroom_id, user_id, member_role) do update
set active = true,
    left_at = null,
    joined_at = case
      when public.classroom_memberships.active then public.classroom_memberships.joined_at
      else now()
    end,
    updated_at = now();

create temporary table canonical_tier_tutors on commit drop as
with ranked as (
  select
    classroom.track_id,
    canonical.classroom_id,
    canonical.cohort_id,
    assignment.tutor_id,
    assignment.assignment_role,
    assignment.assigned_at,
    assignment.assigned_by,
    row_number() over (
      partition by classroom.track_id
      order by
        (assignment.classroom_id = canonical.classroom_id) desc,
        assignment.assigned_at,
        assignment.id
    ) as tutor_rank
  from public.tutor_classroom_assignments assignment
  join public.classrooms classroom on classroom.id = assignment.classroom_id
  join canonical_tier_classrooms canonical on canonical.track_id = classroom.track_id
  where assignment.active
)
select track_id, classroom_id, cohort_id, tutor_id, assignment_role, assigned_at, assigned_by
from ranked
where tutor_rank = 1;

update public.tutor_classroom_assignments assignment
set active = false,
    updated_at = now()
from public.classrooms classroom
join canonical_tier_classrooms canonical on canonical.track_id = classroom.track_id
where assignment.classroom_id = classroom.id
  and assignment.active
  and not exists (
    select 1
    from canonical_tier_tutors winner
    where winner.track_id = classroom.track_id
      and winner.tutor_id = assignment.tutor_id
      and winner.classroom_id = assignment.classroom_id
  );

insert into public.tutor_classroom_assignments (
  tutor_id, classroom_id, assignment_role, active, assigned_at, assigned_by
)
select tutor_id, classroom_id, assignment_role, true, assigned_at, assigned_by
from canonical_tier_tutors
on conflict (tutor_id, classroom_id) do update
set assignment_role = excluded.assignment_role,
    active = true,
    assigned_by = excluded.assigned_by,
    updated_at = now();

update public.tutor_program_assignments assignment
set active = false,
    updated_at = now()
where assignment.active
  and assignment.track_id in (select track_id from canonical_tier_classrooms)
  and not exists (
    select 1
    from canonical_tier_tutors winner
    join public.classrooms classroom on classroom.id = winner.classroom_id
    where winner.tutor_id = assignment.tutor_id
      and winner.track_id = assignment.track_id
      and classroom.program_id = assignment.program_id
  );

insert into public.tutor_program_assignments (
  tutor_id, program_id, track_id, assigned_by, active
)
select winner.tutor_id, classroom.program_id, winner.track_id, winner.assigned_by, true
from canonical_tier_tutors winner
join public.classrooms classroom on classroom.id = winner.classroom_id
on conflict (tutor_id, program_id, track_id) do update
set active = true,
    assigned_by = excluded.assigned_by,
    updated_at = now();

-- Duplicate rows remain available to Admin and retain their historical data.
update public.classrooms classroom
set status = 'completed',
    updated_at = now()
from canonical_tier_classrooms canonical
where classroom.track_id = canonical.track_id
  and classroom.id <> canonical.classroom_id
  and classroom.status = 'active';

update public.cohorts cohort
set status = 'completed',
    updated_at = now()
where cohort.status = 'active'
  and not exists (
    select 1 from canonical_tier_classrooms canonical
    where canonical.cohort_id = cohort.id
  );

update public.program_chat_rooms room
set title = program.title || ' — ' || level.level_name,
    program_id = classroom.program_id,
    track_id = classroom.track_id,
    cohort_id = classroom.cohort_id,
    active = classroom.status = 'active',
    updated_at = now()
from public.classrooms classroom
join public.programs program on program.id = classroom.program_id
join public.program_levels level on level.id = classroom.track_id
where room.classroom_id = classroom.id;

create unique index if not exists cohorts_one_active_tier_idx
  on public.cohorts(track_id)
  where status = 'active';

create unique index if not exists classrooms_one_active_tier_idx
  on public.classrooms(track_id)
  where status = 'active';

create unique index if not exists program_chat_rooms_one_active_tier_idx
  on public.program_chat_rooms(track_id)
  where active and classroom_id is not null and track_id is not null;

create unique index if not exists tutor_classroom_assignments_one_active_classroom_idx
  on public.tutor_classroom_assignments(classroom_id)
  where active;

create index if not exists program_chat_rooms_canonical_lookup_idx
  on public.program_chat_rooms(program_id, track_id, classroom_id, active);

-- Canonical room creation is serialized per immutable programme-tier ID.
create or replace function public.ensure_current_classroom(target_program_id uuid, target_track_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cohort_id uuid;
  target_classroom_id uuid;
  programme_title text;
  track_title text;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_track_id::text, 0));

  select program.title, level.level_name
  into programme_title, track_title
  from public.programs program
  join public.program_levels level on level.program_id = program.id
  where program.id = target_program_id
    and level.id = target_track_id
    and program.active
    and level.active;

  if programme_title is null then
    raise exception 'An active programme tier is required.';
  end if;

  select classroom.id
  into target_classroom_id
  from public.classrooms classroom
  join public.cohorts cohort on cohort.id = classroom.cohort_id
  where classroom.program_id = target_program_id
    and classroom.track_id = target_track_id
    and classroom.status = 'active'
    and cohort.status = 'active'
  order by classroom.created_at, classroom.id
  limit 1;

  if target_classroom_id is not null then
    return target_classroom_id;
  end if;

  select cohort.id
  into target_cohort_id
  from public.cohorts cohort
  where cohort.program_id = target_program_id
    and cohort.track_id = target_track_id
  order by (cohort.status = 'active') desc, cohort.created_at, cohort.id
  limit 1
  for update;

  if target_cohort_id is null then
    insert into public.cohorts (program_id, track_id, name, code, start_date, status)
    values (
      target_program_id,
      target_track_id,
      track_title,
      'COH-TIER-' || upper(substr(replace(target_track_id::text, '-', ''), 1, 12)),
      current_date,
      'active'
    )
    returning id into target_cohort_id;
  else
    update public.cohorts
    set status = 'active', updated_at = now()
    where id = target_cohort_id;
  end if;

  select classroom.id
  into target_classroom_id
  from public.classrooms classroom
  where classroom.program_id = target_program_id
    and classroom.track_id = target_track_id
  order by (classroom.cohort_id = target_cohort_id) desc, classroom.created_at, classroom.id
  limit 1
  for update;

  if target_classroom_id is null then
    insert into public.classrooms (program_id, track_id, cohort_id, name, code, status)
    values (
      target_program_id,
      target_track_id,
      target_cohort_id,
      programme_title || ' — ' || track_title,
      'CLS-TIER-' || upper(substr(replace(target_track_id::text, '-', ''), 1, 12)),
      'active'
    )
    returning id into target_classroom_id;
  else
    update public.classrooms
    set cohort_id = target_cohort_id,
        status = 'active',
        updated_at = now()
    where id = target_classroom_id;
  end if;

  return target_classroom_id;
end;
$$;

revoke all on function public.ensure_current_classroom(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_current_classroom(uuid, uuid) to service_role;

create or replace function public.sync_classroom_chat_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_title text;
begin
  select program.title || ' — ' || level.level_name
  into canonical_title
  from public.programs program
  join public.program_levels level on level.id = new.track_id
  where program.id = new.program_id;

  insert into public.program_chat_rooms (
    program_id, track_id, cohort_id, classroom_id, room_type, title, active
  ) values (
    new.program_id, new.track_id, new.cohort_id, new.id,
    'programme_track', coalesce(canonical_title, new.name), new.status = 'active'
  )
  on conflict (classroom_id) where classroom_id is not null do update
  set program_id = excluded.program_id,
      track_id = excluded.track_id,
      cohort_id = excluded.cohort_id,
      room_type = excluded.room_type,
      title = excluded.title,
      active = excluded.active,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists classrooms_sync_chat_room on public.classrooms;
create trigger classrooms_sync_chat_room
after insert or update of program_id, track_id, cohort_id, name, status
on public.classrooms
for each row execute function public.sync_classroom_chat_room();

create or replace function public.is_eligible_for_program_chat(target_room_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_chat_rooms room
    join public.classrooms classroom
      on classroom.id = room.classroom_id and classroom.status = 'active'
    join public.cohorts cohort
      on cohort.id = classroom.cohort_id and cohort.status = 'active'
    join public.profiles profile
      on profile.id = target_user_id and profile.account_status = 'active'
    where room.id = target_room_id
      and room.active
      and (
        (target_user_id = auth.uid() and public.is_verified_admin_session())
        or public.is_tutor_for_classroom(classroom.id, target_user_id)
        or public.is_student_in_classroom(classroom.id, target_user_id)
      )
  );
$$;

revoke all on function public.is_eligible_for_program_chat(uuid, uuid) from public, anon;

create or replace function public.can_access_program_chat(room_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_verified_admin_session()
    or exists (
      select 1
      from public.program_chat_members member
      join public.profiles profile
        on profile.id = member.user_id and profile.account_status = 'active'
      where member.room_id = room_uuid
        and member.user_id = auth.uid()
        and member.active
        and member.left_at is null
        and public.is_eligible_for_program_chat(room_uuid, member.user_id)
    );
$$;

revoke all on function public.can_access_program_chat(uuid) from public, anon;

create or replace function public.can_read_program_chat_message(target_room_id uuid, message_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_verified_admin_session()
    or exists (
      select 1
      from public.program_chat_members member
      where member.room_id = target_room_id
        and member.user_id = auth.uid()
        and member.active
        and member.left_at is null
        and message_created_at >= member.joined_at
        and public.can_access_program_chat(target_room_id)
    );
$$;

revoke all on function public.can_read_program_chat_message(uuid, timestamptz) from public, anon;

create or replace function public.get_classroom_chat_access(
  target_program_id uuid default null,
  target_track_id uuid default null,
  target_classroom_id uuid default null,
  target_room_id uuid default null
)
returns table (
  id uuid, program_id uuid, track_id uuid, cohort_id uuid, classroom_id uuid,
  title text, active boolean, program_title text, joined boolean,
  joined_at timestamptz, member_role text, last_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication is required.'; end if;
  if not public.is_account_active(current_user_id) then
    raise exception 'Your account must be active to use Classroom Chat.';
  end if;

  return query
  select
    room.id, room.program_id, room.track_id, room.cohort_id, room.classroom_id,
    room.title, room.active, program.title,
    coalesce(member.active and member.left_at is null, false),
    member.joined_at, member.role, member.last_read_at
  from public.program_chat_rooms room
  join public.classrooms classroom
    on classroom.id = room.classroom_id and classroom.status = 'active'
  join public.cohorts cohort
    on cohort.id = classroom.cohort_id and cohort.status = 'active'
  join public.programs program on program.id = room.program_id
  left join public.program_chat_members member
    on member.room_id = room.id and member.user_id = current_user_id
  where room.active
    and room.track_id = classroom.track_id
    and (target_program_id is null or room.program_id = target_program_id)
    and (target_track_id is null or room.track_id = target_track_id)
    and (target_classroom_id is null or room.classroom_id = target_classroom_id)
    and (target_room_id is null or room.id = target_room_id)
    and public.is_eligible_for_program_chat(room.id, current_user_id)
  order by program.title, room.title;
end;
$$;

revoke all on function public.get_classroom_chat_access(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.get_classroom_chat_access(uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.get_programme_chat_access(
  target_program_id uuid default null,
  target_track_id uuid default null,
  target_room_id uuid default null
)
returns table (
  id uuid, program_id uuid, track_id uuid, title text, active boolean,
  program_title text, joined boolean, joined_at timestamptz,
  member_role text, last_read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select access.id, access.program_id, access.track_id, access.title, access.active,
    access.program_title, access.joined, access.joined_at, access.member_role, access.last_read_at
  from public.get_classroom_chat_access(target_program_id, target_track_id, null, target_room_id) access;
$$;

revoke all on function public.get_programme_chat_access(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_programme_chat_access(uuid, uuid, uuid) to authenticated;

create or replace function public.revoke_student_chat_when_classroom_ends()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.member_role = 'student' and old.active then
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and (not new.active or new.left_at is not null)) then
      update public.program_chat_members member
      set active = false,
          left_at = coalesce(member.left_at, now()),
          updated_at = now()
      from public.program_chat_rooms room
      where room.classroom_id = old.classroom_id
        and member.room_id = room.id
        and member.user_id = old.user_id
        and member.active;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists classroom_membership_revoke_chat on public.classroom_memberships;
create trigger classroom_membership_revoke_chat
after update of active, left_at or delete on public.classroom_memberships
for each row execute function public.revoke_student_chat_when_classroom_ends();

create or replace function public.join_programme_chat(target_room_id uuid)
returns table (room_id uuid, joined_at timestamptz, joined boolean, already_joined boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_role text;
  room_record public.program_chat_rooms;
  membership public.program_chat_members;
  was_joined boolean := false;
  first_name text;
begin
  if current_user_id is null then raise exception 'Authentication is required.'; end if;

  select * into room_record
  from public.program_chat_rooms
  where id = target_room_id and active and classroom_id is not null;
  if room_record.id is null then raise exception 'This cohort chat is not available.'; end if;

  if public.is_verified_admin_session() then
    resolved_role := 'admin';
  elsif public.is_tutor_for_classroom(room_record.classroom_id, current_user_id) then
    resolved_role := 'tutor';
  elsif public.is_student_in_classroom(room_record.classroom_id, current_user_id) then
    resolved_role := 'student';
  end if;

  if resolved_role is null or not public.is_eligible_for_program_chat(target_room_id, current_user_id) then
    raise exception 'This classroom is not assigned to your account.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_room_id::text || current_user_id::text, 0));
  select * into membership
  from public.program_chat_members member
  where member.room_id = target_room_id and member.user_id = current_user_id
  for update;
  was_joined := membership.id is not null and membership.active and membership.left_at is null;

  if not was_joined then
    insert into public.program_chat_members (
      room_id, user_id, role, active, joined_at, left_at, last_read_at
    ) values (
      target_room_id, current_user_id, resolved_role, true, now(), null, now()
    )
    on conflict (room_id, user_id) do update
    set role = excluded.role,
        active = true,
        joined_at = now(),
        left_at = null,
        last_read_at = now(),
        updated_at = now()
    returning * into membership;

    select split_part(coalesce(nullif(full_name, ''), initcap(resolved_role)), ' ', 1)
    into first_name
    from public.profiles
    where id = current_user_id;

    insert into public.program_chat_messages (
      room_id, sender_id, message_type, sender_role, sender_display_name, body, client_message_id
    ) values (
      target_room_id, null, 'system', 'system', 'System',
      coalesce(first_name, initcap(resolved_role)) || ' joined the chat', gen_random_uuid()
    );

    update public.program_chat_members
    set last_read_at = now(), updated_at = now()
    where id = membership.id
    returning * into membership;

    insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
    values (
      current_user_id,
      'programme_chat_joined',
      'program_chat_rooms',
      target_room_id,
      jsonb_build_object('classroom_id', room_record.classroom_id, 'track_id', room_record.track_id)
    );
  end if;

  return query select target_room_id, membership.joined_at, true, was_joined;
end;
$$;

revoke all on function public.join_programme_chat(uuid) from public, anon;
grant execute on function public.join_programme_chat(uuid) to authenticated;

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
  old_enrolment public.enrolments;
  selected_program public.programs;
  selected_track public.program_levels;
  target_classroom_id uuid;
  target_cohort_id uuid;
  saved_enrolment public.enrolments;
begin
  if not public.is_verified_admin_session() then raise exception 'Admin security verification is required.'; end if;
  if clean_status not in ('active', 'pending') then raise exception 'Student programme assignment must be active or pending.'; end if;
  if not exists (
    select 1 from public.user_roles where user_id = target_user_id and role = 'student'
  ) then raise exception 'A Student account is required.'; end if;

  select * into selected_program from public.programs
  where id = target_program_id and active;
  select * into selected_track from public.program_levels
  where id = target_program_level_id and program_id = target_program_id and active;
  if selected_program.id is null or selected_track.id is null then
    raise exception 'Select an active programme and tier.';
  end if;

  select * into old_enrolment
  from public.enrolments
  where user_id = target_user_id and status = 'active'
  order by updated_at desc
  limit 1
  for update;

  if clean_status = 'active'
     and old_enrolment.id is not null
     and old_enrolment.program_id = target_program_id
     and old_enrolment.program_level_id = target_program_level_id then
    return old_enrolment;
  end if;

  if clean_status = 'active' then
    target_classroom_id := public.ensure_current_classroom(target_program_id, target_program_level_id);
    select cohort_id into target_cohort_id
    from public.classrooms where id = target_classroom_id;
  end if;

  update public.enrolments
  set status = 'inactive', updated_at = now()
  where user_id = target_user_id and status = 'active';

  insert into public.enrolments (
    user_id, program_id, program_level_id, cohort_id, classroom_id, status, enrolled_date
  ) values (
    target_user_id, target_program_id, target_program_level_id,
    target_cohort_id, target_classroom_id, clean_status, current_date
  )
  returning * into saved_enrolment;

  if clean_status = 'active' then
    update public.program_chat_members member
    set active = false,
        left_at = coalesce(member.left_at, now()),
        updated_at = now()
    from public.program_chat_rooms room
    where member.user_id = target_user_id
      and member.role = 'student'
      and member.room_id = room.id
      and member.active;
  end if;

  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (
    auth.uid(),
    case when old_enrolment.id is null then 'student_cohort_assigned' else 'student_cohort_moved' end,
    'enrolments',
    saved_enrolment.id,
    jsonb_build_object(
      'student_id', target_user_id,
      'old_program_id', old_enrolment.program_id,
      'old_track_id', old_enrolment.program_level_id,
      'program_id', target_program_id,
      'track_id', target_program_level_id,
      'classroom_id', target_classroom_id,
      'status', clean_status
    )
  );
  return saved_enrolment;
end;
$$;

revoke all on function public.admin_assign_student_programme(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.admin_assign_student_programme(uuid, uuid, uuid, text) to authenticated;

create or replace function public.admin_assign_student_classroom(
  target_user_id uuid,
  target_classroom_id uuid,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  classroom_record public.classrooms;
begin
  if coalesce(btrim(change_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select * into classroom_record
  from public.classrooms where id = target_classroom_id and status = 'active';
  if classroom_record.id is null then raise exception 'An active programme tier is required.'; end if;
  perform public.admin_assign_student_programme(
    target_user_id, classroom_record.program_id, classroom_record.track_id, 'active'
  );
end;
$$;

revoke all on function public.admin_assign_student_classroom(uuid, uuid, text) from public, anon;
grant execute on function public.admin_assign_student_classroom(uuid, uuid, text) to authenticated;

create or replace function public.admin_assign_tutor_classroom(
  target_tutor_id uuid,
  target_classroom_id uuid,
  target_role text,
  assignment_active boolean,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  classroom_record public.classrooms;
  conflicting_tutor text;
begin
  if not public.is_verified_admin_session() then raise exception 'Admin security verification is required.'; end if;
  if coalesce(btrim(change_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if target_role not in ('lead_tutor', 'assistant_tutor', 'reviewer') then raise exception 'Invalid Tutor assignment role.'; end if;
  if not exists (select 1 from public.user_roles where user_id = target_tutor_id and role = 'tutor') then
    raise exception 'A Tutor account is required.';
  end if;

  select * into classroom_record
  from public.classrooms
  where id = target_classroom_id and status = 'active';
  if classroom_record.id is null then raise exception 'An active programme tier is required.'; end if;

  if assignment_active then
    select coalesce(profile.full_name, profile.email, 'Another Tutor')
    into conflicting_tutor
    from public.tutor_classroom_assignments assignment
    join public.profiles profile on profile.id = assignment.tutor_id
    where assignment.classroom_id = target_classroom_id
      and assignment.active
      and assignment.tutor_id <> target_tutor_id
    limit 1;
    if conflicting_tutor is not null then
      raise exception 'This programme tier is already assigned to %. End that assignment before assigning another Tutor.', conflicting_tutor;
    end if;
  end if;

  insert into public.tutor_classroom_assignments (
    tutor_id, classroom_id, assignment_role, active, assigned_at, assigned_by
  ) values (
    target_tutor_id, target_classroom_id, target_role, assignment_active, now(), auth.uid()
  )
  on conflict (tutor_id, classroom_id) do update
  set assignment_role = excluded.assignment_role,
      active = excluded.active,
      assigned_by = auth.uid(),
      updated_at = now();

  insert into public.classroom_memberships (
    classroom_id, user_id, member_role, active, joined_at, left_at, assigned_by
  ) values (
    target_classroom_id, target_tutor_id, 'tutor', assignment_active, now(),
    case when assignment_active then null else now() end, auth.uid()
  )
  on conflict (classroom_id, user_id, member_role) do update
  set active = excluded.active,
      left_at = excluded.left_at,
      assigned_by = auth.uid(),
      updated_at = now();

  insert into public.tutor_program_assignments (
    tutor_id, program_id, track_id, assigned_by, active
  ) values (
    target_tutor_id, classroom_record.program_id, classroom_record.track_id, auth.uid(), assignment_active
  )
  on conflict (tutor_id, program_id, track_id) do update
  set active = excluded.active,
      assigned_by = auth.uid(),
      updated_at = now();

  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (
    auth.uid(),
    case when assignment_active then 'tutor_cohort_assigned' else 'tutor_cohort_assignment_ended' end,
    'classrooms',
    target_classroom_id,
    jsonb_build_object(
      'tutor_id', target_tutor_id,
      'track_id', classroom_record.track_id,
      'role', target_role,
      'reason', left(change_reason, 1000)
    )
  );
end;
$$;

revoke all on function public.admin_assign_tutor_classroom(uuid, uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_assign_tutor_classroom(uuid, uuid, text, boolean, text) to authenticated;

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
  target_classroom_id uuid;
  saved_assignment public.tutor_program_assignments;
begin
  if target_track_id is null then raise exception 'A programme tier is required.'; end if;
  target_classroom_id := public.ensure_current_classroom(target_program_id, target_track_id);
  perform public.admin_assign_tutor_classroom(
    target_tutor_id, target_classroom_id, 'lead_tutor', assignment_active,
    case when assignment_active then 'Tutor programme tier assignment' else 'Tutor programme tier assignment ended' end
  );
  select * into saved_assignment
  from public.tutor_program_assignments
  where tutor_id = target_tutor_id
    and program_id = target_program_id
    and track_id = target_track_id
  order by updated_at desc
  limit 1;
  return saved_assignment;
end;
$$;

revoke all on function public.admin_assign_tutor_programme(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_assign_tutor_programme(uuid, uuid, uuid, boolean) to authenticated;

create or replace function public.admin_get_tier_participants()
returns table (
  program_id uuid,
  program_title text,
  track_id uuid,
  tier_title text,
  classroom_id uuid,
  room_id uuid,
  room_title text,
  tutor_user_id uuid,
  tutor_name text,
  tutor_portal_id text,
  student_user_id uuid,
  student_name text,
  student_portal_id text,
  student_account_status text,
  chat_state text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  return query
  select
    program.id,
    program.title,
    level.id,
    level.level_name,
    classroom.id,
    room.id,
    room.title,
    tutor_assignment.tutor_id,
    tutor_profile.full_name,
    tutor_profile.portal_id,
    student_membership.user_id,
    student_profile.full_name,
    student_profile.portal_id,
    student_profile.account_status,
    case
      when student_membership.user_id is null then null
      when student_profile.account_status <> 'active' then 'Chat Restricted'
      when chat_member.active and chat_member.left_at is null then 'Joined Chat'
      else 'Not Joined'
    end
  from public.program_levels level
  join public.programs program on program.id = level.program_id and program.active
  join public.classrooms classroom
    on classroom.track_id = level.id and classroom.status = 'active'
  join public.cohorts cohort
    on cohort.id = classroom.cohort_id and cohort.status = 'active'
  join public.program_chat_rooms room
    on room.classroom_id = classroom.id and room.active
  left join public.tutor_classroom_assignments tutor_assignment
    on tutor_assignment.classroom_id = classroom.id and tutor_assignment.active
  left join public.profiles tutor_profile on tutor_profile.id = tutor_assignment.tutor_id
  left join public.classroom_memberships student_membership
    on student_membership.classroom_id = classroom.id
   and student_membership.member_role = 'student'
   and student_membership.active
   and student_membership.left_at is null
  left join public.profiles student_profile on student_profile.id = student_membership.user_id
  left join public.program_chat_members chat_member
    on chat_member.room_id = room.id and chat_member.user_id = student_membership.user_id
  where level.active
  order by program.title, level.level_name, student_profile.full_name nulls last;
end;
$$;

revoke all on function public.admin_get_tier_participants() from public, anon;
grant execute on function public.admin_get_tier_participants() to authenticated;

-- Loan KYC remains private. Students may delete only their own disposable,
-- not-yet-submitted upload when replacing a file in the local form region.
create or replace function public.can_delete_pending_loan_kyc(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select auth.uid() is not null
    and split_part(object_name, '/', 1) = auth.uid()::text
    and exists (
      select 1
      from public.profiles profile
      join public.user_roles role_record on role_record.user_id = profile.id
      where profile.id = auth.uid()
        and profile.account_status = 'active'
        and role_record.role = 'student'
    )
    and not exists (
      select 1
      from private.loan_kyc_records kyc
      where kyc.passport_photo_path = object_name
         or kyc.identification_path = object_name
    );
$$;

revoke all on function public.can_delete_pending_loan_kyc(text) from public, anon;
grant execute on function public.can_delete_pending_loan_kyc(text) to authenticated;

drop policy if exists "Students replace pending loan KYC" on storage.objects;
create policy "Students replace pending loan KYC"
on storage.objects for delete to authenticated
using (
  bucket_id = 'loan-kyc'
  and public.can_delete_pending_loan_kyc(name)
);
