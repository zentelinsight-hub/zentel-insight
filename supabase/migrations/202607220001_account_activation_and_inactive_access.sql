create extension if not exists "pgcrypto";

alter table public.profiles add column if not exists account_status text not null default 'inactive';
alter table public.profiles add column if not exists status_changed_at timestamptz;
alter table public.profiles add column if not exists status_changed_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists status_reason text;

alter table public.profiles drop constraint if exists profiles_account_status_check;

update public.profiles
set
  account_status = 'inactive',
  status_changed_at = coalesce(status_changed_at, now()),
  status_reason = coalesce(nullif(status_reason, ''), 'Initial account activation migration')
where not exists (
    select 1
    from public.user_roles
    where user_roles.user_id = profiles.id
      and user_roles.role = 'admin'
  )
  and account_status is distinct from 'inactive';

update public.profiles
set
  account_status = 'active',
  status_changed_at = coalesce(status_changed_at, now()),
  status_reason = coalesce(nullif(status_reason, ''), 'Admin account exemption')
where exists (
    select 1
    from public.user_roles
    where user_roles.user_id = profiles.id
      and user_roles.role = 'admin'
  )
  and account_status is distinct from 'active';

alter table public.profiles alter column account_status set default 'inactive';
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active', 'inactive'));

create index if not exists profiles_account_status_idx on public.profiles(account_status);
create index if not exists profiles_user_status_idx on public.profiles(id, account_status);
create index if not exists profiles_status_changed_at_idx on public.profiles(status_changed_at desc);
create index if not exists user_roles_user_role_idx on public.user_roles(user_id, role);

create or replace function public.is_account_active(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = target_user_id
      and profiles.account_status = 'active'
  );
$$;

create or replace function public.current_account_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select account_status from public.profiles where id = auth.uid()),
    'inactive'
  );
$$;

create or replace function public.set_profile_account_status_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status is distinct from old.account_status then
    if auth.uid() is not null and not public.is_verified_admin_session() then
      raise exception 'Only verified Zentel Insight administration may change account status.';
    end if;

    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
    new.status_reason := nullif(btrim(coalesce(new.status_reason, '')), '');
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_account_status_metadata on public.profiles;
create trigger profiles_account_status_metadata
  before update of account_status on public.profiles
  for each row execute procedure public.set_profile_account_status_metadata();

create or replace function public.audit_profile_account_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status is distinct from old.account_status then
    insert into public.audit_logs (
      actor_user_id,
      action,
      target_table,
      target_id,
      metadata
    )
    values (
      auth.uid(),
      'account_status_changed',
      'profiles',
      new.id,
      jsonb_build_object(
        'previous_status', old.account_status,
        'next_status', new.account_status,
        'reason', new.status_reason
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_account_status_audit on public.profiles;
create trigger profiles_account_status_audit
  after update of account_status on public.profiles
  for each row execute procedure public.audit_profile_account_status_change();

create or replace function public.admin_set_account_status(
  target_user_id uuid,
  next_status text,
  status_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(btrim(coalesce(next_status, '')));
  target_role text;
  updated_profile public.profiles;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if clean_status not in ('active', 'inactive') then
    raise exception 'Account status must be active or inactive.';
  end if;

  select coalesce(
    (select role from public.user_roles where user_id = target_user_id),
    'student'
  )
  into target_role;

  if target_role = 'admin' then
    raise exception 'The Admin account cannot be deactivated from the website.';
  end if;

  if target_role not in ('student', 'tutor') then
    raise exception 'Only Student and Tutor accounts can be activated or deactivated here.';
  end if;

  update public.profiles
  set
    account_status = clean_status,
    status_reason = nullif(btrim(coalesce($3, '')), '')
  where id = target_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Account profile was not found.';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.admin_set_account_status(uuid, text, text) from public;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;

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
    account_status,
    status_changed_at,
    status_reason
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
    'inactive',
    now(),
    'New account pending Admin activation'
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
    join public.profiles p
      on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role = 'tutor'
      and p.account_status = 'active'
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
  select public.is_account_active(auth.uid())
    and exists (
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
    public.is_account_active(auth.uid())
    and not exists (
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
          and (
            public.is_tutor_for_program(room.program_id, null)
            or public.has_active_student_program(room.program_id, null)
            or public.has_student_program_preference(room.program_id, null)
            or exists (
              select 1
              from public.program_chat_members member
              where member.room_id = room.id
                and member.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;

drop policy if exists "Users can insert own missing profile" on public.profiles;
create policy "Users can insert own missing profile"
  on public.profiles for insert
  to authenticated
  with check (
    id = (select auth.uid())
    and account_status = 'inactive'
    and status_changed_by is null
  );

drop policy if exists "Users can update own profile once" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id and public.is_account_active((select auth.uid())))
  with check ((select auth.uid()) = id and public.is_account_active((select auth.uid())));

drop policy if exists "Users can read own student preferences" on public.student_preferences;
create policy "Users can read own student preferences"
  on public.student_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id and public.is_account_active((select auth.uid())));

drop policy if exists "Users can create own student preferences" on public.student_preferences;
create policy "Users can create own student preferences"
  on public.student_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id and public.is_account_active((select auth.uid())));

drop policy if exists "Users can update own student preferences" on public.student_preferences;
create policy "Users can update own student preferences"
  on public.student_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id and public.is_account_active((select auth.uid())))
  with check ((select auth.uid()) = user_id and public.is_account_active((select auth.uid())));

drop policy if exists "Users can delete own student preferences" on public.student_preferences;
create policy "Users can delete own student preferences"
  on public.student_preferences for delete
  to authenticated
  using ((select auth.uid()) = user_id and public.is_account_active((select auth.uid())));

drop policy if exists "Users can read own programme preference" on public.student_program_preferences;
create policy "Users can read own programme preference"
  on public.student_program_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id and public.is_account_active((select auth.uid())));

drop policy if exists "Users can create own programme preference" on public.student_program_preferences;
create policy "Users can create own programme preference"
  on public.student_program_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id and public.is_account_active((select auth.uid())));

drop policy if exists "Users can update own programme preference" on public.student_program_preferences;
create policy "Users can update own programme preference"
  on public.student_program_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id and public.is_account_active((select auth.uid())))
  with check ((select auth.uid()) = user_id and public.is_account_active((select auth.uid())));

