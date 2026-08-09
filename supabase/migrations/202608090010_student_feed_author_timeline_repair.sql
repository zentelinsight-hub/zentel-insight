-- Hydrate published Student posts from the authoritative profile relationship.
-- The function exposes only the public feed identity fields required by active
-- portal users and keeps chronological pagination stable with an ID tie-breaker.

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
  if auth.uid() is null or not exists (
    select 1
    from public.profiles viewer
    where viewer.id = auth.uid()
      and viewer.account_status = 'active'
  ) then
    raise exception 'Active portal access is required.';
  end if;

  return query
  select
    post.id,
    post.user_id,
    post.body,
    post.image_path,
    post.created_at as published_at,
    coalesce(
      nullif(
        concat_ws(
          ' ',
          nullif(split_part(regexp_replace(btrim(author.full_name), '\s+', ' ', 'g'), ' ', 1), ''),
          nullif(split_part(regexp_replace(btrim(author.full_name), '\s+', ' ', 'g'), ' ', 2), '')
        ),
        ''
      ),
      'Learner'
    ) as author_name,
    author.avatar_path as author_avatar_path
  from public.student_feed_posts post
  join public.profiles author on author.id = post.user_id
  join public.user_roles author_role
    on author_role.user_id = author.id
   and author_role.role = 'student'
  where post.status = 'published'
    and (
      before_published_at is null
      or post.created_at < before_published_at
      or (
        post.created_at = before_published_at
        and before_post_id is not null
        and post.id < before_post_id
      )
    )
  order by post.created_at desc, post.id desc
  limit safe_page_size;
end;
$$;

revoke all on function public.get_student_feed_posts(integer, timestamptz, uuid) from public, anon;
grant execute on function public.get_student_feed_posts(integer, timestamptz, uuid) to authenticated;

drop policy if exists "Active portal users can read profile avatars" on storage.objects;
create policy "Active portal users can read profile avatars"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.account_status = 'active'
    )
  );

create index if not exists student_feed_posts_timeline_idx
  on public.student_feed_posts(status, created_at desc, id desc);

notify pgrst, 'reload schema';
