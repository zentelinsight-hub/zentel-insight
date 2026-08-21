-- Let every eligible cohort member join. Eligibility still requires an active
-- account plus enrolment, tutor assignment, or verified Admin access.
create or replace function public.join_programme_chat(target_room_id uuid)
returns table (
  room_id uuid,
  joined_at timestamptz,
  joined boolean,
  already_joined boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  membership public.program_chat_members;
  was_joined boolean := false;
  first_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select role into current_role from public.user_roles where user_id = current_user_id;
  if current_role not in ('student', 'tutor', 'admin') then
    raise exception 'This account cannot join cohort chat.';
  end if;
  if not public.is_account_active(current_user_id) then
    raise exception 'Your account must be active.';
  end if;
  if not public.is_eligible_for_program_chat(target_room_id, current_user_id) then
    raise exception 'This classroom is not assigned to your account.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_room_id::text || current_user_id::text, 0));

  select * into membership
  from public.program_chat_members member
  where member.room_id = target_room_id and member.user_id = current_user_id
  for update;

  was_joined := membership.id is not null and membership.active and membership.left_at is null;

  if not was_joined then
    insert into public.program_chat_members (room_id, user_id, role, active, joined_at, left_at, last_read_at)
    values (target_room_id, current_user_id, current_role, true, now(), null, now())
    on conflict (room_id, user_id) do update
    set role = excluded.role,
        active = true,
        joined_at = now(),
        left_at = null,
        last_read_at = now(),
        updated_at = now()
    returning * into membership;

    select split_part(coalesce(nullif(full_name, ''), initcap(current_role)), ' ', 1)
    into first_name
    from public.profiles
    where id = current_user_id;

    insert into public.program_chat_messages (
      room_id, sender_id, message_type, sender_role, sender_display_name, body, client_message_id
    ) values (
      target_room_id, null, 'system', 'system', 'System', coalesce(first_name, initcap(current_role)) || ' joined the chat', gen_random_uuid()
    );
  end if;

  return query
  select target_room_id, membership.joined_at, true, was_joined;
end;
$$;

revoke all on function public.join_programme_chat(uuid) from public, anon;
grant execute on function public.join_programme_chat(uuid) to authenticated;
