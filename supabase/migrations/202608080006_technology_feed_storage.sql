create table if not exists public.technology_feed_items (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  source_type text not null check (source_type in ('newsdata', 'youtube')),
  source_name text not null,
  title text not null,
  summary text not null default '',
  category text not null default 'Technology',
  image_url text,
  external_url text not null,
  published_at timestamptz not null,
  imported_at timestamptz not null default now(),
  active boolean not null default true
);

create index if not exists technology_feed_items_published_idx
  on public.technology_feed_items(active, published_at desc);

alter table public.technology_feed_items enable row level security;

drop policy if exists "Active portal users read technology feed" on public.technology_feed_items;
create policy "Active portal users read technology feed"
  on public.technology_feed_items for select to authenticated
  using (
    active
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.account_status = 'active'
    )
  );

revoke insert, update, delete on public.technology_feed_items from anon, authenticated;
grant select on public.technology_feed_items to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'technology_feed_items'
  ) then
    alter publication supabase_realtime add table public.technology_feed_items;
  end if;
end $$;
