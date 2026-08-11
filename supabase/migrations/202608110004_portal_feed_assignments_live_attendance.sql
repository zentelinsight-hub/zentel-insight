begin;

-- The community feed is shared by active Students and Tutors. Keep the existing
-- table and RPC names for backwards compatibility with deployed clients.
drop policy if exists "Active Students can publish feed posts" on public.student_feed_posts;
drop policy if exists "Active portal members can publish feed posts" on public.student_feed_posts;
create policy "Active portal members can publish feed posts"
  on public.student_feed_posts for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'published'
    and exists (
      select 1
      from public.profiles profile
      join public.user_roles role_record on role_record.user_id = profile.id
      where profile.id = (select auth.uid())
        and profile.account_status = 'active'
        and role_record.role::text in ('student', 'tutor')
    )
  );

drop policy if exists "Active portal users can read published feed posts" on public.student_feed_posts;
create policy "Active portal users can read published feed posts"
  on public.student_feed_posts for select
  to authenticated
  using (
    status = 'published'
    and public.is_account_active((select auth.uid()))
    and exists (
      select 1
      from public.profiles author
      join public.user_roles author_role on author_role.user_id = author.id
      where author.id = student_feed_posts.user_id
        and author.account_status = 'active'
        and author_role.role::text in ('student', 'tutor')
        and btrim(coalesce(author.full_name, '')) <> ''
    )
  );

drop policy if exists "Active Students can delete their feed posts" on public.student_feed_posts;
drop policy if exists "Active portal members can delete their feed posts" on public.student_feed_posts;
create policy "Active portal members can delete their feed posts"
  on public.student_feed_posts for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role::text in ('student', 'tutor')
    )
  );

drop policy if exists "Students can upload their feed media" on storage.objects;
drop policy if exists "Portal members can upload their feed media" on storage.objects;
create policy "Portal members can upload their feed media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'student-feed-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.profiles profile
      join public.user_roles role_record on role_record.user_id = profile.id
      where profile.id = (select auth.uid())
        and profile.account_status = 'active'
        and role_record.role::text in ('student', 'tutor')
    )
  );

