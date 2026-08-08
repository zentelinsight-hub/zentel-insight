begin;

create table if not exists public.student_feed_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  image_path text,
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_feed_posts_body_length check (char_length(btrim(body)) between 1 and 3000)
);

create index if not exists student_feed_posts_status_created_idx
  on public.student_feed_posts(status, created_at desc);
create index if not exists student_feed_posts_user_created_idx
  on public.student_feed_posts(user_id, created_at desc);

alter table public.student_feed_posts enable row level security;

drop policy if exists "Active portal users can read published feed posts" on public.student_feed_posts;
create policy "Active portal users can read published feed posts"
  on public.student_feed_posts for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.account_status = 'active'
    )
  );

drop policy if exists "Active Students can publish feed posts" on public.student_feed_posts;
create policy "Active Students can publish feed posts"
  on public.student_feed_posts for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'published'
    and exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.id
      where p.id = (select auth.uid())
        and p.account_status = 'active'
        and ur.role = 'student'
    )
  );

drop policy if exists "Students can update their feed posts" on public.student_feed_posts;
create policy "Students can update their feed posts"
  on public.student_feed_posts for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Students can delete their feed posts" on public.student_feed_posts;
create policy "Students can delete their feed posts"
  on public.student_feed_posts for delete
  to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-feed-media', 'student-feed-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Portal users can view feed media" on storage.objects;
create policy "Portal users can view feed media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'student-feed-media');

drop policy if exists "Students can upload their feed media" on storage.objects;
create policy "Students can upload their feed media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'student-feed-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.id
      where p.id = (select auth.uid())
        and p.account_status = 'active'
        and ur.role = 'student'
    )
  );

drop policy if exists "Students can remove their feed media" on storage.objects;
create policy "Students can remove their feed media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'student-feed-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'student_feed_posts'
  ) then
    alter publication supabase_realtime add table public.student_feed_posts;
  end if;
end $$;

commit;
