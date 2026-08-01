-- Keep classroom chat rooms and Tutor memberships synchronized with academy data.

create or replace function public.sync_classroom_chat_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.program_chat_rooms (
    program_id,
    track_id,
    cohort_id,
    classroom_id,
    room_type,
    title,
    active
  ) values (
    new.program_id,
    new.track_id,
    new.cohort_id,
    new.id,
    'programme_track',
    new.name,
    new.status = 'active'
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

insert into public.program_chat_rooms (
  program_id,
  track_id,
  cohort_id,
  classroom_id,
  room_type,
  title,
  active
)
select
  classroom.program_id,
  classroom.track_id,
  classroom.cohort_id,
  classroom.id,
  'programme_track',
  classroom.name,
  classroom.status = 'active'
from public.classrooms classroom
on conflict (classroom_id) where classroom_id is not null do update
set program_id = excluded.program_id,
    track_id = excluded.track_id,
    cohort_id = excluded.cohort_id,
    room_type = excluded.room_type,
    title = excluded.title,
    active = excluded.active,
    updated_at = now();

create or replace function public.sync_tutor_classroom_chat_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room_id uuid;
begin
  select room.id
  into target_room_id
  from public.program_chat_rooms room
  where room.classroom_id = new.classroom_id
  limit 1;

  if target_room_id is null then
    return new;
  end if;

  if new.active then
    insert into public.program_chat_members (
      room_id,
      user_id,
      role,
      joined_at,
      active,
      left_at
    ) values (
      target_room_id,
      new.tutor_id,
      'tutor',
      coalesce(new.assigned_at, now()),
      true,
      null
    )
    on conflict (room_id, user_id) do update
    set role = 'tutor',
        active = true,
        left_at = null,
        updated_at = now();
  else
    update public.program_chat_members
    set active = false,
        left_at = coalesce(left_at, now()),
        updated_at = now()
    where room_id = target_room_id and user_id = new.tutor_id;
  end if;

  return new;
end;
$$;

drop trigger if exists tutor_classroom_assignments_sync_chat on public.tutor_classroom_assignments;
create trigger tutor_classroom_assignments_sync_chat
after insert or update of classroom_id, tutor_id, active
on public.tutor_classroom_assignments
for each row execute function public.sync_tutor_classroom_chat_membership();

insert into public.program_chat_members (room_id, user_id, role, joined_at, active, left_at)
select
  room.id,
  assignment.tutor_id,
  'tutor',
  coalesce(assignment.assigned_at, now()),
  true,
  null
from public.tutor_classroom_assignments assignment
join public.program_chat_rooms room on room.classroom_id = assignment.classroom_id
where assignment.active
on conflict (room_id, user_id) do update
set role = 'tutor',
    active = true,
    left_at = null,
    updated_at = now();

create or replace function public.get_classroom_chat_access(
  target_program_id uuid default null,
  target_track_id uuid default null,
  target_classroom_id uuid default null,
  target_room_id uuid default null
)
returns table (
  id uuid,
  program_id uuid,
  track_id uuid,
  cohort_id uuid,
  classroom_id uuid,
  title text,
  active boolean,
  program_title text,
  joined boolean,
  joined_at timestamptz,
  member_role text,
  last_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.is_account_active(current_user_id) then
    raise exception 'Your account must be active to use Classroom Chat.';
  end if;

  select role_record.role
  into current_role
  from public.user_roles role_record
  where role_record.user_id = current_user_id;

  if current_role not in ('admin', 'tutor', 'student') then
    raise exception 'Classroom access is not available.';
  end if;

  if current_role = 'admin' and not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  return query
  select
    room.id,
    room.program_id,
    room.track_id,
    room.cohort_id,
    room.classroom_id,
    room.title,
    room.active,
    program.title,
    coalesce(member.active and member.left_at is null, false),
    member.joined_at,
    member.role,
    member.last_read_at
  from public.program_chat_rooms room
  join public.programs program on program.id = room.program_id
  left join public.program_chat_members member
    on member.room_id = room.id and member.user_id = current_user_id
  where room.active
    and room.classroom_id is not null
    and (target_program_id is null or room.program_id = target_program_id)
    and (target_track_id is null or room.track_id = target_track_id)
    and (target_classroom_id is null or room.classroom_id = target_classroom_id)
    and (target_room_id is null or room.id = target_room_id)
    and public.is_eligible_for_program_chat(room.id, current_user_id)
  order by program.title, room.title;
end;
$$;

revoke all on function public.get_classroom_chat_access(uuid, uuid, uuid, uuid) from public;
grant execute on function public.get_classroom_chat_access(uuid, uuid, uuid, uuid) to authenticated;

