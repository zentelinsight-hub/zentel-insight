create extension if not exists "pgcrypto";

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  completion integer;
  trusted_role text := 'student';
  trusted_status text := 'inactive';
  trusted_reason text := 'New account pending Admin activation';
  trusted_title text := null;
begin
  if coalesce(new.raw_app_meta_data ->> 'zentel_role', '') = 'tutor'
    and coalesce(new.raw_app_meta_data ->> 'zentel_provisioned_by', '') = 'admin' then
    trusted_role := 'tutor';
    trusted_status := 'inactive';
    trusted_reason := 'New tutor account pending Admin activation';
    trusted_title := case
      when new.raw_user_meta_data ->> 'title' in ('Mr', 'Mrs') then new.raw_user_meta_data ->> 'title'
      else 'Mr'
    end;
  elsif lower(coalesce(new.email, '')) = 'zentelinsight@gmail.com' then
    trusted_role := 'admin';
    trusted_status := 'active';
    trusted_reason := 'Admin account exemption';
  end if;

  completion := (
    (case when nullif(new.raw_user_meta_data ->> 'full_name', '') is not null then 1 else 0 end) +
    (case when nullif(new.email, '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'phone', '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'date_of_birth', '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'education_level', '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'address', '') is not null then 1 else 0 end)
  ) * 100 / 6;

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    title,
    date_of_birth,
    education_level,
    address,
    profile_completed,
    profile_completion,
    account_status,
    status_changed_at,
    status_reason
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    trusted_title,
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    coalesce(new.raw_user_meta_data ->> 'education_level', ''),
    coalesce(new.raw_user_meta_data ->> 'address', ''),
    completion >= 80,
    completion,
    trusted_status,
    now(),
    trusted_reason
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    phone = coalesce(nullif(public.profiles.phone, ''), excluded.phone),
    title = coalesce(public.profiles.title, excluded.title),
    date_of_birth = coalesce(public.profiles.date_of_birth, excluded.date_of_birth),
    education_level = coalesce(nullif(public.profiles.education_level, ''), excluded.education_level),
    address = coalesce(nullif(public.profiles.address, ''), excluded.address),
    profile_completion = greatest(public.profiles.profile_completion, excluded.profile_completion),
    updated_at = now();

  insert into public.user_roles (user_id, role)
  values (new.id, trusted_role)
  on conflict (user_id) do update
  set
    role = case
      when public.user_roles.role = 'admin' then 'admin'
      when excluded.role in ('admin', 'tutor') then excluded.role
      else public.user_roles.role
    end,
    updated_at = now();

  return new;
end;
$$;

with tutor_like_users as (
  select user_id from public.tutor_profiles
  union
  select tutor_id from public.tutor_program_assignments
  union
  select id
  from auth.users
  where coalesce(raw_app_meta_data ->> 'zentel_role', '') = 'tutor'
    and coalesce(raw_app_meta_data ->> 'zentel_provisioned_by', '') = 'admin'
)
insert into public.user_roles (user_id, role)
select user_id, 'tutor'
from tutor_like_users
where not exists (
  select 1 from public.user_roles where public.user_roles.user_id = tutor_like_users.user_id
)
on conflict (user_id) do nothing;

with tutor_like_users as (
  select user_id from public.tutor_profiles
  union
  select tutor_id from public.tutor_program_assignments
  union
  select id
  from auth.users
  where coalesce(raw_app_meta_data ->> 'zentel_role', '') = 'tutor'
    and coalesce(raw_app_meta_data ->> 'zentel_provisioned_by', '') = 'admin'
)
update public.user_roles ur
set role = 'tutor',
    updated_at = now()
from tutor_like_users tutor_like
where ur.user_id = tutor_like.user_id
  and ur.role <> 'admin'
  and ur.role <> 'tutor';

insert into public.tutor_profiles (user_id, title, specialisation)
select
  ur.user_id,
  coalesce(nullif(p.title, ''), 'Mr'),
  ''
from public.user_roles ur
join public.profiles p on p.id = ur.user_id
where ur.role = 'tutor'
  and not exists (
    select 1 from public.tutor_profiles tp where tp.user_id = ur.user_id
  )
on conflict (user_id) do nothing;

create or replace function public.prevent_student_role_for_tutor_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'student'
    and (
      exists (select 1 from public.tutor_profiles where user_id = new.user_id)
      or exists (select 1 from public.tutor_program_assignments where tutor_id = new.user_id)
    ) then
    raise exception 'Tutor accounts cannot be assigned the Student role.';
  end if;

  return new;