drop policy if exists "Users can read own enrolments" on public.enrolments;
create policy "Users can read own enrolments"
  on public.enrolments for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can read own Zentel payments" on public.payments;
drop policy if exists "Users can read own payments" on public.payments;
create policy "Users can read own payments"
  on public.payments for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can read timetable for active enrolments" on public.timetable_entries;
drop policy if exists "Users can read timetable for resolved programme" on public.timetable_entries;
create policy "Users can read timetable for resolved programme"
  on public.timetable_entries for select
  to authenticated
  using (
    active = true
    and published = true
    and public.is_account_active((select auth.uid()))
    and (
      public.has_active_student_program(program_id, coalesce(track_id, program_level_id))
      or public.has_student_program_preference(program_id, coalesce(track_id, program_level_id))
    )
  );

drop policy if exists "Active announcements are readable by authenticated users" on public.announcements;
drop policy if exists "Active announcements are readable by authorized authenticated users" on public.announcements;
create policy "Active announcements are readable by authorized authenticated users"
  on public.announcements for select
  to authenticated
  using (
    active = true
    and published = true
    and public.is_account_active((select auth.uid()))
    and (
      program_id is null
      or public.has_active_student_program(program_id, program_level_id)
    )
  );

drop policy if exists "Users can read resources for active enrolments" on public.resources;
create policy "Users can read resources for active enrolments"
  on public.resources for select
  to authenticated
  using (
    active = true
    and published = true
    and public.is_account_active((select auth.uid()))
    and public.has_active_student_program(program_id, program_level_id)
  );

drop policy if exists "Users can read assignments for active enrolments" on public.assignments;
create policy "Users can read assignments for active enrolments"
  on public.assignments for select
  to authenticated
  using (
    published = true
    and public.is_account_active((select auth.uid()))
    and public.has_active_student_program(program_id, program_level_id)
  );

drop policy if exists "Users can read accessible published portal articles" on public.portal_articles;
create policy "Users can read accessible published portal articles"
  on public.portal_articles for select
  to authenticated
  using (
    active = true
    and published = true
    and public.is_account_active((select auth.uid()))
    and (expires_at is null or expires_at > now())
    and (
      program_id is null
      or public.has_active_student_program(program_id, program_level_id)
    )
  );

drop policy if exists "Users can read own assignment submissions" on public.assignment_submissions;
create policy "Users can read own assignment submissions"
  on public.assignment_submissions for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can create own assignment submissions" on public.assignment_submissions;
create policy "Users can create own assignment submissions"
  on public.assignment_submissions for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can update own draft assignment submissions" on public.assignment_submissions;
