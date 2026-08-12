begin;

-- Resolve the Tutor RPC ambiguity by keeping the authenticated actor identifier
-- distinct from every tutor_id column used by the function.
create or replace function public.tutor_save_live_class(
  target_session_id uuid,
  target_classroom_id uuid,
  class_name text,
  platform_name text,
  meeting_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  class_instructions text default ''
)
returns public.live_class_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_tutor_id uuid := auth.uid();
  classroom_record public.classrooms;
  saved_session public.live_class_sessions;
begin
  if actor_tutor_id is null or not public.is_account_active(actor_tutor_id) then
    raise exception 'An active Tutor account is required.';
  end if;
  if not exists (
    select 1 from public.user_roles role_record
    where role_record.user_id = actor_tutor_id and role_record.role::text = 'tutor'
  ) then
    raise exception 'Tutor access is required.';
  end if;
  if not coalesce((
    select tutor_profile.live_class_enabled
    from public.tutor_profiles tutor_profile
    where tutor_profile.user_id = actor_tutor_id
  ), false) then
    raise exception 'Your live-class privilege is restricted. Contact Admin.';
  end if;
  if nullif(btrim(class_name), '') is null or char_length(btrim(class_name)) > 180 then
    raise exception 'Enter a valid class name.';
  end if;
  if starts_at is null or ends_at is null or ends_at <= starts_at then
    raise exception 'The class end time must be after its start time.';
  end if;
  if ends_at > starts_at + interval '8 hours' then
    raise exception 'A live class cannot be longer than eight hours.';
  end if;

  select classroom.* into classroom_record
  from public.classrooms classroom
  join public.tutor_classroom_assignments assignment
    on assignment.classroom_id = classroom.id
   and assignment.tutor_id = actor_tutor_id
   and assignment.active
  where classroom.id = target_classroom_id and classroom.status = 'active';
  if classroom_record.id is null then
    raise exception 'Choose an assigned active classroom.';
  end if;

  if target_session_id is null then
    insert into public.live_class_sessions (
      program_id, track_id, classroom_id, cohort_id, tutor_id, title, description,
      scheduled_start, scheduled_end, timezone, provider, provider_room_url,
      status, join_opens_at, join_closes_at, created_by
    ) values (
      classroom_record.program_id, classroom_record.track_id, classroom_record.id,
      classroom_record.cohort_id, actor_tutor_id, btrim(class_name), btrim(coalesce(class_instructions, '')),
      starts_at, ends_at, 'Africa/Lagos', lower(btrim(platform_name)), btrim(meeting_url),
      'scheduled', starts_at - interval '10 minutes', ends_at, actor_tutor_id
    ) returning * into saved_session;
  else
    update public.live_class_sessions session
    set title = btrim(class_name),
        description = btrim(coalesce(class_instructions, '')),
        scheduled_start = starts_at,
        scheduled_end = ends_at,
        provider = lower(btrim(platform_name)),
        provider_room_url = btrim(meeting_url),
        join_opens_at = starts_at - interval '10 minutes',
        join_closes_at = ends_at
    where session.id = target_session_id
      and session.tutor_id = actor_tutor_id
      and session.classroom_id = classroom_record.id
      and session.status = 'scheduled'
    returning * into saved_session;
    if saved_session.id is null then
      raise exception 'Only your scheduled class can be edited.';
    end if;
  end if;
  return saved_session;
end;
$$;

revoke all on function public.tutor_save_live_class(uuid, uuid, text, text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.tutor_save_live_class(uuid, uuid, text, text, text, timestamptz, timestamptz, text) to authenticated;

-- Chat uses its own realtime browser-notification channel. It must not create
-- records in the general portal Notifications page.
drop trigger if exists program_chat_messages_notify_members on public.program_chat_messages;
delete from public.portal_notifications where notification_type = 'classroom_message';

notify pgrst, 'reload schema';
commit;