end;
$$;

drop trigger if exists user_roles_prevent_tutor_student_conflict on public.user_roles;
create trigger user_roles_prevent_tutor_student_conflict
  before insert or update of role on public.user_roles
  for each row execute procedure public.prevent_student_role_for_tutor_account();

create or replace function public.require_tutor_role_for_tutor_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = new.user_id
      and role = 'tutor'
  ) then
    raise exception 'Tutor profile records require the Tutor role.';
  end if;

  return new;
end;
$$;

drop trigger if exists tutor_profiles_require_tutor_role on public.tutor_profiles;
create trigger tutor_profiles_require_tutor_role
  before insert or update of user_id on public.tutor_profiles
  for each row execute procedure public.require_tutor_role_for_tutor_profile();

create or replace function public.require_tutor_role_for_tutor_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = new.tutor_id
      and role = 'tutor'
  ) then
    raise exception 'Tutor programme assignments require the Tutor role.';
  end if;

  return new;
end;
$$;

drop trigger if exists tutor_program_assignments_require_tutor_role on public.tutor_program_assignments;
create trigger tutor_program_assignments_require_tutor_role
  before insert or update of tutor_id on public.tutor_program_assignments
  for each row execute procedure public.require_tutor_role_for_tutor_assignment();

alter table public.program_chat_members add column if not exists active boolean not null default true;
alter table public.program_chat_members add column if not exists updated_at timestamptz not null default now();

drop trigger if exists program_chat_members_set_updated_at on public.program_chat_members;
create trigger program_chat_members_set_updated_at before update on public.program_chat_members
  for each row execute procedure public.set_updated_at();

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
  where id = target_program_id
    and active = true;

  if selected_program.id is null then
    raise exception 'Programme was not found or is not active.';
  end if;

  insert into public.program_chat_rooms (program_id, title, active)
  values (selected_program.id, selected_program.title || ' Classroom', true)
  on conflict (program_id) do update
  set
    title = excluded.title,
    active = true,
    updated_at = now()
  returning id into target_room_id;

  with authorized_members as (
    select ur.user_id, 'admin'::text as role
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.account_status = 'active'
    where ur.role = 'admin'

    union

    select ur.user_id, 'tutor'::text as role
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.account_status = 'active'
    join public.tutor_program_assignments tpa
      on tpa.tutor_id = ur.user_id
     and tpa.program_id = target_program_id
     and tpa.active = true
    where ur.role = 'tutor'

    union

    select ur.user_id, 'student'::text as role
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.account_status = 'active'
    join public.enrolments e
      on e.user_id = ur.user_id
     and e.program_id = target_program_id
     and e.status = 'active'
    where ur.role = 'student'

    union

    select ur.user_id, 'student'::text as role
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.account_status = 'active'
    join public.student_program_preferences spp
      on spp.user_id = ur.user_id
     and spp.program_id = target_program_id
    where ur.role = 'student'
      and not exists (
        select 1
        from public.enrolments e
        where e.user_id = ur.user_id
          and e.status = 'active'
      )
  ),
  upserted as (
    insert into public.program_chat_members (room_id, user_id, role, active)
    select target_room_id, user_id, role, true
    from authorized_members
    on conflict (room_id, user_id) do update
    set
      role = excluded.role,
      active = true,
      updated_at = now()
    returning user_id
  )
  update public.program_chat_members member
  set active = false,
      updated_at = now()
  where member.room_id = target_room_id
    and not exists (
      select 1
      from authorized_members authorized
      where authorized.user_id = member.user_id
    );

  return target_room_id;
end;
$$;