create or replace function public.get_student_feed_posts(
  page_size integer default 100,
  before_published_at timestamptz default null,
  before_post_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  body text,
  image_path text,
  published_at timestamptz,
  author_name text,
  author_avatar_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  safe_page_size integer := least(greatest(coalesce(page_size, 100), 1), 100);
begin
  if auth.uid() is null or not public.is_account_active(auth.uid()) then
    raise exception 'Active portal access is required.';
  end if;

  return query
  select post.id, post.user_id, post.body, post.image_path, post.created_at,
         btrim(regexp_replace(author.full_name, '\s+', ' ', 'g')), author.avatar_path
  from public.student_feed_posts post
  join public.profiles author
    on author.id = post.user_id
   and author.account_status = 'active'
   and btrim(coalesce(author.full_name, '')) <> ''
  join public.user_roles author_role
    on author_role.user_id = author.id
   and author_role.role::text in ('student', 'tutor')
  where post.status = 'published'
    and (
      before_published_at is null
      or post.created_at < before_published_at
      or (post.created_at = before_published_at and before_post_id is not null and post.id < before_post_id)
    )
  order by post.created_at desc, post.id desc
  limit safe_page_size;
end;
$$;

create or replace function public.admin_list_student_feed_posts(page_size integer default 100)
returns table (
  id uuid,
  user_id uuid,
  body text,
  image_path text,
  status text,
  published_at timestamptz,
  author_name text,
  author_avatar_path text,
  author_account_status text
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
  select post.id, post.user_id, post.body, post.image_path, post.status, post.created_at,
         btrim(regexp_replace(author.full_name, '\s+', ' ', 'g')), author.avatar_path, author.account_status
  from public.student_feed_posts post
  join public.profiles author on author.id = post.user_id
  join public.user_roles author_role
    on author_role.user_id = author.id and author_role.role::text in ('student', 'tutor')
  order by post.created_at desc, post.id desc
  limit least(greatest(coalesce(page_size, 100), 1), 200);
end;
$$;

create or replace function public.signal_student_feed_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare target_user_id uuid;
begin
  target_user_id := case when tg_op = 'DELETE' then old.id else new.id end;
  if tg_table_name = 'profiles' and not exists (
    select 1 from public.user_roles
    where user_id = target_user_id and role::text in ('student', 'tutor')
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  insert into public.student_feed_refresh_events default values;
  delete from public.student_feed_refresh_events where created_at < now() - interval '7 days';
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Approved external classroom providers. Students never receive an editable URL;
-- they only receive the server-authorized Join Class action.
create or replace function public.validate_external_live_class()
returns trigger
language plpgsql
set search_path = public
as $$
declare meeting_host text;
begin
  if new.provider not in ('google_meet', 'zoom', 'youtube') then
    raise exception 'Choose Google Meet, Zoom or YouTube as the live-class platform.';
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
  if new.provider = 'youtube' and meeting_host not in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com') then
    raise exception 'YouTube classes must use an official youtube.com or youtu.be URL.';
  end if;
  return new;
end;
$$;

create unique index if not exists attendance_sessions_live_class_uidx
  on public.attendance_sessions(live_class_session_id)
  where live_class_session_id is not null;

create or replace function public.sync_live_class_attendance_to_academy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class_record public.live_class_sessions;
  academic_session_id uuid;
  academic_status text;
  attended_seconds numeric;
  scheduled_seconds numeric;
begin
  select * into class_record from public.live_class_sessions where id = new.class_session_id;
  if class_record.id is null or class_record.classroom_id is null or not exists (
    select 1 from public.classroom_memberships membership
    where membership.classroom_id = class_record.classroom_id
      and membership.user_id = new.user_id
      and membership.member_role = 'student'
      and membership.active
      and membership.left_at is null
  ) then
    return new;
  end if;

  insert into public.attendance_sessions (
    classroom_id, live_class_session_id, title, session_date, scheduled_start,
    scheduled_end, status, source, created_by
  ) values (
    class_record.classroom_id, class_record.id, class_record.title,
    (class_record.scheduled_start at time zone coalesce(class_record.timezone, 'Africa/Lagos'))::date,
    class_record.scheduled_start, class_record.scheduled_end,
    case when class_record.status = 'completed' then 'completed' else 'scheduled' end,
    'live_class', class_record.tutor_id
  )
  on conflict (live_class_session_id) where live_class_session_id is not null do update
  set title = excluded.title,
      scheduled_start = excluded.scheduled_start,
      scheduled_end = excluded.scheduled_end,
      status = excluded.status,
      updated_at = now()
  returning id into academic_session_id;

  scheduled_seconds := greatest(extract(epoch from (class_record.scheduled_end - class_record.scheduled_start)), 1);
  attended_seconds := greatest(extract(epoch from (coalesce(new.left_at, now()) - new.joined_at)), 0);
  academic_status := case
    when new.attendance_status = 'missed' then 'absent'
    when new.left_at is not null and attended_seconds < scheduled_seconds * 0.5 then 'partially_attended'
    when new.joined_at > class_record.scheduled_start + interval '15 minutes' then 'late'
    else 'present'
  end;

  insert into public.attendance_records (
    attendance_session_id, classroom_id, user_id, status, joined_at, left_at, marked_by
  ) values (
    academic_session_id, class_record.classroom_id, new.user_id, academic_status,
    new.joined_at, new.left_at, class_record.tutor_id
  )
  on conflict (attendance_session_id, user_id) do update
  set status = excluded.status,
      joined_at = excluded.joined_at,
      left_at = excluded.left_at,
      marked_by = excluded.marked_by,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists live_class_attendance_sync_academy on public.live_class_attendance;
create trigger live_class_attendance_sync_academy
  after insert or update of joined_at, left_at, attendance_status on public.live_class_attendance
  for each row execute function public.sync_live_class_attendance_to_academy();

create or replace function public.finalize_live_class_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare academic_session_id uuid;
begin
  if new.classroom_id is null then return new; end if;

  insert into public.attendance_sessions (
    classroom_id, live_class_session_id, title, session_date, scheduled_start,
    scheduled_end, status, source, created_by
  ) values (
    new.classroom_id, new.id, new.title,
    (new.scheduled_start at time zone coalesce(new.timezone, 'Africa/Lagos'))::date,
    new.scheduled_start, new.scheduled_end, 'completed', 'live_class', new.tutor_id
  )
  on conflict (live_class_session_id) where live_class_session_id is not null do update
  set status = 'completed', updated_at = now()
  returning id into academic_session_id;

  insert into public.attendance_records (
    attendance_session_id, classroom_id, user_id, status, marked_by
  )
  select academic_session_id, new.classroom_id, membership.user_id, 'absent', new.tutor_id
  from public.classroom_memberships membership
  where membership.classroom_id = new.classroom_id
    and membership.member_role = 'student'
    and membership.active
    and membership.left_at is null
  on conflict (attendance_session_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists live_class_sessions_finalize_academy_attendance on public.live_class_sessions;
create trigger live_class_sessions_finalize_academy_attendance
  after update of status on public.live_class_sessions
  for each row
  when (new.status = 'completed' and old.status is distinct from new.status)
  execute function public.finalize_live_class_attendance();

create or replace function public.notify_live_class_students()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare notification_title text; notification_message text;
begin
  if new.classroom_id is null then return new; end if;
  if tg_op = 'INSERT' then
    notification_title := 'Live class scheduled';
    notification_message := new.title || ' has been scheduled.';
  elsif new.status = 'live' and old.status is distinct from new.status then
    notification_title := 'Live class started';
    notification_message := new.title || ' is now live. Tap Join Class to attend.';
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    notification_title := 'Live class cancelled';
    notification_message := new.title || ' has been cancelled.';
  else
    return new;
  end if;

  insert into public.portal_notifications (user_id, title, message, notification_type, link_path)
  select membership.user_id, notification_title, notification_message,
         case when new.status = 'live' then 'live_class_started' else 'live_class_update' end,
         '/portal/live-classes'
  from public.classroom_memberships membership
  join public.profiles profile on profile.id = membership.user_id and profile.account_status = 'active'
  where membership.classroom_id = new.classroom_id
    and membership.member_role = 'student'
    and membership.active
    and membership.left_at is null;
  return new;
end;
$$;

drop trigger if exists live_class_sessions_notify_students on public.live_class_sessions;
create trigger live_class_sessions_notify_students
  after insert or update of status on public.live_class_sessions
  for each row execute function public.notify_live_class_students();

notify pgrst, 'reload schema';
commit;
