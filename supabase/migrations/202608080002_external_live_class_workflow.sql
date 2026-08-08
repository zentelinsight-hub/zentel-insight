-- External live-class workflow with server-side Tutor authorization.

alter table public.tutor_profiles
  add column if not exists live_class_enabled boolean not null default true;

alter table public.live_class_sessions
  add column if not exists actual_started_at timestamptz,
  add column if not exists actual_ended_at timestamptz;

create or replace function public.validate_external_live_class()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  meeting_host text;
begin
  if new.provider not in ('google_meet', 'zoom') then
    raise exception 'Choose Google Meet or Zoom as the live-class platform.';
  end if;
  if nullif(btrim(coalesce(new.provider_room_url, '')), '') is null
     or new.provider_room_url !~* '^https://[^[:space:]]+$' then
    raise exception 'A secure HTTPS meeting URL is required.';
  end if;

  meeting_host := lower(split_part(split_part(new.provider_room_url, '://', 2), '/', 1));
  if meeting_host like '%@%' or meeting_host in ('localhost', '127.0.0.1', '::1') then
    raise exception 'The meeting URL host is not permitted.';
  end if;
  if new.provider = 'google_meet' and meeting_host <> 'meet.google.com' then
    raise exception 'Google Meet classes must use a meet.google.com URL.';
  end if;
  if new.provider = 'zoom' and meeting_host <> 'zoom.us' and meeting_host not like '%.zoom.us' then
    raise exception 'Zoom classes must use an official zoom.us URL.';
  end if;
  return new;
end;
$$;

drop trigger if exists live_class_sessions_validate_external on public.live_class_sessions;
create trigger live_class_sessions_validate_external
before insert or update of provider, provider_room_url on public.live_class_sessions
for each row execute function public.validate_external_live_class();

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
  tutor_id uuid := auth.uid();
  classroom_record public.classrooms;
  saved public.live_class_sessions;
begin
  if tutor_id is null or not public.is_account_active(tutor_id) then
    raise exception 'An active Tutor account is required.';
  end if;
  if not exists (select 1 from public.user_roles where user_id = tutor_id and role = 'tutor') then
    raise exception 'Tutor access is required.';
  end if;
  if not coalesce((select live_class_enabled from public.tutor_profiles where user_id = tutor_id), false) then
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

  select c.* into classroom_record
  from public.classrooms c
  join public.tutor_classroom_assignments assignment
    on assignment.classroom_id = c.id
   and assignment.tutor_id = tutor_id
   and assignment.active
  where c.id = target_classroom_id and c.status = 'active';
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
      classroom_record.cohort_id, tutor_id, btrim(class_name), btrim(coalesce(class_instructions, '')),
      starts_at, ends_at, 'Africa/Lagos', lower(btrim(platform_name)), btrim(meeting_url),
      'scheduled', starts_at - interval '10 minutes', ends_at, tutor_id
    ) returning * into saved;
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
      and session.tutor_id = tutor_id
      and session.classroom_id = classroom_record.id
      and session.status = 'scheduled'
    returning * into saved;
    if saved.id is null then raise exception 'Only your scheduled class can be edited.'; end if;
  end if;
  return saved;
end;
$$;

create or replace function public.tutor_cancel_live_class(target_session_id uuid)
returns public.live_class_sessions
language plpgsql
security definer
set search_path = public
as $$
declare saved public.live_class_sessions;
begin
  update public.live_class_sessions
  set status = 'cancelled', join_closes_at = now()
  where id = target_session_id
    and tutor_id = auth.uid()
    and public.is_account_active(auth.uid())
    and status = 'scheduled'
  returning * into saved;
  if saved.id is null then raise exception 'Only your scheduled class can be cancelled.'; end if;
  return saved;
end;
$$;

revoke all on function public.tutor_save_live_class(uuid, uuid, text, text, text, timestamptz, timestamptz, text) from public;
grant execute on function public.tutor_save_live_class(uuid, uuid, text, text, text, timestamptz, timestamptz, text) to authenticated;
revoke all on function public.tutor_cancel_live_class(uuid) from public;
grant execute on function public.tutor_cancel_live_class(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_class_sessions'
     ) then
    alter publication supabase_realtime add table public.live_class_sessions;
  end if;
end $$;