create or replace function public.sync_user_program_chat_memberships(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  program_record record;
begin
  for program_record in
    select distinct program_id
    from (
      select program_id from public.enrolments where user_id = target_user_id
      union
      select program_id from public.student_program_preferences where user_id = target_user_id
      union
      select program_id from public.tutor_program_assignments where tutor_id = target_user_id
      union
      select id as program_id
      from public.programs
      where exists (
        select 1 from public.user_roles where user_id = target_user_id and role = 'admin'
      )
    ) programs_for_user
    where program_id is not null
  loop
    perform public.sync_program_chat_memberships(program_record.program_id);
  end loop;
end;
$$;

create or replace function public.ensure_programme_classroom(
  target_program_id uuid,
  target_track_id uuid default null
)
returns table (
  id uuid,
  program_id uuid,
  title text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room_id uuid;
begin
  target_room_id := public.sync_program_chat_memberships(target_program_id);

  if not public.can_access_program_chat(target_room_id) then
    raise exception 'Classroom access is not available for this programme.';
  end if;

  return query
  select room.id, room.program_id, room.title, room.active, room.created_at, room.updated_at
  from public.program_chat_rooms room
  where room.id = target_room_id;
end;
$$;

revoke all on function public.ensure_programme_classroom(uuid, uuid) from public;
grant execute on function public.ensure_programme_classroom(uuid, uuid) to authenticated;

create or replace function public.can_access_program_chat(room_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_chat_rooms room
    where room.id = room_uuid
      and room.active = true
      and (
        public.is_verified_admin_session()
        or (
          public.is_account_active(auth.uid())
          and exists (
            select 1
            from public.program_chat_members member
            where member.room_id = room.id
              and member.user_id = auth.uid()
              and member.active = true
          )
        )
      )
  );
$$;

drop policy if exists "Users can read own chat membership" on public.program_chat_members;
create policy "Users can read own chat membership"
  on public.program_chat_members for select
  to authenticated
  using (
    public.is_verified_admin_session()
    or (
      user_id = (select auth.uid())
      and active = true
      and public.is_account_active((select auth.uid()))
    )
  );

drop policy if exists "Verified admins can manage chat memberships" on public.program_chat_members;
create policy "Verified admins can manage chat memberships"
  on public.program_chat_members for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

create or replace function public.sync_classroom_after_enrolment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.program_id is not null then
    perform public.sync_program_chat_memberships(old.program_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.program_id is not null then
    perform public.sync_program_chat_memberships(new.program_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists enrolments_sync_classroom_membership on public.enrolments;
create trigger enrolments_sync_classroom_membership
  after insert or delete or update of user_id, program_id, status on public.enrolments
  for each row execute procedure public.sync_classroom_after_enrolment_change();

create or replace function public.sync_classroom_after_tutor_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.program_id is not null then
    perform public.sync_program_chat_memberships(old.program_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.program_id is not null then
    perform public.sync_program_chat_memberships(new.program_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists tutor_assignments_sync_classroom_membership on public.tutor_program_assignments;
create trigger tutor_assignments_sync_classroom_membership
  after insert or delete or update of tutor_id, program_id, active on public.tutor_program_assignments
  for each row execute procedure public.sync_classroom_after_tutor_assignment_change();

create or replace function public.sync_classroom_after_preference_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.program_id is not null then
    perform public.sync_program_chat_memberships(old.program_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.program_id is not null then
    perform public.sync_program_chat_memberships(new.program_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists student_preferences_sync_classroom_membership on public.student_program_preferences;
create trigger student_preferences_sync_classroom_membership
  after insert or delete or update of user_id, program_id, track_id on public.student_program_preferences
  for each row execute procedure public.sync_classroom_after_preference_change();

create or replace function public.sync_classroom_after_profile_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status is distinct from old.account_status then
    perform public.sync_user_program_chat_memberships(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_classroom_membership on public.profiles;
create trigger profiles_sync_classroom_membership
  after update of account_status on public.profiles
  for each row execute procedure public.sync_classroom_after_profile_status_change();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'program_chat_messages'
    ) then
      alter publication supabase_realtime add table public.program_chat_messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_read_receipts'
    ) then
      alter publication supabase_realtime add table public.message_read_receipts;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'live_class_sessions'
    ) then
      alter publication supabase_realtime add table public.live_class_sessions;
    end if;
  end if;
end $$;

with duplicate_attendance as (
  select
    id,
    row_number() over (
      partition by class_session_id, user_id
      order by joined_at desc, created_at desc, id desc
    ) as attendance_rank
  from public.live_class_attendance
)
delete from public.live_class_attendance lca
using duplicate_attendance duplicate
where duplicate.id = lca.id
  and duplicate.attendance_rank > 1;

create unique index if not exists live_class_attendance_session_user_unique_idx
  on public.live_class_attendance(class_session_id, user_id);

create index if not exists program_chat_members_active_room_user_idx
  on public.program_chat_members(room_id, user_id, active);

insert into public.program_chat_rooms (program_id, title, active)
select id, title || ' Classroom', true
from public.programs
where active = true
on conflict (program_id) do update
set title = excluded.title,
    active = true,
    updated_at = now();

select public.sync_program_chat_memberships(id)
from public.programs
where active = true;
