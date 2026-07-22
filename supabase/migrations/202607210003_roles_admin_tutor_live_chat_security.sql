create extension if not exists "pgcrypto";

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_roles_role_check check (role in ('admin', 'tutor', 'student'))
);

alter table public.user_roles enable row level security;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.user_roles where user_id = auth.uid()),
    'student'
  );
$$;

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = required_role
  );
$$;

create table if not exists public.admin_session_verifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.admin_session_verifications enable row level security;

create or replace function public.current_session_id()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'session_id', auth.jwt() ->> 'sid', '');
$$;

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
    join public.admin_session_verifications asv
      on asv.user_id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
      and asv.session_id = public.current_session_id()
      and asv.expires_at > now()
  );
$$;

create table if not exists public.admin_access_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  success boolean not null default false,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

alter table public.admin_access_attempts enable row level security;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

alter table public.profiles add column if not exists title text;
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles drop constraint if exists profiles_title_check;
alter table public.profiles add constraint profiles_title_check check (title is null or title in ('Mr', 'Mrs'));
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check (account_status in ('active', 'restricted', 'suspended'));

create table if not exists public.tutor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  title text not null check (title in ('Mr', 'Mrs')),
  professional_bio text not null default '',
  qualifications text not null default '',
  teaching_experience text not null default '',
  availability text not null default '',
  specialisation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tutor_profiles enable row level security;

create table if not exists public.tutor_program_assignments (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  track_id uuid references public.program_levels(id) on delete set null,
  assigned_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tutor_id, program_id, track_id)
);

alter table public.tutor_program_assignments enable row level security;

create or replace function public.is_tutor_for_program(target_program_id uuid, target_track_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.tutor_program_assignments tpa
      on tpa.tutor_id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role = 'tutor'
      and tpa.active = true
      and tpa.program_id = target_program_id
      and (
        tpa.track_id is null
        or target_track_id is null
        or tpa.track_id = target_track_id
      )
  );
$$;

create or replace function public.has_active_student_program(target_program_id uuid, target_track_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrolments e
    where e.user_id = auth.uid()
      and e.status = 'active'
      and e.program_id = target_program_id
      and (
        target_track_id is null
        or e.program_level_id = target_track_id
      )
  );
$$;

create or replace function public.has_student_program_preference(target_program_id uuid, target_track_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1
      from public.enrolments e
      where e.user_id = auth.uid()
        and e.status = 'active'
    )
    and exists (
      select 1
      from public.student_program_preferences spp
      where spp.user_id = auth.uid()
        and spp.program_id = target_program_id
        and (
          target_track_id is null
          or spp.track_id is null
          or spp.track_id = target_track_id
        )
    );
$$;

create table if not exists public.live_class_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  track_id uuid references public.program_levels(id) on delete set null,
  tutor_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text not null default '',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  timezone text not null default 'Africa/Lagos',
  provider text not null default 'daily',
  provider_room_id text,
  provider_room_url text,
  status text not null default 'scheduled',
  join_opens_at timestamptz,
  join_closes_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_class_sessions_status_check check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  constraint live_class_sessions_time_check check (scheduled_end > scheduled_start)
);

alter table public.live_class_sessions enable row level security;

create table if not exists public.live_class_attendance (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.live_class_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  attendance_status text not null default 'joined',
  created_at timestamptz not null default now(),
  constraint live_class_attendance_status_check check (attendance_status in ('joined', 'left', 'missed'))
);

alter table public.live_class_attendance enable row level security;

create table if not exists public.program_chat_rooms (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null unique references public.programs(id) on delete cascade,
  title text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.program_chat_rooms enable row level security;

create table if not exists public.program_chat_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.program_chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'tutor', 'student')),
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

alter table public.program_chat_members enable row level security;

create table if not exists public.program_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.program_chat_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message_type text not null default 'text' check (message_type in ('text', 'image')),
  body text not null default '',
  image_path text,
  reply_to_id uuid references public.program_chat_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_for_moderation_at timestamptz,
  moderation_reason text,
  created_at timestamptz not null default now()
);

