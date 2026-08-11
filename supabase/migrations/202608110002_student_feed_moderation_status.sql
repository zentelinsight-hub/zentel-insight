create schema if not exists private;

create table if not exists private.student_feed_moderation_audit (
  id bigint generated always as identity primary key,
  post_id uuid not null,
  author_user_id uuid not null,
  moderator_user_id uuid not null,
  action text not null check (action in ('hidden')),
  previous_status text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

revoke all on table private.student_feed_moderation_audit from public, anon, authenticated;

create table if not exists public.student_feed_refresh_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.student_feed_refresh_events enable row level security;
revoke insert, update, delete on public.student_feed_refresh_events from anon, authenticated;
grant select on public.student_feed_refresh_events to authenticated;

drop policy if exists "Active portal users receive feed refresh events" on public.student_feed_refresh_events;
create policy "Active portal users receive feed refresh events"
  on public.student_feed_refresh_events for select
  to authenticated
  using (public.is_account_active((select auth.uid())));

create or replace function public.signal_student_feed_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'profiles' and not exists (
    select 1 from public.user_roles
    where user_id = new.id and role::text = 'student'
  ) then
    return new;
  end if;
  insert into public.student_feed_refresh_events default values;
  delete from public.student_feed_refresh_events where created_at < now() - interval '7 days';
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.signal_student_feed_refresh() from public, anon, authenticated;

drop trigger if exists student_feed_posts_signal_refresh on public.student_feed_posts;
create trigger student_feed_posts_signal_refresh
  after insert or update or delete on public.student_feed_posts
  for each row execute function public.signal_student_feed_refresh();

drop trigger if exists student_profile_signal_feed_refresh on public.profiles;
create trigger student_profile_signal_feed_refresh
  after update of account_status, full_name, avatar_path on public.profiles
  for each row
  when (
    old.account_status is distinct from new.account_status
    or old.full_name is distinct from new.full_name
    or old.avatar_path is distinct from new.avatar_path
  )
  execute function public.signal_student_feed_refresh();

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
        and author_role.role::text = 'student'
        and btrim(coalesce(author.full_name, '')) <> ''
    )
  );

drop policy if exists "Students can update their feed posts" on public.student_feed_posts;

drop policy if exists "Students can delete their feed posts" on public.student_feed_posts;
create policy "Active Students can delete their feed posts"
  on public.student_feed_posts for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_account_active((select auth.uid()))
    and exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role::text = 'student'
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
  select
    post.id,
    post.user_id,
    post.body,
    post.image_path,
    post.created_at,
    btrim(regexp_replace(author.full_name, '\s+', ' ', 'g')),
    author.avatar_path
  from public.student_feed_posts post
  join public.profiles author
    on author.id = post.user_id
   and author.account_status = 'active'
   and btrim(coalesce(author.full_name, '')) <> ''
  join public.user_roles author_role
    on author_role.user_id = author.id
   and author_role.role::text = 'student'
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

revoke all on function public.get_student_feed_posts(integer, timestamptz, uuid) from public, anon;
grant execute on function public.get_student_feed_posts(integer, timestamptz, uuid) to authenticated;

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
  join public.user_roles author_role on author_role.user_id = author.id and author_role.role::text = 'student'
  order by post.created_at desc, post.id desc
  limit least(greatest(coalesce(page_size, 100), 1), 200);
end;
$$;

revoke all on function public.admin_list_student_feed_posts(integer) from public, anon;
grant execute on function public.admin_list_student_feed_posts(integer) to authenticated;

create or replace function public.admin_moderate_student_feed_post(target_post_id uuid, moderation_reason text)
returns public.student_feed_posts
language plpgsql
security definer
set search_path = public, private
as $$
declare
  selected_post public.student_feed_posts;
  clean_reason text := btrim(coalesce(moderation_reason, ''));
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;
  if char_length(clean_reason) < 4 or char_length(clean_reason) > 500 then
    raise exception 'Enter a moderation reason between 4 and 500 characters.';
  end if;

  select * into selected_post from public.student_feed_posts where id = target_post_id for update;
  if selected_post.id is null then
    raise exception 'Student post was not found.';
  end if;
  if selected_post.status = 'hidden' then
    return selected_post;
  end if;

  insert into private.student_feed_moderation_audit (
    post_id, author_user_id, moderator_user_id, action, previous_status, reason
  ) values (
    selected_post.id, selected_post.user_id, auth.uid(), 'hidden', selected_post.status, clean_reason
  );

  update public.student_feed_posts
  set status = 'hidden', updated_at = now()
  where id = selected_post.id
  returning * into selected_post;

  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'student_feed_post_hidden', 'student_feed_posts', selected_post.id,
          jsonb_build_object('reason', clean_reason));
  return selected_post;
end;
$$;

revoke all on function public.admin_moderate_student_feed_post(uuid, text) from public, anon;
grant execute on function public.admin_moderate_student_feed_post(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_feed_refresh_events'
     ) then
    alter publication supabase_realtime add table public.student_feed_refresh_events;
  end if;
end $$;

notify pgrst, 'reload schema';
