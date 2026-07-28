create or replace function public.enforce_admin_account_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.user_roles
    where user_id = new.id
      and role = 'admin'
  ) then
    new.account_status := 'active';
    new.failed_login_attempts := 0;
    new.last_failed_login_at := null;
    new.suspended_at := null;
    new.status_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_admin_accounts_remain_active on public.profiles;
create trigger zz_admin_accounts_remain_active
  before update on public.profiles
  for each row execute procedure public.enforce_admin_account_active();

create or replace function public.activate_admin_profile_after_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin' then
    update public.profiles
    set account_status = 'active',
        failed_login_attempts = 0,
        last_failed_login_at = null,
        suspended_at = null,
        status_reason = null
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_roles_activate_admin_profile on public.user_roles;
create trigger user_roles_activate_admin_profile
  after insert or update of role on public.user_roles
  for each row execute procedure public.activate_admin_profile_after_role_change();

update public.profiles profile
set account_status = 'active',
    failed_login_attempts = 0,
    last_failed_login_at = null,
    suspended_at = null,
    status_reason = null
where exists (
  select 1
  from public.user_roles role_record
  where role_record.user_id = profile.id
    and role_record.role = 'admin'
);

drop policy if exists "Users can create own programme preference" on public.student_program_preferences;
drop policy if exists "Users can update own programme preference" on public.student_program_preferences;
drop policy if exists "Users can delete own programme preference" on public.student_program_preferences;

drop policy if exists "Users can update own profile once" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Users can upload own profile avatars" on storage.objects;
drop policy if exists "Users can update own profile avatars" on storage.objects;
drop policy if exists "Users can delete own profile avatars" on storage.objects;

drop policy if exists "Verified admins can upload profile avatars" on storage.objects;
create policy "Verified admins can upload profile avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'profile-avatars' and public.is_verified_admin_session());

drop policy if exists "Verified admins can update profile avatars" on storage.objects;
create policy "Verified admins can update profile avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'profile-avatars' and public.is_verified_admin_session())
  with check (bucket_id = 'profile-avatars' and public.is_verified_admin_session());

drop policy if exists "Verified admins can delete profile avatars" on storage.objects;
create policy "Verified admins can delete profile avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'profile-avatars' and public.is_verified_admin_session());

drop policy if exists "Users can read own Zentel payments" on public.payments;
drop policy if exists "Users can read own payments" on public.payments;

alter table public.portal_notifications
  add column if not exists support_ticket_id uuid references public.support_tickets(id) on delete cascade;

create index if not exists portal_notifications_support_ticket_idx
  on public.portal_notifications(support_ticket_id, user_id, read_at);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('student', 'admin')),
  message text not null check (char_length(btrim(message)) between 2 and 4000),
  created_at timestamptz not null default now()
);

alter table public.support_ticket_messages enable row level security;

drop policy if exists "Students can read own support ticket messages" on public.support_ticket_messages;
create policy "Students can read own support ticket messages"
  on public.support_ticket_messages for select
  to authenticated
  using (
    public.is_account_active((select auth.uid()))
    and exists (
      select 1
      from public.support_tickets ticket
      where ticket.id = support_ticket_messages.ticket_id
        and ticket.user_id = (select auth.uid())
    )
  );

drop policy if exists "Verified admins can manage support ticket messages" on public.support_ticket_messages;
create policy "Verified admins can manage support ticket messages"
  on public.support_ticket_messages for all
  to authenticated
  using (public.is_verified_admin_session())
  with check (public.is_verified_admin_session());

create index if not exists support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages(ticket_id, created_at);

create or replace function public.student_reply_to_support_ticket(
  target_ticket_id uuid,
  reply_message text
)
returns public.support_ticket_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
  clean_message text := btrim(coalesce(reply_message, ''));
  selected_ticket public.support_tickets;
  saved_message public.support_ticket_messages;
begin
  if active_user_id is null or not public.is_account_active(active_user_id) then
    raise exception 'An active Student account is required.';
  end if;

  if coalesce((select role::text from public.user_roles where user_id = active_user_id), 'student') <> 'student' then
    raise exception 'Only Students may reply through this action.';
  end if;

  if char_length(clean_message) < 2 or char_length(clean_message) > 4000 then
    raise exception 'Reply messages must contain between 2 and 4000 characters.';
  end if;

  select * into selected_ticket
  from public.support_tickets
  where id = target_ticket_id
  for update;

  if selected_ticket.id is null or selected_ticket.user_id <> active_user_id then
    raise exception 'Support ticket was not found.';
  end if;

  if selected_ticket.status not in ('open', 'in_progress') then
    raise exception 'This ticket has been resolved and no longer accepts replies.';
  end if;

  insert into public.support_ticket_messages (ticket_id, sender_user_id, sender_role, message)
  values (selected_ticket.id, active_user_id, 'student', clean_message)
  returning * into saved_message;

  update public.support_tickets
  set updated_at = now()
  where id = selected_ticket.id;

  return saved_message;
end;
$$;

revoke all on function public.student_reply_to_support_ticket(uuid, text) from public;
grant execute on function public.student_reply_to_support_ticket(uuid, text) to authenticated;

