-- Production classroom, portal ID, and Zentel AI access corrections.
-- This migration is additive and preserves existing conversations, financial records,
-- memberships, attendance, programme assignments, and approved AI catalogue prices.

-- ---------------------------------------------------------------------------
-- Portal IDs: role is authoritative and visible IDs remain immutable to users.
-- ---------------------------------------------------------------------------

create or replace function public.assign_profile_portal_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_role text;
  maintenance_enabled boolean := coalesce(current_setting('zentel.portal_id_maintenance', true), '') = 'on';
begin
  select role into account_role
  from public.user_roles
  where user_id = new.id;

  if account_role is null then
    select case
      when lower(coalesce(user_record.email, '')) = 'zentelinsight@gmail.com' then 'admin'
      when coalesce(user_record.raw_app_meta_data ->> 'zentel_role', '') = 'tutor'
        and coalesce(user_record.raw_app_meta_data ->> 'zentel_provisioned_by', '') = 'admin' then 'tutor'
      else 'student'
    end
    into account_role
    from auth.users user_record
    where user_record.id = new.id;
  end if;

  account_role := coalesce(account_role, 'student');

  if tg_op = 'UPDATE'
     and old.portal_id is not null
     and new.portal_id is distinct from old.portal_id
     and not maintenance_enabled then
    raise exception 'Portal ID is immutable.';
  end if;

  if account_role = 'admin' then
    new.portal_id := null;
    return new;
  end if;

  if account_role not in ('student', 'tutor') then
    raise exception 'A valid learner role is required before assigning a Portal ID.';
  end if;

  if new.portal_id is not null then
    new.portal_id := upper(btrim(new.portal_id));
  end if;

  if new.portal_id is null
     or (account_role = 'student' and new.portal_id !~ '^ZIS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$')
     or (account_role = 'tutor' and new.portal_id !~ '^ZIT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$') then
    if tg_op = 'UPDATE' and old.portal_id is not null and not maintenance_enabled then
      raise exception 'Portal ID does not match the account role.';
    end if;
    new.portal_id := public.generate_account_portal_id(account_role);
  end if;

  return new;
end;
$$;

create or replace function public.assign_portal_id_after_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('zentel.portal_id_maintenance', 'on', true);

  if new.role = 'admin' then
    update public.profiles
    set portal_id = null,
        updated_at = now()
    where id = new.user_id
      and portal_id is not null;
  elsif new.role in ('student', 'tutor') then
    update public.profiles
    set portal_id = public.generate_account_portal_id(new.role),
        updated_at = now()
    where id = new.user_id
      and (
        portal_id is null
        or (new.role = 'student' and portal_id !~ '^ZIS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$')
        or (new.role = 'tutor' and portal_id !~ '^ZIT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$')
      );
  end if;

  perform set_config('zentel.portal_id_maintenance', 'off', true);
  return new;
exception when others then
  perform set_config('zentel.portal_id_maintenance', 'off', true);
  raise;
end;
$$;

select set_config('zentel.portal_id_maintenance', 'on', true);

update public.profiles profile
set portal_id = public.generate_account_portal_id(role_record.role),
    updated_at = now()
from public.user_roles role_record
where role_record.user_id = profile.id
  and role_record.role in ('student', 'tutor')
  and (
    profile.portal_id is null
    or (role_record.role = 'student' and profile.portal_id !~ '^ZIS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$')
    or (role_record.role = 'tutor' and profile.portal_id !~ '^ZIT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$')
  );

update public.profiles profile
set portal_id = null,
    updated_at = now()
from public.user_roles role_record
where role_record.user_id = profile.id
  and role_record.role = 'admin'
  and profile.portal_id is not null;

select set_config('zentel.portal_id_maintenance', 'off', true);

-- ---------------------------------------------------------------------------
-- Canonical programme chat extensions.
-- ---------------------------------------------------------------------------

alter table public.program_chat_rooms
  add column if not exists room_type text not null default 'programme',
  add column if not exists track_id uuid references public.program_levels(id) on delete set null;

alter table public.program_chat_rooms drop constraint if exists program_chat_rooms_room_type_check;
alter table public.program_chat_rooms
  add constraint program_chat_rooms_room_type_check
  check (room_type in ('programme', 'programme_track'));

