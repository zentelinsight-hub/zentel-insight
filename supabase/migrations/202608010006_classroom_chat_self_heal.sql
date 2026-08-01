-- Self-heal legacy enrolment-to-classroom gaps before returning Chat access.

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
volatile
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  enrolment_record public.enrolments;
  resolved_classroom_id uuid;
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

  if current_role = 'student' then
    select enrolment.*
    into enrolment_record
    from public.enrolments enrolment
    where enrolment.user_id = current_user_id and enrolment.status = 'active'
    order by enrolment.updated_at desc, enrolment.created_at desc
    limit 1;

    if enrolment_record.id is not null then
      resolved_classroom_id := enrolment_record.classroom_id;

      if resolved_classroom_id is null and enrolment_record.program_level_id is not null then
        resolved_classroom_id := public.ensure_current_classroom(
          enrolment_record.program_id,
          enrolment_record.program_level_id
        );

        update public.enrolments
        set classroom_id = resolved_classroom_id,
            cohort_id = (select classroom.cohort_id from public.classrooms classroom where classroom.id = resolved_classroom_id),
            updated_at = now()
        where id = enrolment_record.id;
      end if;

      if resolved_classroom_id is not null then
        update public.classroom_memberships membership
        set active = false,
            left_at = coalesce(membership.left_at, now()),
            updated_at = now()
        where membership.user_id = current_user_id
          and membership.member_role = 'student'
          and membership.active
          and membership.classroom_id <> resolved_classroom_id;

        insert into public.classroom_memberships (
          classroom_id,
          user_id,
          member_role,
          active,
          joined_at,
          left_at
        ) values (
          resolved_classroom_id,
          current_user_id,
          'student',
          true,
          now(),
          null
        )
        on conflict (classroom_id, user_id, member_role) do update
        set active = true,
            left_at = null,
            updated_at = now();
      end if;
    end if;

    insert into public.program_chat_members (
      room_id,
      user_id,
      role,
      joined_at,
      active,
      left_at,
      last_read_at
    )
    select
      room.id,
      current_user_id,
      'student',
      now(),
      true,
      null,
      now()
    from public.classroom_memberships membership
    join public.program_chat_rooms room on room.classroom_id = membership.classroom_id and room.active
    where membership.user_id = current_user_id
      and membership.member_role = 'student'
      and membership.active
      and membership.left_at is null
    on conflict (room_id, user_id) do update
    set role = 'student',
        active = true,
        left_at = null,
        joined_at = case
          when public.program_chat_members.active and public.program_chat_members.left_at is null
            then public.program_chat_members.joined_at
          else now()
        end,
        updated_at = now();
  elsif current_role = 'tutor' then
    insert into public.program_chat_members (room_id, user_id, role, joined_at, active, left_at)
    select room.id, current_user_id, 'tutor', coalesce(assignment.assigned_at, now()), true, null
    from public.tutor_classroom_assignments assignment
    join public.program_chat_rooms room on room.classroom_id = assignment.classroom_id and room.active
    where assignment.tutor_id = current_user_id and assignment.active
    on conflict (room_id, user_id) do update
    set role = 'tutor', active = true, left_at = null, updated_at = now();
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

create or replace function public.get_programme_chat_access(
  target_program_id uuid default null,
  target_track_id uuid default null,
  target_room_id uuid default null
)
returns table (
  id uuid,
  program_id uuid,
  track_id uuid,
  title text,
  active boolean,
  program_title text,
  joined boolean,
  joined_at timestamptz,
  member_role text,
  last_read_at timestamptz
)
language sql
volatile
security definer
set search_path = public
as $$
  select
    access.id,
    access.program_id,
    access.track_id,
    access.title,
    access.active,
    access.program_title,
    access.joined,
    access.joined_at,
    access.member_role,
    access.last_read_at
  from public.get_classroom_chat_access(target_program_id, target_track_id, null, target_room_id) access;
$$;

revoke all on function public.get_programme_chat_access(uuid, uuid, uuid) from public;
grant execute on function public.get_programme_chat_access(uuid, uuid, uuid) to authenticated;