alter table public.program_chat_messages enable row level security;

create table if not exists public.message_read_receipts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.program_chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (message_id, user_id)
);

alter table public.message_read_receipts enable row level security;

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
        or public.is_tutor_for_program(room.program_id, null)
        or public.has_active_student_program(room.program_id, null)
        or public.has_student_program_preference(room.program_id, null)
        or exists (
          select 1
          from public.program_chat_members member
          where member.room_id = room.id
            and member.user_id = auth.uid()
        )
      )
  );
$$;

create table if not exists public.program_prices (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  track_id uuid not null references public.program_levels(id) on delete cascade,
  price_kobo integer not null check (price_kobo >= 0),
  currency text not null default 'NGN',
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track_id, effective_from)
);

alter table public.program_prices enable row level security;

insert into public.program_prices (program_id, track_id, price_kobo, currency, active)
select program_id, id, price_kobo, 'NGN', active
from public.program_levels pl
where not exists (
  select 1 from public.program_prices pp where pp.track_id = pl.id
);

insert into public.program_chat_rooms (program_id, title, active)
select id, title || ' Chat', true
from public.programs
where not exists (
  select 1 from public.program_chat_rooms room where room.program_id = programs.id
);

insert into public.user_roles (user_id, role)
select id, 'student'
from auth.users
where not exists (
  select 1 from public.user_roles where user_roles.user_id = auth.users.id
);

insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = 'zentelinsight@gmail.com'
on conflict (user_id) do update
set role = 'admin', updated_at = now();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  completion integer;
begin
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
    date_of_birth,
    education_level,
    address,
    profile_completed,
    profile_completion,
    account_status
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    coalesce(new.raw_user_meta_data ->> 'education_level', ''),
    coalesce(new.raw_user_meta_data ->> 'address', ''),
    completion >= 80,
    completion,
    'active'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    phone = coalesce(nullif(public.profiles.phone, ''), excluded.phone),
    date_of_birth = coalesce(public.profiles.date_of_birth, excluded.date_of_birth),
    education_level = coalesce(nullif(public.profiles.education_level, ''), excluded.education_level),
    address = coalesce(nullif(public.profiles.address, ''), excluded.address),
    profile_completion = greatest(public.profiles.profile_completion, excluded.profile_completion),
    updated_at = now();

  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.guard_profile_authoritative_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_verified_admin_session() then
    return new;
  end if;

  if auth.uid() = old.id and (
    new.full_name is distinct from old.full_name
    or new.phone is distinct from old.phone
    or new.address is distinct from old.address
    or new.education_level is distinct from old.education_level
    or new.date_of_birth is distinct from old.date_of_birth
    or new.email is distinct from old.email
    or new.title is distinct from old.title
    or new.account_status is distinct from old.account_status
    or new.must_change_password is distinct from old.must_change_password
  ) then
    raise exception 'Only Zentel Insight administration may update authoritative profile fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_authoritative_fields on public.profiles;
create trigger profiles_guard_authoritative_fields
  before update on public.profiles
  for each row execute procedure public.guard_profile_authoritative_fields();

drop policy if exists "Users can read own role" on public.user_roles;
create policy "Users can read own role"
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Verified admins can read all roles" on public.user_roles;
create policy "Verified admins can read all roles"
  on public.user_roles for select
  to authenticated
  using (public.is_verified_admin_session());

drop policy if exists "Verified admins can manage roles" on public.user_roles;
create policy "Verified admins can manage roles"
  on public.user_roles for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Users can read own admin verification" on public.admin_session_verifications;
create policy "Users can read own admin verification"
  on public.admin_session_verifications for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and session_id = public.current_session_id()
    and expires_at > now()
  );

