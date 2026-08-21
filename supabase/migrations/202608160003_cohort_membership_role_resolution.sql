-- Cohort membership is authoritative even when a legacy Student has no
-- normalized user_roles row.
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
    join public.profiles profile on profile.id = target_user_id and profile.account_status = 'active'
    where room.id = target_room_id and room.active
      and (
        (target_user_id = auth.uid() and public.is_verified_admin_session())
        or (room.classroom_id is not null and public.is_tutor_for_classroom(room.classroom_id, target_user_id))
        or (room.classroom_id is not null and public.is_student_in_classroom(room.classroom_id, target_user_id))
        or (room.classroom_id is null and target_user_id = auth.uid() and public.is_tutor_for_program(room.program_id, room.track_id))
        or (room.classroom_id is null and target_user_id = auth.uid() and public.has_active_student_program(room.program_id, room.track_id))
      )
  );
$$;

revoke all on function public.is_eligible_for_program_chat(uuid, uuid) from public, anon;

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

  select * into room_record from public.program_chat_rooms where id = target_room_id and active;
  if room_record.id is null then raise exception 'This cohort chat is not available.'; end if;

  if public.is_verified_admin_session() then
    resolved_role := 'admin';
  elsif room_record.classroom_id is not null and public.is_tutor_for_classroom(room_record.classroom_id, current_user_id) then
    resolved_role := 'tutor';
  elsif room_record.classroom_id is not null and public.is_student_in_classroom(room_record.classroom_id, current_user_id) then
    resolved_role := 'student';
  elsif room_record.classroom_id is null and public.is_tutor_for_program(room_record.program_id, room_record.track_id) then
    resolved_role := 'tutor';
  elsif room_record.classroom_id is null and public.has_active_student_program(room_record.program_id, room_record.track_id) then
    resolved_role := 'student';
  end if;

  if resolved_role is null then raise exception 'This classroom is not assigned to your account.'; end if;
  if not public.is_account_active(current_user_id) then raise exception 'Your account must be active.'; end if;
  if not public.is_eligible_for_program_chat(target_room_id, current_user_id) then raise exception 'This classroom is not assigned to your account.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_room_id::text || current_user_id::text, 0));
  select * into membership from public.program_chat_members member
  where member.room_id = target_room_id and member.user_id = current_user_id for update;
  was_joined := membership.id is not null and membership.active and membership.left_at is null;

  if not was_joined then
    insert into public.program_chat_members (room_id, user_id, role, active, joined_at, left_at, last_read_at)
    values (target_room_id, current_user_id, resolved_role, true, now(), null, now())
    on conflict (room_id, user_id) do update
    set role = excluded.role, active = true, joined_at = now(), left_at = null,
        last_read_at = now(), updated_at = now()
    returning * into membership;

    select split_part(coalesce(nullif(full_name, ''), initcap(resolved_role)), ' ', 1)
      into first_name from public.profiles where id = current_user_id;
    insert into public.program_chat_messages
      (room_id, sender_id, message_type, sender_role, sender_display_name, body, client_message_id)
    values
      (target_room_id, null, 'system', 'system', 'System', coalesce(first_name, initcap(resolved_role)) || ' joined the chat', gen_random_uuid());
  end if;

  return query select target_room_id, membership.joined_at, true, was_joined;
end;
$$;

revoke all on function public.join_programme_chat(uuid) from public, anon;
grant execute on function public.join_programme_chat(uuid) to authenticated;
