-- Backfill Chat memberships once, then keep the read path free of mutations.

insert into public.classroom_memberships (classroom_id, user_id, member_role, active, joined_at, left_at)
select enrolment.classroom_id, enrolment.user_id, 'student', true, now(), null
from public.enrolments enrolment
where enrolment.status = 'active'
  and enrolment.user_id is not null
  and enrolment.classroom_id is not null
on conflict (classroom_id, user_id, member_role) do update
set active = true, left_at = null, updated_at = now();

insert into public.program_chat_members (room_id, user_id, role, joined_at, active, left_at, last_read_at)
select room.id, membership.user_id, membership.member_role, now(), true, null, now()
from public.classroom_memberships membership
join public.program_chat_rooms room on room.classroom_id = membership.classroom_id and room.active
where membership.active and membership.left_at is null
  and membership.member_role in ('student', 'tutor')
on conflict (room_id, user_id) do update
set role = excluded.role, active = true, left_at = null, updated_at = now();

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
language sql
stable
security definer
set search_path = public
as $$
  select room.id, room.program_id, room.track_id, room.cohort_id, room.classroom_id,
    room.title, room.active, program.title,
    coalesce(member.active and member.left_at is null, false),
    member.joined_at, member.role, member.last_read_at
  from public.program_chat_rooms room
  join public.programs program on program.id = room.program_id
  join public.profiles profile on profile.id = auth.uid() and profile.account_status = 'active'
  join public.user_roles role_record on role_record.user_id = auth.uid()
  left join public.program_chat_members member on member.room_id = room.id and member.user_id = auth.uid()
  where room.active and room.classroom_id is not null
    and (target_program_id is null or room.program_id = target_program_id)
    and (target_track_id is null or room.track_id = target_track_id)
    and (target_classroom_id is null or room.classroom_id = target_classroom_id)
    and (target_room_id is null or room.id = target_room_id)
    and (
      (role_record.role = 'student' and exists (
        select 1 from public.classroom_memberships membership
        where membership.classroom_id = room.classroom_id and membership.user_id = auth.uid()
          and membership.member_role = 'student' and membership.active and membership.left_at is null
      ))
      or (role_record.role = 'tutor' and exists (
        select 1 from public.tutor_classroom_assignments assignment
        where assignment.classroom_id = room.classroom_id and assignment.tutor_id = auth.uid() and assignment.active
      ))
      or (role_record.role = 'admin' and public.is_verified_admin_session())
    )
  order by program.title, room.title;
$$;

revoke all on function public.get_classroom_chat_access(uuid, uuid, uuid, uuid) from public;
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

revoke all on function public.get_programme_chat_access(uuid, uuid, uuid) from public;
grant execute on function public.get_programme_chat_access(uuid, uuid, uuid) to authenticated;