create or replace function public.admin_reply_to_support_ticket(
  target_ticket_id uuid,
  reply_message text default '',
  next_status text default 'in_progress'
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_message text := btrim(coalesce(reply_message, ''));
  clean_status text := lower(btrim(coalesce(next_status, 'in_progress')));
  selected_ticket public.support_tickets;
  saved_ticket public.support_tickets;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  if clean_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception 'Choose a valid support ticket status.';
  end if;
  if clean_message <> '' and (char_length(clean_message) < 2 or char_length(clean_message) > 4000) then
    raise exception 'Reply messages must contain between 2 and 4000 characters.';
  end if;

  select * into selected_ticket
  from public.support_tickets
  where id = target_ticket_id
  for update;

  if selected_ticket.id is null then
    raise exception 'Support ticket was not found.';
  end if;
  if clean_message = '' and clean_status = selected_ticket.status then
    raise exception 'Add a reply or change the ticket status.';
  end if;

  if clean_message <> '' then
    insert into public.support_ticket_messages (ticket_id, sender_user_id, sender_role, message)
    values (selected_ticket.id, auth.uid(), 'admin', clean_message);
  end if;

  update public.support_tickets
  set response = case when clean_message <> '' then clean_message else response end,
      status = clean_status,
      updated_at = now()
  where id = selected_ticket.id
  returning * into saved_ticket;

  insert into public.portal_notifications (
    user_id,
    title,
    message,
    notification_type,
    link_path,
    support_ticket_id
  )
  values (
    selected_ticket.user_id,
    case when clean_status in ('resolved', 'closed') then 'Support ticket resolved' else 'Support replied to your ticket' end,
    case
      when clean_message <> '' then clean_message
      else 'Your support ticket status is now ' || replace(clean_status, '_', ' ') || '.'
    end,
    'support_ticket',
    '/portal/support?ticket=' || selected_ticket.id::text,
    selected_ticket.id
  );

  return saved_ticket;
end;
$$;

revoke all on function public.admin_reply_to_support_ticket(uuid, text, text) from public;
grant execute on function public.admin_reply_to_support_ticket(uuid, text, text) to authenticated;

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
language sql
stable
security definer
set search_path = public
as $$
  with chosen as (
    select
      'official'::text as source,
      true as is_verified_enrolment,
      enrolment.program_id,
      enrolment.program_level_id as track_id
    from public.enrolments enrolment
    where enrolment.user_id = auth.uid()
      and enrolment.status = 'active'
      and public.is_account_active(auth.uid())
    order by enrolment.updated_at desc, enrolment.created_at desc
    limit 1
  ),
  assigned_tutor as (
    select distinct on (assignment.program_id)
      assignment.tutor_id,
      assignment.program_id,
      assignment.track_id,
      profile.title,
      profile.full_name,
      tutor_profile.specialisation,
      tutor_profile.availability
    from public.tutor_program_assignments assignment
    join public.profiles profile
      on profile.id = assignment.tutor_id
     and profile.account_status = 'active'
    left join public.tutor_profiles tutor_profile on tutor_profile.user_id = assignment.tutor_id
    join chosen on chosen.program_id = assignment.program_id
    where assignment.active = true
      and (assignment.track_id is null or chosen.track_id is null or assignment.track_id = chosen.track_id)
    order by assignment.program_id,
      case when assignment.track_id = (select selected.track_id from chosen selected) then 0 else 1 end,
      assignment.updated_at desc
  )
  select
    chosen.source,
    chosen.is_verified_enrolment,
    chosen.program_id,
    chosen.track_id,
    program.title as program_title,
    level.level_name as track_name,
    assigned_tutor.tutor_id,
    assigned_tutor.title as tutor_title,
    coalesce(nullif(split_part(btrim(assigned_tutor.full_name), ' ', 1), ''), 'Tutor') as tutor_first_name,
    coalesce(assigned_tutor.specialisation, '') as tutor_specialisation,
    coalesce(assigned_tutor.availability, '') as tutor_availability
  from chosen
  join public.programs program on program.id = chosen.program_id
  left join public.program_levels level on level.id = chosen.track_id
  left join assigned_tutor on assigned_tutor.program_id = chosen.program_id;
$$;

revoke all on function public.get_resolved_student_classroom() from public;
grant execute on function public.get_resolved_student_classroom() to authenticated;

create or replace function public.digest(input_value text, algorithm text)
returns bytea
language sql
immutable
strict
set search_path = public, extensions
as $$
  select extensions.digest(input_value, algorithm);
$$;

revoke all on function public.digest(text, text) from public;
grant execute on function public.digest(text, text) to anon, authenticated, service_role;

update public.portal_page_content
set title = 'Active Payment',
    description = 'Review the active payment status connected to your assigned Zentel Insight programme.',
    empty_title = 'No active payment',
    empty_message = 'An Active Payment status appears after Admin assigns and activates your programme.',
    updated_at = now()
where page_slug = 'payments';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'support_ticket_messages'
     ) then
    alter publication supabase_realtime add table public.support_ticket_messages;
  end if;
end $$;