drop policy if exists "Verified admins can read audit logs" on public.audit_logs;
create policy "Verified admins can read audit logs"
  on public.audit_logs for select
  to authenticated
  using (public.is_verified_admin_session());

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Verified admins can read all profiles" on public.profiles;
create policy "Verified admins can read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_verified_admin_session());

drop policy if exists "Tutors can read connected student profiles" on public.profiles;
create policy "Tutors can read connected student profiles"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.enrolments e
      where e.user_id = profiles.id
        and public.is_tutor_for_program(e.program_id, e.program_level_id)
    )
    or exists (
      select 1
      from public.student_program_preferences spp
      where spp.user_id = profiles.id
        and public.is_tutor_for_program(spp.program_id, spp.track_id)
    )
  );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Verified admins can update profiles" on public.profiles;
create policy "Verified admins can update profiles"
  on public.profiles for update
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can read own tutor profile" on public.tutor_profiles;
create policy "Tutors can read own tutor profile"
  on public.tutor_profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Tutors can update professional profile" on public.tutor_profiles;
create policy "Tutors can update professional profile"
  on public.tutor_profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Verified admins can manage tutor profiles" on public.tutor_profiles;
create policy "Verified admins can manage tutor profiles"
  on public.tutor_profiles for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can read own assignments" on public.tutor_program_assignments;
create policy "Tutors can read own assignments"
  on public.tutor_program_assignments for select
  to authenticated
  using (tutor_id = (select auth.uid()));

drop policy if exists "Verified admins can manage tutor assignments" on public.tutor_program_assignments;
create policy "Verified admins can manage tutor assignments"
  on public.tutor_program_assignments for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Verified admins can manage programs" on public.programs;
create policy "Verified admins can manage programs"
  on public.programs for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can read assigned programs" on public.programs;
create policy "Tutors can read assigned programs"
  on public.programs for select
  to authenticated
  using (
    active = true
    and exists (
      select 1 from public.tutor_program_assignments tpa
      where tpa.program_id = programs.id
        and tpa.tutor_id = (select auth.uid())
        and tpa.active = true
    )
  );

drop policy if exists "Verified admins can manage program levels" on public.program_levels;
create policy "Verified admins can manage program levels"
  on public.program_levels for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can read assigned program levels" on public.program_levels;
create policy "Tutors can read assigned program levels"
  on public.program_levels for select
  to authenticated
  using (
    active = true
    and exists (
      select 1 from public.tutor_program_assignments tpa
      where tpa.program_id = program_levels.program_id
        and tpa.tutor_id = (select auth.uid())
        and tpa.active = true
        and (tpa.track_id is null or tpa.track_id = program_levels.id)
    )
  );

drop policy if exists "Active program prices are public" on public.program_prices;
create policy "Active program prices are public"
  on public.program_prices for select
  using (active = true);

drop policy if exists "Verified admins can manage program prices" on public.program_prices;
create policy "Verified admins can manage program prices"
  on public.program_prices for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Verified admins can read all payments" on public.payments;
create policy "Verified admins can read all payments"
  on public.payments for select
  to authenticated
  using (public.is_verified_admin_session());

drop policy if exists "Verified admins can manage enrolments" on public.enrolments;
create policy "Verified admins can manage enrolments"
  on public.enrolments for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can read assigned student enrolments" on public.enrolments;