alter table public.program_chat_members
  add column if not exists joined_at timestamptz,
  add column if not exists left_at timestamptz,
  add column if not exists last_read_at timestamptz,
  add column if not exists notification_preference text not null default 'all';

update public.program_chat_members
set joined_at = coalesce(joined_at, created_at)
where joined_at is null;

alter table public.program_chat_members alter column joined_at set default now();
alter table public.program_chat_members alter column joined_at set not null;
alter table public.program_chat_members drop constraint if exists program_chat_members_notification_preference_check;
alter table public.program_chat_members
  add constraint program_chat_members_notification_preference_check
  check (notification_preference in ('all', 'mentions', 'muted'));

alter table public.program_chat_messages alter column sender_id drop not null;
alter table public.program_chat_messages
  add column if not exists client_message_id uuid,
  add column if not exists sender_display_name text,
  add column if not exists expires_at timestamptz;

update public.program_chat_messages
set client_message_id = coalesce(client_message_id, id),
    expires_at = coalesce(expires_at, created_at + interval '7 days')
where client_message_id is null or expires_at is null;

alter table public.program_chat_messages alter column expires_at set default (now() + interval '7 days');
alter table public.program_chat_messages alter column expires_at set not null;

alter table public.program_chat_messages drop constraint if exists program_chat_messages_message_type_check;
alter table public.program_chat_messages
  add constraint program_chat_messages_message_type_check
  check (message_type in ('text', 'image', 'system'));

alter table public.program_chat_messages drop constraint if exists program_chat_messages_sender_role_check;
alter table public.program_chat_messages
  add constraint program_chat_messages_sender_role_check
  check (sender_role is null or sender_role in ('admin', 'tutor', 'student', 'system'));

alter table public.program_chat_messages drop constraint if exists program_chat_messages_body_length_check;
alter table public.program_chat_messages
  add constraint program_chat_messages_body_length_check
  check (char_length(body) <= 2000);

create unique index if not exists program_chat_messages_sender_client_unique_idx
  on public.program_chat_messages(sender_id, client_message_id)
  where sender_id is not null and client_message_id is not null;

create index if not exists program_chat_messages_expires_idx
  on public.program_chat_messages(expires_at);

create index if not exists program_chat_members_user_room_read_idx
  on public.program_chat_members(user_id, room_id, active, last_read_at);

