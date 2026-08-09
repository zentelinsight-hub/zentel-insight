-- Account status changes synchronize legacy programme chat membership. Programme
-- rooms now use a partial unique index, so the upsert must target that identity.

create or replace function public.sync_program_chat_memberships(target_program_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_program public.programs;
  target_room_id uuid;
begin
  if target_program_id is null then
    raise exception 'Programme is required.';
  end if;

  select * into selected_program
  from public.programs
  where id = target_program_id and active = true;

  if selected_program.id is null then
    raise exception 'Programme was not found or is not active.';
  end if;

  insert into public.program_chat_rooms (program_id, classroom_id, title, active)
  values (selected_program.id, null, selected_program.title || ' Classroom', true)
  on conflict (program_id) where classroom_id is null do update
  set title = excluded.title,
      active = true,
      updated_at = now()
  returning id into target_room_id;

  with authorized_staff as (
    select role_record.user_id, 'admin'::text as role
    from public.user_roles role_record
    join public.profiles profile
      on profile.id = role_record.user_id
     and profile.account_status = 'active'
    where role_record.role = 'admin'
    union
    select role_record.user_id, 'tutor'::text as role
    from public.user_roles role_record
    join public.profiles profile
      on profile.id = role_record.user_id
     and profile.account_status = 'active'
    join public.tutor_program_assignments assignment
      on assignment.tutor_id = role_record.user_id
     and assignment.program_id = target_program_id
     and assignment.active = true
    where role_record.role = 'tutor'
  )
  insert into public.program_chat_members (room_id, user_id, role, active, joined_at, left_at)
  select target_room_id, user_id, role, true, now(), null
  from authorized_staff
  on conflict (room_id, user_id) do update
  set role = excluded.role,
      active = true,
      left_at = null,
      updated_at = now();

  update public.program_chat_members member
  set active = false,
      left_at = coalesce(member.left_at, now()),
      updated_at = now()
  where member.room_id = target_room_id
    and member.active = true
    and not public.is_eligible_for_program_chat(target_room_id, member.user_id);

  return target_room_id;
end;
$$;

notify pgrst, 'reload schema';
