create or replace function public.is_verified_admin_session()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p
      on p.id = ur.user_id
     and p.account_status = 'active'
    join public.admin_session_verifications asv
      on asv.user_id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and asv.session_id = public.current_session_id()
      and asv.expires_at > now()
  );
$$;

with duplicate_active_assignments as (
  select
    id,
    row_number() over (
      partition by tutor_id, program_id, coalesce(track_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by updated_at desc, created_at desc, id desc
    ) as active_rank
  from public.tutor_program_assignments
  where active = true
)
update public.tutor_program_assignments tpa
set active = false,
    updated_at = now()
from duplicate_active_assignments duplicate
where duplicate.id = tpa.id
  and duplicate.active_rank > 1;

create unique index if not exists tutor_program_assignments_one_active_track_idx
  on public.tutor_program_assignments(
    tutor_id,
    program_id,
    coalesce(track_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where active = true;

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
  target_role text;
  selected_program public.programs;
  selected_track public.program_levels;
  saved_assignment public.tutor_program_assignments;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if target_tutor_id is null or target_program_id is null then
    raise exception 'Tutor and programme are required.';
  end if;

  select coalesce((select role from public.user_roles where user_id = target_tutor_id), 'student')
  into target_role;

  if target_role <> 'tutor' then
    raise exception 'Only Tutor accounts can receive Tutor programme assignments.';
  end if;

  select * into selected_program
  from public.programs
  where id = target_program_id
    and active = true;

  if selected_program.id is null then
    raise exception 'Programme was not found or is not active.';
  end if;

  if target_track_id is not null then
    select * into selected_track
    from public.program_levels
    where id = target_track_id
      and program_id = target_program_id
      and active = true;

    if selected_track.id is null then
      raise exception 'Track was not found for the selected programme.';
    end if;
  end if;

  insert into public.tutor_program_assignments (
    tutor_id,
    program_id,
    track_id,
    assigned_by,
    active
  )
  values (
    target_tutor_id,
    target_program_id,
    target_track_id,
    auth.uid(),
    assignment_active
  )
  on conflict (
    tutor_id,
    program_id,
    (coalesce(track_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where active = true
  do update set
    assigned_by = excluded.assigned_by,
    active = excluded.active,
    updated_at = now()
  returning * into saved_assignment;

  insert into public.audit_logs (
    actor_user_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    'tutor_programme_assigned',
    'tutor_program_assignments',
    saved_assignment.id,
    jsonb_build_object(
      'tutor_id', target_tutor_id,
      'program_id', target_program_id,
      'program_title', selected_program.title,
      'track_id', target_track_id,
      'track_name', selected_track.level_name,
      'active', assignment_active
    )
  );

  return saved_assignment;
end;
$$;

revoke all on function public.admin_assign_tutor_programme(uuid, uuid, uuid, boolean) from public;
grant execute on function public.admin_assign_tutor_programme(uuid, uuid, uuid, boolean) to authenticated;

create or replace function public.admin_search_tutors(
  search_text text default '',
  tutor_filter text default 'all',
  page_limit integer default 25,
  page_offset integer default 0
)
returns table (
  user_id uuid,
  title text,
  full_name text,
  email text,
  phone text,
  avatar_path text,
  account_status text,
  status_changed_at timestamptz,
  status_changed_by uuid,
  status_reason text,
  specialisation text,
  professional_bio text,
  qualifications text,
  teaching_experience text,
  availability text,
  profile_completion integer,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  assignment_id uuid,
  program_id uuid,
  track_id uuid,
  program_title text,
  track_name text,
  assignment_count integer,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_search text := lower(btrim(coalesce(search_text, '')));
  clean_filter text := lower(btrim(coalesce(tutor_filter, 'all')));
  safe_limit integer := least(greatest(coalesce(page_limit, 25), 1), 50);
  safe_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if clean_filter not in ('all', 'active', 'inactive', 'assigned', 'unassigned') then
    raise exception 'Tutor filter must be all, active, inactive, assigned or unassigned.';
  end if;

  return query
  with active_assignment as (
    select distinct on (tpa.tutor_id)
      tpa.id,
      tpa.tutor_id,
      tpa.program_id,
      tpa.track_id,
      p.title as program_title,
      pl.level_name as track_name
    from public.tutor_program_assignments tpa
    join public.programs p on p.id = tpa.program_id
    left join public.program_levels pl on pl.id = tpa.track_id
    where tpa.active = true
    order by tpa.tutor_id, tpa.updated_at desc, tpa.created_at desc
  ),
  assignment_counts as (
    select tutor_id, count(*)::integer as assignment_count
    from public.tutor_program_assignments
    where active = true
    group by tutor_id
  ),
  candidates as (
    select
      pr.id as user_id,
      coalesce(tp.title, pr.title, 'Mr') as title,
      pr.full_name,
      pr.email,
      pr.phone,
      pr.avatar_path,
      pr.account_status,
      pr.status_changed_at,
      pr.status_changed_by,
      pr.status_reason,
      coalesce(tp.specialisation, '') as specialisation,
      coalesce(tp.professional_bio, '') as professional_bio,
      coalesce(tp.qualifications, '') as qualifications,
      coalesce(tp.teaching_experience, '') as teaching_experience,
      coalesce(tp.availability, '') as availability,
      pr.profile_completion,
      pr.created_at,
      au.last_sign_in_at,
      aa.id as assignment_id,
      aa.program_id,
      aa.track_id,
      aa.program_title,
      aa.track_name,
      coalesce(ac.assignment_count, 0) as assignment_count
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id
    left join auth.users au on au.id = ur.user_id
    left join public.tutor_profiles tp on tp.user_id = ur.user_id
    left join active_assignment aa on aa.tutor_id = ur.user_id
    left join assignment_counts ac on ac.tutor_id = ur.user_id
    where ur.role = 'tutor'
      and (
        clean_filter = 'all'
        or (clean_filter = 'active' and pr.account_status = 'active')
        or (clean_filter = 'inactive' and pr.account_status = 'inactive')
        or (clean_filter = 'assigned' and coalesce(ac.assignment_count, 0) > 0)
        or (clean_filter = 'unassigned' and coalesce(ac.assignment_count, 0) = 0)
      )
      and (
        clean_search = ''
        or lower(coalesce(pr.full_name, '')) like '%' || clean_search || '%'
        or lower(coalesce(pr.email, '')) like '%' || clean_search || '%'
        or lower(coalesce(pr.phone, '')) like '%' || clean_search || '%'
        or lower(coalesce(pr.account_status, '')) like '%' || clean_search || '%'
        or lower(coalesce(tp.specialisation, '')) like '%' || clean_search || '%'
        or lower(coalesce(aa.program_title, '')) like '%' || clean_search || '%'
        or lower(coalesce(aa.track_name, '')) like '%' || clean_search || '%'
      )
  )
  select
    candidates.user_id,
    candidates.title,
    candidates.full_name,
    candidates.email,
    candidates.phone,
    candidates.avatar_path,
    candidates.account_status,
    candidates.status_changed_at,
    candidates.status_changed_by,
    candidates.status_reason,
    candidates.specialisation,
    candidates.professional_bio,
    candidates.qualifications,
    candidates.teaching_experience,
    candidates.availability,
    candidates.profile_completion,
    candidates.created_at,
    candidates.last_sign_in_at,
    candidates.assignment_id,
    candidates.program_id,
    candidates.track_id,
    candidates.program_title,
    candidates.track_name,
    candidates.assignment_count,
    count(*) over() as total_count
  from candidates
  order by lower(coalesce(nullif(candidates.full_name, ''), candidates.email, '')), candidates.created_at desc
  limit safe_limit
  offset safe_offset;
end;
$$;

revoke all on function public.admin_search_tutors(text, text, integer, integer) from public;
grant execute on function public.admin_search_tutors(text, text, integer, integer) to authenticated;

create or replace function public.admin_update_tutor_profile(
  target_tutor_id uuid,
  next_title text default 'Mr',
  next_full_name text default '',
  next_phone text default '',
  next_specialisation text default '',
  next_professional_bio text default '',
  next_qualifications text default '',
  next_teaching_experience text default '',
  next_availability text default '',
  next_account_status text default null,
  next_status_reason text default null,
  next_program_id uuid default null,
  next_track_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_title text := btrim(coalesce(next_title, ''));
  clean_status text := nullif(lower(btrim(coalesce(next_account_status, ''))), '');
  target_role text;
  previous_profile public.profiles;
  updated_profile public.profiles;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if clean_title not in ('Mr', 'Mrs') then
    raise exception 'Tutor title must be Mr or Mrs.';
  end if;

  if clean_status is not null and clean_status not in ('active', 'inactive') then
    raise exception 'Account status must be active or inactive.';
  end if;

  select * into previous_profile
  from public.profiles
  where id = target_tutor_id;

  if previous_profile.id is null then
    raise exception 'Tutor profile was not found.';
  end if;

  select coalesce((select role from public.user_roles where user_id = target_tutor_id), 'student')
  into target_role;

  if target_role <> 'tutor' then
    raise exception 'Only Tutor records can be changed with this action.';
  end if;

  update public.profiles
  set
    title = clean_title,
    full_name = btrim(coalesce(next_full_name, '')),
    phone = btrim(coalesce(next_phone, '')),
    account_status = coalesce(clean_status, account_status),
    status_reason = case
      when clean_status is not null and clean_status is distinct from account_status
        then nullif(btrim(coalesce(next_status_reason, '')), '')
      else status_reason
    end,
    profile_completion = least(
      100,
      (
        (case when btrim(coalesce(next_full_name, '')) <> '' then 1 else 0 end) +
        (case when email <> '' then 1 else 0 end) +
        (case when btrim(coalesce(next_phone, '')) <> '' then 1 else 0 end) +
        (case when avatar_path is not null and avatar_path <> '' then 1 else 0 end)
      ) * 100 / 4
    )
  where id = target_tutor_id
  returning * into updated_profile;

  insert into public.tutor_profiles (
    user_id,
    title,
    specialisation,
    professional_bio,
    qualifications,
    teaching_experience,
    availability
  )
  values (
    target_tutor_id,
    clean_title,
    btrim(coalesce(next_specialisation, '')),
    btrim(coalesce(next_professional_bio, '')),
    btrim(coalesce(next_qualifications, '')),
    btrim(coalesce(next_teaching_experience, '')),
    btrim(coalesce(next_availability, ''))
  )
  on conflict (user_id) do update set
    title = excluded.title,
    specialisation = excluded.specialisation,
    professional_bio = excluded.professional_bio,
    qualifications = excluded.qualifications,
    teaching_experience = excluded.teaching_experience,
    availability = excluded.availability,
    updated_at = now();

  if next_program_id is not null then
    perform public.admin_assign_tutor_programme(target_tutor_id, next_program_id, next_track_id, true);
  end if;

  insert into public.audit_logs (
    actor_user_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    'tutor_profile_updated',
    'profiles',
    target_tutor_id,
    jsonb_build_object(
      'previous_status', previous_profile.account_status,
      'next_status', updated_profile.account_status,
      'program_id', next_program_id,
      'track_id', next_track_id
    )
  );

  return updated_profile;
end;
$$;

revoke all on function public.admin_update_tutor_profile(uuid, text, text, text, text, text, text, text, text, text, text, uuid, uuid) from public;
grant execute on function public.admin_update_tutor_profile(uuid, text, text, text, text, text, text, text, text, text, text, uuid, uuid) to authenticated;

alter table public.program_chat_messages drop constraint if exists program_chat_messages_message_type_check;
alter table public.program_chat_messages
  add constraint program_chat_messages_message_type_check
  check (message_type in ('text', 'image', 'system'));

alter table public.program_chat_messages add column if not exists sender_role text;
alter table public.program_chat_messages drop constraint if exists program_chat_messages_sender_role_check;
alter table public.program_chat_messages
  add constraint program_chat_messages_sender_role_check
  check (sender_role is null or sender_role in ('admin', 'tutor', 'student'));

update public.program_chat_messages pcm
set sender_role = coalesce(ur.role, 'student')
from public.user_roles ur
where ur.user_id = pcm.sender_id
  and pcm.sender_role is null;

create or replace function public.set_program_chat_message_sender_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_role is null then
    select coalesce((select role from public.user_roles where user_id = new.sender_id), 'student')
    into new.sender_role;
  end if;

  return new;
end;
$$;

drop trigger if exists program_chat_messages_sender_role on public.program_chat_messages;
create trigger program_chat_messages_sender_role
  before insert on public.program_chat_messages
  for each row execute procedure public.set_program_chat_message_sender_role();

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.program_chat_messages(id) on delete cascade,
  bucket_id text not null default 'classroom-media',
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id, storage_path)
);

alter table public.message_attachments enable row level security;

drop policy if exists "Authorized users can read message attachments" on public.message_attachments;
create policy "Authorized users can read message attachments"
  on public.message_attachments for select
  to authenticated
  using (
    exists (
      select 1
      from public.program_chat_messages pcm
      where pcm.id = message_attachments.message_id
        and public.can_access_program_chat(pcm.room_id)
    )
  );

drop policy if exists "Authorized users can create message attachments" on public.message_attachments;
create policy "Authorized users can create message attachments"
  on public.message_attachments for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.program_chat_messages pcm
      where pcm.id = message_attachments.message_id
        and pcm.sender_id = (select auth.uid())
        and public.can_access_program_chat(pcm.room_id)
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('classroom-media', 'classroom-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Authorized users can upload classroom media" on storage.objects;
create policy "Authorized users can upload classroom media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'classroom-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.can_access_program_chat(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Authorized users can read classroom media" on storage.objects;
create policy "Authorized users can read classroom media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'classroom-media'
    and public.can_access_program_chat(((storage.foldername(name))[1])::uuid)
  );

create index if not exists user_roles_role_user_idx on public.user_roles(role, user_id);
create index if not exists profiles_account_status_role_lookup_idx on public.profiles(account_status, id);
create index if not exists tutor_profiles_specialisation_idx on public.tutor_profiles using gin (to_tsvector('simple', coalesce(specialisation, '')));
create index if not exists program_chat_messages_sender_idx on public.program_chat_messages(sender_id, created_at desc);
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);
create index if not exists live_class_sessions_status_time_idx on public.live_class_sessions(status, scheduled_start);

create or replace function public.get_resolved_student_classroom()
returns table (
  source text,
  is_verified_enrolment boolean,
  program_id uuid,
  track_id uuid,
  program_title text,
  track_name text,
  tutor_id uuid,
  tutor_title text,
  tutor_first_name text,
  tutor_specialisation text,
  tutor_availability text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
begin
  if active_user_id is null or not public.is_account_active(active_user_id) then
    return;
  end if;

  return query
  with resolved as (
    select
      'official'::text as source,
      true as is_verified_enrolment,
      e.program_id,
      e.program_level_id as track_id
    from public.enrolments e
    where e.user_id = active_user_id
      and e.status = 'active'
    order by e.updated_at desc, e.created_at desc
    limit 1
  ),
  preference as (
    select
      'self_selected'::text as source,
      false as is_verified_enrolment,
      spp.program_id,
      spp.track_id
    from public.student_program_preferences spp
    where spp.user_id = active_user_id
      and not exists (select 1 from resolved)
    limit 1
  ),
  chosen as (
    select * from resolved
    union all
    select * from preference
    limit 1
  ),
  tutor as (
    select distinct on (tpa.program_id)
      tpa.tutor_id,
      tpa.program_id,
      tpa.track_id,
      pr.title,
      pr.full_name,
      tp.specialisation,
      tp.availability
    from public.tutor_program_assignments tpa
    join public.profiles pr on pr.id = tpa.tutor_id and pr.account_status = 'active'
    left join public.tutor_profiles tp on tp.user_id = tpa.tutor_id
    join chosen c on c.program_id = tpa.program_id
    where tpa.active = true
      and (tpa.track_id is null or c.track_id is null or tpa.track_id = c.track_id)
    order by tpa.program_id, case when tpa.track_id = (select track_id from chosen) then 0 else 1 end, tpa.updated_at desc
  )
  select
    c.source,
    c.is_verified_enrolment,
    c.program_id,
    c.track_id,
    p.title as program_title,
    pl.level_name as track_name,
    tutor.tutor_id,
    tutor.title as tutor_title,
    coalesce(nullif(split_part(btrim(tutor.full_name), ' ', 1), ''), 'Tutor') as tutor_first_name,
    coalesce(tutor.specialisation, '') as tutor_specialisation,
    coalesce(tutor.availability, '') as tutor_availability
  from chosen c
  join public.programs p on p.id = c.program_id
  left join public.program_levels pl on pl.id = c.track_id
  left join tutor on tutor.program_id = c.program_id;
end;
$$;

revoke all on function public.get_resolved_student_classroom() from public;
grant execute on function public.get_resolved_student_classroom() to authenticated;