create or replace function public.chat_member_display_name(target_user_id uuid, target_role text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target_role = 'admin' then 'Admin'
    when target_role = 'tutor' then trim(concat(coalesce(nullif(profile.title, ''), 'Tutor'), ' ', split_part(coalesce(nullif(profile.full_name, ''), 'Tutor'), ' ', 1)))
    when target_role = 'student' then split_part(coalesce(nullif(profile.full_name, ''), 'Student'), ' ', 1)
    else 'Member'
  end
  from public.profiles profile
  where profile.id = target_user_id;
$$;

revoke all on function public.chat_member_display_name(uuid, text) from public;

create or replace function public.set_program_chat_message_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_role text;
begin
  new.expires_at := new.created_at + interval '7 days';

  if new.message_type = 'system' then
    new.sender_id := null;
    new.sender_role := 'system';
    new.sender_display_name := 'System';
    new.client_message_id := coalesce(new.client_message_id, gen_random_uuid());
    return new;
  end if;

  if new.sender_id is null then
    raise exception 'A sender is required.';
  end if;

  select role into resolved_role
  from public.user_roles
  where user_id = new.sender_id;

  if resolved_role not in ('admin', 'tutor', 'student') then
    raise exception 'The sender does not have classroom access.';
  end if;

  new.sender_role := resolved_role;
  new.sender_display_name := coalesce(public.chat_member_display_name(new.sender_id, resolved_role), initcap(resolved_role));
  new.client_message_id := coalesce(new.client_message_id, gen_random_uuid());
  return new;
end;
$$;

drop trigger if exists program_chat_messages_sender_role on public.program_chat_messages;
drop trigger if exists program_chat_messages_details on public.program_chat_messages;
create trigger program_chat_messages_details
  before insert on public.program_chat_messages
  for each row execute procedure public.set_program_chat_message_details();

update public.program_chat_messages message
set sender_display_name = case
  when message.message_type = 'system' then 'System'
  else coalesce(public.chat_member_display_name(message.sender_id, coalesce(message.sender_role, 'student')), initcap(coalesce(message.sender_role, 'student')))
end
where sender_display_name is null;

create or replace function public.is_eligible_for_program_chat(target_room_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_chat_rooms room
    join public.profiles profile on profile.id = target_user_id and profile.account_status = 'active'
    join public.user_roles role_record on role_record.user_id = target_user_id
    where room.id = target_room_id
      and room.active = true
      and (
        (role_record.role = 'admin' and target_user_id = auth.uid() and public.is_verified_admin_session())
        or (
          role_record.role = 'tutor'
          and exists (
            select 1 from public.tutor_program_assignments assignment
            where assignment.tutor_id = target_user_id
              and assignment.program_id = room.program_id
              and assignment.active = true
              and (assignment.track_id is null or room.track_id is null or assignment.track_id = room.track_id)
          )
        )
        or (
          role_record.role = 'student'
          and (
            exists (
              select 1 from public.enrolments enrolment
              where enrolment.user_id = target_user_id
                and enrolment.program_id = room.program_id
                and enrolment.status = 'active'
                and (room.track_id is null or enrolment.program_level_id = room.track_id)
            )
            or (
              not exists (
                select 1 from public.enrolments active_enrolment
                where active_enrolment.user_id = target_user_id
                  and active_enrolment.status = 'active'
              )
              and exists (
                select 1 from public.student_program_preferences preference
                where preference.user_id = target_user_id
                  and preference.program_id = room.program_id
                  and (room.track_id is null or preference.track_id is null or preference.track_id = room.track_id)
              )
            )
          )
        )
      )
  );
$$;

revoke all on function public.is_eligible_for_program_chat(uuid, uuid) from public;

create or replace function public.can_access_program_chat(room_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_verified_admin_session()
    or exists (
      select 1
      from public.program_chat_members member
      join public.profiles profile on profile.id = member.user_id
      where member.room_id = room_uuid
        and member.user_id = auth.uid()
        and member.active = true
        and member.left_at is null
        and profile.account_status = 'active'
        and public.is_eligible_for_program_chat(room_uuid, member.user_id)
    );
$$;

create or replace function public.can_read_program_chat_message(target_room_id uuid, message_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_verified_admin_session()
    or exists (
      select 1
      from public.program_chat_members member
      where member.room_id = target_room_id
        and member.user_id = auth.uid()
        and member.active = true
        and member.left_at is null
        and message_created_at >= member.joined_at
        and public.can_access_program_chat(target_room_id)
    );
$$;

revoke all on function public.can_read_program_chat_message(uuid, timestamptz) from public;

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

  insert into public.program_chat_rooms (program_id, title, active)
  values (selected_program.id, selected_program.title || ' Classroom', true)
  on conflict (program_id) do update
  set title = excluded.title, active = true, updated_at = now()
  returning id into target_room_id;

  with authorized_staff as (
    select role_record.user_id, 'admin'::text as role
    from public.user_roles role_record
    join public.profiles profile on profile.id = role_record.user_id and profile.account_status = 'active'
    where role_record.role = 'admin'
    union
    select role_record.user_id, 'tutor'::text as role
    from public.user_roles role_record
    join public.profiles profile on profile.id = role_record.user_id and profile.account_status = 'active'
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
    and (
      (member.role in ('admin', 'tutor') and not public.is_eligible_for_program_chat(target_room_id, member.user_id))
      or (member.role = 'student' and not public.is_eligible_for_program_chat(target_room_id, member.user_id))
    );

  return target_room_id;
end;
$$;

create or replace function public.get_programme_chat_access(
  target_program_id uuid default null,
  target_track_id uuid default null,
  target_room_id uuid default null
)
returns table (
  id uuid,
  program_id uuid,
  track_id uuid,
  title text,
  active boolean,
  program_title text,
  joined boolean,
  joined_at timestamptz,
  member_role text,
  last_read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select role into current_role from public.user_roles where user_id = current_user_id;
  if current_role not in ('admin', 'tutor', 'student') then
    raise exception 'Classroom access is not available.';
  end if;

  if current_role = 'admin' and not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  return query
  select room.id,
         room.program_id,
         room.track_id,
         room.title,
         room.active,
         program.title,
         coalesce(member.active and member.left_at is null, false),
         member.joined_at,
         member.role,
         member.last_read_at
  from public.program_chat_rooms room
  join public.programs program on program.id = room.program_id
  left join public.program_chat_members member
    on member.room_id = room.id and member.user_id = current_user_id
  where room.active = true
    and (target_program_id is null or room.program_id = target_program_id)
    and (target_track_id is null or room.track_id is null or room.track_id = target_track_id)
    and (target_room_id is null or room.id = target_room_id)
    and public.is_eligible_for_program_chat(room.id, current_user_id)
  order by program.title;
end;
$$;

revoke all on function public.get_programme_chat_access(uuid, uuid, uuid) from public;
grant execute on function public.get_programme_chat_access(uuid, uuid, uuid) to authenticated;

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
  if current_role <> 'student' then
    raise exception 'Only Students use Join Chat.';
  end if;
  if not public.is_account_active(current_user_id) then
    raise exception 'Your Student account must be active.';
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
    values (target_room_id, current_user_id, 'student', true, now(), null, now())
    on conflict (room_id, user_id) do update
    set role = 'student',
        active = true,
        joined_at = now(),
        left_at = null,
        last_read_at = now(),
        updated_at = now()
    returning * into membership;

    select split_part(coalesce(nullif(full_name, ''), 'Student'), ' ', 1)
    into first_name
    from public.profiles
    where id = current_user_id;

    insert into public.program_chat_messages (
      room_id, sender_id, message_type, sender_role, sender_display_name, body, client_message_id
    ) values (
      target_room_id, null, 'system', 'system', 'System', coalesce(first_name, 'Student') || ' joined the chat', gen_random_uuid()
    );
  end if;

  return query
  select target_room_id, membership.joined_at, true, was_joined;
end;
$$;

revoke all on function public.join_programme_chat(uuid) from public;
grant execute on function public.join_programme_chat(uuid) to authenticated;

create or replace function public.mark_program_chat_read(target_room_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  read_time timestamptz := now();
begin
  if not public.can_access_program_chat(target_room_id) then
    raise exception 'Classroom access is not available.';
  end if;

  update public.program_chat_members
  set last_read_at = read_time,
      updated_at = read_time
  where room_id = target_room_id
    and user_id = auth.uid()
    and active = true
    and left_at is null;

  return read_time;
end;
$$;

revoke all on function public.mark_program_chat_read(uuid) from public;
grant execute on function public.mark_program_chat_read(uuid) to authenticated;

create or replace function public.get_program_chat_unread_counts()
returns table (room_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select message.room_id,
         count(*)::bigint
  from public.program_chat_messages message
  join public.program_chat_members member
    on member.room_id = message.room_id
   and member.user_id = auth.uid()
   and member.active = true
   and member.left_at is null
  where public.is_account_active(auth.uid())
    and message.created_at >= member.joined_at
    and message.created_at > coalesce(member.last_read_at, member.joined_at)
    and message.sender_id is distinct from auth.uid()
    and message.deleted_for_moderation_at is null
    and message.expires_at > now()
  group by message.room_id;
$$;

revoke all on function public.get_program_chat_unread_counts() from public;
grant execute on function public.get_program_chat_unread_counts() to authenticated;

drop policy if exists "Users can read authorized chat rooms" on public.program_chat_rooms;
create policy "Eligible users can read classroom rooms"
  on public.program_chat_rooms for select to authenticated
  using (public.is_eligible_for_program_chat(id, auth.uid()));

drop policy if exists "Users can read own chat membership" on public.program_chat_members;
create policy "Users can read own active classroom membership"
  on public.program_chat_members for select to authenticated
  using (user_id = auth.uid() or public.is_verified_admin_session());

drop policy if exists "Users can read authorized chat messages" on public.program_chat_messages;
create policy "Members can read joined classroom history"
  on public.program_chat_messages for select to authenticated
  using (
    expires_at > now()
    and public.can_read_program_chat_message(room_id, created_at)
  );

drop policy if exists "Authorized users can send chat messages" on public.program_chat_messages;
create policy "Members can send classroom messages"
  on public.program_chat_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and message_type in ('text', 'image')
    and deleted_for_moderation_at is null
    and public.can_access_program_chat(room_id)
  );

-- ---------------------------------------------------------------------------
-- Reactions, attachment retention, and call state.
-- ---------------------------------------------------------------------------

create table if not exists public.program_chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.program_chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'helpful', 'celebrate')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, reaction)
);

alter table public.program_chat_reactions enable row level security;

drop policy if exists "Members can read classroom reactions" on public.program_chat_reactions;
create policy "Members can read classroom reactions"
  on public.program_chat_reactions for select to authenticated
  using (
    exists (
      select 1 from public.program_chat_messages message
      where message.id = program_chat_reactions.message_id
        and message.deleted_for_moderation_at is null
        and public.can_read_program_chat_message(message.room_id, message.created_at)
    )
  );

create or replace function public.toggle_program_chat_reaction(target_message_id uuid, reaction_value text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_message public.program_chat_messages;
begin
  if reaction_value not in ('like', 'helpful', 'celebrate') then
    raise exception 'Select an approved reaction.';
  end if;

  select * into target_message
  from public.program_chat_messages
  where id = target_message_id;

  if target_message.id is null
     or target_message.deleted_for_moderation_at is not null
     or target_message.expires_at <= now()
     or not public.can_read_program_chat_message(target_message.room_id, target_message.created_at) then
    raise exception 'This message is not available.';
  end if;

  if exists (
    select 1 from public.program_chat_reactions
    where message_id = target_message_id and user_id = auth.uid() and reaction = reaction_value
  ) then
    delete from public.program_chat_reactions
    where message_id = target_message_id and user_id = auth.uid() and reaction = reaction_value;
    return false;
  end if;

  insert into public.program_chat_reactions (message_id, user_id, reaction)
  values (target_message_id, auth.uid(), reaction_value)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.toggle_program_chat_reaction(uuid, text) from public;
grant execute on function public.toggle_program_chat_reaction(uuid, text) to authenticated;

alter table public.message_attachments
  add column if not exists room_id uuid references public.program_chat_rooms(id) on delete cascade,
  add column if not exists expires_at timestamptz;

update public.message_attachments attachment
set room_id = message.room_id,
    expires_at = message.expires_at
from public.program_chat_messages message
where message.id = attachment.message_id
  and (attachment.room_id is null or attachment.expires_at is null);

create or replace function public.set_chat_attachment_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select message.room_id, message.expires_at
  into new.room_id, new.expires_at
  from public.program_chat_messages message
  where message.id = new.message_id;

  if new.room_id is null or new.expires_at is null then
    raise exception 'The classroom message could not be found.';
  end if;
  return new;
end;
$$;

drop trigger if exists message_attachments_details on public.message_attachments;
create trigger message_attachments_details
  before insert on public.message_attachments
  for each row execute procedure public.set_chat_attachment_details();

create index if not exists message_attachments_expires_idx
  on public.message_attachments(expires_at);

drop policy if exists "Authorized users can read message attachments" on public.message_attachments;
create policy "Members can read joined classroom attachments"
  on public.message_attachments for select to authenticated
  using (
    expires_at > now()
    and exists (
      select 1 from public.program_chat_messages message
      where message.id = message_attachments.message_id
        and public.can_read_program_chat_message(message.room_id, message.created_at)
    )
  );

create table if not exists public.chat_calls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.program_chat_rooms(id) on delete cascade,
  started_by uuid references auth.users(id) on delete set null,
  call_type text not null default 'voice' check (call_type in ('voice')),
  provider text not null default 'daily',
  provider_room_name text,
  provider_room_url text,
  status text not null default 'ringing' check (status in ('ringing', 'live', 'ended', 'failed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_calls_one_active_room_idx
  on public.chat_calls(room_id)
  where status in ('ringing', 'live');

create table if not exists public.chat_call_participants (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.chat_calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  role text not null check (role in ('host', 'participant', 'moderator')),
  created_at timestamptz not null default now(),
  unique (call_id, user_id)
);

alter table public.chat_calls enable row level security;
alter table public.chat_call_participants enable row level security;

create policy "Members can read classroom call state"
  on public.chat_calls for select to authenticated
  using (public.can_access_program_chat(room_id));

create policy "Members can read classroom call participants"
  on public.chat_call_participants for select to authenticated
  using (
    exists (
      select 1 from public.chat_calls call
      where call.id = chat_call_participants.call_id
        and public.can_access_program_chat(call.room_id)
    )
  );

create index if not exists chat_calls_room_status_idx on public.chat_calls(room_id, status, created_at desc);
create index if not exists chat_call_participants_call_idx on public.chat_call_participants(call_id, joined_at);

-- Notify joined members once per committed non-system message.
create or replace function public.notify_program_chat_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message_type = 'system' then
    return new;
  end if;

  insert into public.portal_notifications (user_id, title, message, notification_type, link_path)
  select member.user_id,
         'New classroom message',
         coalesce(new.sender_display_name, 'A classroom member') || ' sent a message.',
         'classroom_message',
         case when member.role = 'tutor' then '/tutor/classroom/chat' else '/portal/classroom/chat' end
  from public.program_chat_members member
  where member.room_id = new.room_id
    and member.active = true
    and member.left_at is null
    and member.user_id is distinct from new.sender_id
    and member.notification_preference <> 'muted';

  return new;
end;
$$;

drop trigger if exists program_chat_messages_notify_members on public.program_chat_messages;
create trigger program_chat_messages_notify_members
  after insert on public.program_chat_messages
  for each row execute procedure public.notify_program_chat_members();

-- Broadcast committed room changes. The private topic is authorized below.
create or replace function public.broadcast_program_chat_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  target_room_id uuid;
begin
  if tg_table_name = 'program_chat_messages' then
    target_room_id := coalesce(new.room_id, old.room_id);
  elsif tg_table_name = 'program_chat_reactions' then
    select room_id into target_room_id
    from public.program_chat_messages
    where id = coalesce(new.message_id, old.message_id);
  elsif tg_table_name = 'chat_calls' then
    target_room_id := coalesce(new.room_id, old.room_id);
  end if;

  if target_room_id is not null then
    perform realtime.broadcast_changes(
      'chat-room:' || target_room_id::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists program_chat_messages_broadcast on public.program_chat_messages;
create trigger program_chat_messages_broadcast
  after insert or update or delete on public.program_chat_messages
  for each row execute procedure public.broadcast_program_chat_change();

drop trigger if exists program_chat_reactions_broadcast on public.program_chat_reactions;
create trigger program_chat_reactions_broadcast
  after insert or delete on public.program_chat_reactions
  for each row execute procedure public.broadcast_program_chat_change();

drop trigger if exists chat_calls_broadcast on public.chat_calls;
create trigger chat_calls_broadcast
  after insert or update or delete on public.chat_calls
  for each row execute procedure public.broadcast_program_chat_change();

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "Classroom members receive private room events" on realtime.messages';
    execute 'create policy "Classroom members receive private room events" on realtime.messages for select to authenticated using (topic like ''chat-room:%'' and public.can_access_program_chat(substring(topic from 11)::uuid))';
    execute 'drop policy if exists "Classroom members send temporary room events" on realtime.messages';
    execute 'create policy "Classroom members send temporary room events" on realtime.messages for insert to authenticated with check (topic like ''chat-room:%'' and public.can_access_program_chat(substring(topic from 11)::uuid))';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- No free Zentel AI trials. Historical records remain intact.
-- ---------------------------------------------------------------------------

update public.ai_system_settings
set trial_enabled = false,
    trial_credits = 0,
    updated_at = now()
where id = 1;

create or replace function public.ai_claim_trial()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Zentel AI does not offer free trials. Choose a paid plan to continue.';
end;
$$;

revoke all on function public.ai_claim_trial() from public, anon, authenticated;

-- Keep ordinary ledger protections and financial history unchanged.
