-- Route older frontend bundles through the exact classroom-scoped resolver.

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
language sql
stable
security definer
set search_path = public
as $$
  select
    access.id,
    access.program_id,
    access.track_id,
    access.title,
    access.active,
    access.program_title,
    access.joined,
    access.joined_at,
    access.member_role,
    access.last_read_at
  from public.get_classroom_chat_access(
    target_program_id,
    target_track_id,
    null,
    target_room_id
  ) access;
$$;

revoke all on function public.get_programme_chat_access(uuid, uuid, uuid) from public;
grant execute on function public.get_programme_chat_access(uuid, uuid, uuid) to authenticated;

