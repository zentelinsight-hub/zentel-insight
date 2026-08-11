insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.update_own_profile_avatar(next_avatar_path text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user_id uuid := auth.uid();
  clean_path text := btrim(coalesce(next_avatar_path, ''));
  saved_profile public.profiles;
begin
  if active_user_id is null or not public.is_account_active(active_user_id) then
    raise exception 'An active Portal account is required.';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = active_user_id and role::text in ('student', 'tutor', 'staff')
  ) then
    raise exception 'This account cannot use the self-service profile picture action.';
  end if;
  if clean_path = '' or split_part(clean_path, '/', 1) <> active_user_id::text then
    raise exception 'The profile picture path is invalid.';
  end if;

  update public.profiles
  set avatar_path = clean_path,
      updated_at = now()
  where id = active_user_id
  returning * into saved_profile;

  if saved_profile.id is null then
    raise exception 'The Portal profile was not found.';
  end if;
  return saved_profile;
end;
$$;

revoke all on function public.update_own_profile_avatar(text) from public;
grant execute on function public.update_own_profile_avatar(text) to authenticated;

drop policy if exists "Portal users can upload own profile avatars" on storage.objects;
create policy "Portal users can upload own profile avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_account_active((select auth.uid()))
    and exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role::text in ('student', 'tutor', 'staff')
    )
  );

drop policy if exists "Portal users can update own profile avatars" on storage.objects;
create policy "Portal users can update own profile avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_account_active((select auth.uid()))
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_account_active((select auth.uid()))
  );

drop policy if exists "Portal users can delete own profile avatars" on storage.objects;
create policy "Portal users can delete own profile avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_account_active((select auth.uid()))
  );