create policy "Users can update own draft assignment submissions"
  on public.assignment_submissions for update
  to authenticated
  using (user_id = (select auth.uid()) and status in ('draft', 'returned') and public.is_account_active((select auth.uid())))
  with check (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can read own certificates" on public.certificates;
create policy "Users can read own certificates"
  on public.certificates for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can read own portal notifications" on public.portal_notifications;
create policy "Users can read own portal notifications"
  on public.portal_notifications for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can update own portal notifications" on public.portal_notifications;
create policy "Users can update own portal notifications"
  on public.portal_notifications for update
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())))
  with check (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can read own support requests" on public.support_requests;
create policy "Users can read own support requests"
  on public.support_requests for select
  to authenticated
  using (auth.uid() = user_id and public.is_account_active((select auth.uid())));

drop policy if exists "Users can create support requests" on public.support_requests;
create policy "Users can create support requests"
  on public.support_requests for insert
  to authenticated
  with check ((auth.uid() = user_id or user_id is null) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can read own support tickets" on public.support_tickets;
create policy "Users can read own support tickets"
  on public.support_tickets for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can create own support tickets" on public.support_tickets;
create policy "Users can create own support tickets"
  on public.support_tickets for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Tutors can read connected student profiles" on public.profiles;
create policy "Tutors can read connected student profiles"
  on public.profiles for select
  to authenticated
  using (
    public.is_account_active((select auth.uid()))
    and profiles.account_status = 'active'
    and (
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
    )
  );

drop policy if exists "Tutors can read own tutor profile" on public.tutor_profiles;
create policy "Tutors can read own tutor profile"
  on public.tutor_profiles for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Tutors can update professional profile" on public.tutor_profiles;
create policy "Tutors can update professional profile"
  on public.tutor_profiles for update
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())))
  with check (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Tutors can read own assignments" on public.tutor_program_assignments;
create policy "Tutors can read own assignments"
  on public.tutor_program_assignments for select
  to authenticated
  using (tutor_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Tutors can read assigned programs" on public.programs;
create policy "Tutors can read assigned programs"
  on public.programs for select
  to authenticated
  using (
    active = true
    and public.is_account_active((select auth.uid()))
    and exists (
      select 1 from public.tutor_program_assignments tpa
      where tpa.program_id = programs.id
        and tpa.tutor_id = (select auth.uid())
        and tpa.active = true
    )
  );

drop policy if exists "Tutors can read assigned program levels" on public.program_levels;
create policy "Tutors can read assigned program levels"
  on public.program_levels for select
  to authenticated
  using (
    active = true
    and public.is_account_active((select auth.uid()))
    and exists (
      select 1 from public.tutor_program_assignments tpa
      where tpa.program_id = program_levels.program_id
        and tpa.tutor_id = (select auth.uid())
        and tpa.active = true
        and (tpa.track_id is null or tpa.track_id = program_levels.id)
    )
  );

drop policy if exists "Tutors can read assigned student enrolments" on public.enrolments;
create policy "Tutors can read assigned student enrolments"
  on public.enrolments for select
  to authenticated
  using (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Tutors can read assigned student preferences" on public.student_program_preferences;
create policy "Tutors can read assigned student preferences"
  on public.student_program_preferences for select
  to authenticated
  using (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, track_id));

drop policy if exists "Tutors can manage assigned announcements" on public.announcements;
create policy "Tutors can manage assigned announcements"
  on public.announcements for all
  to authenticated
  using (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, program_level_id))
  with check (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Tutors can manage assigned timetable" on public.timetable_entries;
create policy "Tutors can manage assigned timetable"
  on public.timetable_entries for all
  to authenticated
  using (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, coalesce(track_id, program_level_id)))
  with check (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, coalesce(track_id, program_level_id)));

drop policy if exists "Tutors can manage assigned assignments" on public.assignments;
create policy "Tutors can manage assigned assignments"
  on public.assignments for all
  to authenticated
  using (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, program_level_id))
  with check (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Tutors can manage assigned resources" on public.resources;
create policy "Tutors can manage assigned resources"
  on public.resources for all
  to authenticated
  using (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, program_level_id))
  with check (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Tutors can manage assigned articles" on public.portal_articles;
create policy "Tutors can manage assigned articles"
  on public.portal_articles for all
  to authenticated
  using (public.is_account_active((select auth.uid())) and program_id is not null and public.is_tutor_for_program(program_id, program_level_id))
  with check (public.is_account_active((select auth.uid())) and program_id is not null and public.is_tutor_for_program(program_id, program_level_id));

drop policy if exists "Tutors can manage assigned live classes" on public.live_class_sessions;
create policy "Tutors can manage assigned live classes"
  on public.live_class_sessions for all
  to authenticated
  using (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, track_id))
  with check (public.is_account_active((select auth.uid())) and public.is_tutor_for_program(program_id, track_id) and tutor_id = (select auth.uid()));

drop policy if exists "Students can read authorized live classes" on public.live_class_sessions;
create policy "Students can read authorized live classes"
  on public.live_class_sessions for select
  to authenticated
  using (
    status in ('scheduled', 'live', 'completed', 'cancelled')
    and public.is_account_active((select auth.uid()))
    and (
      public.has_active_student_program(program_id, track_id)
      or public.has_student_program_preference(program_id, track_id)
    )
  );

drop policy if exists "Users can read own attendance" on public.live_class_attendance;
create policy "Users can read own attendance"
  on public.live_class_attendance for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Tutors can read assigned attendance" on public.live_class_attendance;
create policy "Tutors can read assigned attendance"
  on public.live_class_attendance for select
  to authenticated
  using (
    public.is_account_active((select auth.uid()))
    and exists (
      select 1 from public.live_class_sessions lcs
      where lcs.id = live_class_attendance.class_session_id
        and public.is_tutor_for_program(lcs.program_id, lcs.track_id)
    )
  );

drop policy if exists "Users can read own chat membership" on public.program_chat_members;
create policy "Users can read own chat membership"
  on public.program_chat_members for select
  to authenticated
  using (
    public.is_verified_admin_session()
    or (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())))
  );

drop policy if exists "Users can read own message receipts" on public.message_read_receipts;
create policy "Users can read own message receipts"
  on public.message_read_receipts for select
  to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));

drop policy if exists "Users can write own message receipts" on public.message_read_receipts;
create policy "Users can write own message receipts"
  on public.message_read_receipts for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.is_account_active((select auth.uid())));