create policy "Tutors can read assigned student enrolments"
  on public.enrolments for select
  to authenticated
  using (public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Tutors can read assigned student preferences" on public.student_program_preferences;
create policy "Tutors can read assigned student preferences"
  on public.student_program_preferences for select
  to authenticated
  using (public.is_tutor_for_program(program_id, track_id));

drop policy if exists "Verified admins can manage student preferences" on public.student_program_preferences;
create policy "Verified admins can manage student preferences"
  on public.student_program_preferences for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Verified admins can manage announcements" on public.announcements;
create policy "Verified admins can manage announcements"
  on public.announcements for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can manage assigned announcements" on public.announcements;
create policy "Tutors can manage assigned announcements"
  on public.announcements for all
  to authenticated
  using (public.is_tutor_for_program(program_id, program_level_id))
  with check (public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Verified admins can manage timetable" on public.timetable_entries;
create policy "Verified admins can manage timetable"
  on public.timetable_entries for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can manage assigned timetable" on public.timetable_entries;
create policy "Tutors can manage assigned timetable"
  on public.timetable_entries for all
  to authenticated
  using (public.is_tutor_for_program(program_id, coalesce(track_id, program_level_id)))
  with check (public.is_tutor_for_program(program_id, coalesce(track_id, program_level_id)));

drop policy if exists "Verified admins can manage assignments" on public.assignments;
create policy "Verified admins can manage assignments"
  on public.assignments for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can manage assigned assignments" on public.assignments;
create policy "Tutors can manage assigned assignments"
  on public.assignments for all
  to authenticated
  using (public.is_tutor_for_program(program_id, program_level_id))
  with check (public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Verified admins can manage resources" on public.resources;
create policy "Verified admins can manage resources"
  on public.resources for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can manage assigned resources" on public.resources;
create policy "Tutors can manage assigned resources"
  on public.resources for all
  to authenticated
  using (public.is_tutor_for_program(program_id, program_level_id))
  with check (public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Verified admins can manage articles" on public.portal_articles;
create policy "Verified admins can manage articles"
  on public.portal_articles for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can manage assigned articles" on public.portal_articles;
create policy "Tutors can manage assigned articles"
  on public.portal_articles for all
  to authenticated
  using (program_id is not null and public.is_tutor_for_program(program_id, program_level_id))
  with check (program_id is not null and public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Verified admins can manage support tickets" on public.support_tickets;
create policy "Verified admins can manage support tickets"
  on public.support_tickets for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Verified admins can manage notifications" on public.portal_notifications;
create policy "Verified admins can manage notifications"
  on public.portal_notifications for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Verified admins can manage live classes" on public.live_class_sessions;
create policy "Verified admins can manage live classes"
  on public.live_class_sessions for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Tutors can manage assigned live classes" on public.live_class_sessions;
create policy "Tutors can manage assigned live classes"
  on public.live_class_sessions for all
  to authenticated
  using (public.is_tutor_for_program(program_id, track_id))
  with check (public.is_tutor_for_program(program_id, track_id) and tutor_id = (select auth.uid()));

drop policy if exists "Students can read authorized live classes" on public.live_class_sessions;
create policy "Students can read authorized live classes"
  on public.live_class_sessions for select
  to authenticated
  using (
    status in ('scheduled', 'live', 'completed', 'cancelled')
    and (
      public.has_active_student_program(program_id, track_id)
      or public.has_student_program_preference(program_id, track_id)
    )
  );

drop policy if exists "Users can read own attendance" on public.live_class_attendance;
create policy "Users can read own attendance"
  on public.live_class_attendance for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Verified admins can read attendance" on public.live_class_attendance;
create policy "Verified admins can read attendance"
  on public.live_class_attendance for select
  to authenticated
  using (public.is_verified_admin_session());

drop policy if exists "Tutors can read assigned attendance" on public.live_class_attendance;
create policy "Tutors can read assigned attendance"
  on public.live_class_attendance for select
  to authenticated
  using (
    exists (
      select 1 from public.live_class_sessions lcs
      where lcs.id = live_class_attendance.class_session_id
        and public.is_tutor_for_program(lcs.program_id, lcs.track_id)
    )
  );

drop policy if exists "Users can read authorized chat rooms" on public.program_chat_rooms;
create policy "Users can read authorized chat rooms"
  on public.program_chat_rooms for select
  to authenticated
  using (public.can_access_program_chat(id));

drop policy if exists "Verified admins can manage chat rooms" on public.program_chat_rooms;
create policy "Verified admins can manage chat rooms"
  on public.program_chat_rooms for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Users can read own chat membership" on public.program_chat_members;
create policy "Users can read own chat membership"
  on public.program_chat_members for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_verified_admin_session());

drop policy if exists "Users can read authorized chat messages" on public.program_chat_messages;
create policy "Users can read authorized chat messages"
  on public.program_chat_messages for select
  to authenticated
  using (public.can_access_program_chat(room_id));

drop policy if exists "Authorized users can send chat messages" on public.program_chat_messages;
create policy "Authorized users can send chat messages"
  on public.program_chat_messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.can_access_program_chat(room_id)
    and deleted_for_moderation_at is null
  );

drop policy if exists "Verified admins can moderate chat messages" on public.program_chat_messages;
create policy "Verified admins can moderate chat messages"
  on public.program_chat_messages for update
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

drop policy if exists "Users can read own message receipts" on public.message_read_receipts;
create policy "Users can read own message receipts"
  on public.message_read_receipts for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can write own message receipts" on public.message_read_receipts;
create policy "Users can write own message receipts"
  on public.message_read_receipts for insert
  to authenticated
  with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Authorized users can upload chat images" on storage.objects;
create policy "Authorized users can upload chat images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.can_access_program_chat(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Authorized users can read chat images" on storage.objects;
create policy "Authorized users can read chat images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-images'
    and public.can_access_program_chat(((storage.foldername(name))[1])::uuid)
  );

create index if not exists user_roles_role_idx on public.user_roles(role);
create index if not exists admin_session_verifications_user_expires_idx on public.admin_session_verifications(user_id, expires_at);
create index if not exists admin_access_attempts_user_created_idx on public.admin_access_attempts(user_id, created_at);
create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_user_id, created_at);
create index if not exists tutor_program_assignments_tutor_idx on public.tutor_program_assignments(tutor_id, active);
create index if not exists tutor_program_assignments_program_idx on public.tutor_program_assignments(program_id, active);
create index if not exists live_class_sessions_program_time_idx on public.live_class_sessions(program_id, scheduled_start, status);
create index if not exists live_class_sessions_tutor_idx on public.live_class_sessions(tutor_id, scheduled_start);
create index if not exists live_class_attendance_session_user_idx on public.live_class_attendance(class_session_id, user_id);
create index if not exists program_chat_rooms_program_idx on public.program_chat_rooms(program_id);
create index if not exists program_chat_members_room_user_idx on public.program_chat_members(room_id, user_id);
create index if not exists program_chat_messages_room_created_idx on public.program_chat_messages(room_id, created_at desc);
create index if not exists message_read_receipts_user_idx on public.message_read_receipts(user_id, read_at);
create index if not exists program_prices_track_active_idx on public.program_prices(track_id, active);
create index if not exists payments_admin_filters_idx on public.payments(created_at, status, product_key, customer_email);

drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at before update on public.user_roles
  for each row execute procedure public.set_updated_at();

drop trigger if exists tutor_profiles_set_updated_at on public.tutor_profiles;
create trigger tutor_profiles_set_updated_at before update on public.tutor_profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists tutor_program_assignments_set_updated_at on public.tutor_program_assignments;
create trigger tutor_program_assignments_set_updated_at before update on public.tutor_program_assignments
  for each row execute procedure public.set_updated_at();

drop trigger if exists live_class_sessions_set_updated_at on public.live_class_sessions;
create trigger live_class_sessions_set_updated_at before update on public.live_class_sessions
  for each row execute procedure public.set_updated_at();

drop trigger if exists program_chat_rooms_set_updated_at on public.program_chat_rooms;
create trigger program_chat_rooms_set_updated_at before update on public.program_chat_rooms
  for each row execute procedure public.set_updated_at();

drop trigger if exists program_prices_set_updated_at on public.program_prices;
create trigger program_prices_set_updated_at before update on public.program_prices
  for each row execute procedure public.set_updated_at();
