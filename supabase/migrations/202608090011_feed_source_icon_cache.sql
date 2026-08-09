-- Source icons are resolved by the feed Edge Function and cached by domain.
-- Browser clients receive only the validated cached URL stored on feed items.

create table if not exists public.technology_source_icons (
  domain text primary key,
  source_origin text not null,
  icon_url text,
  content_type text,
  resolution_status text not null default 'resolved'
    check (resolution_status in ('resolved', 'missing')),
  resolved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint technology_source_icons_domain_check
    check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+$'),
  constraint technology_source_icons_url_check
    check (icon_url is null or icon_url ~ '^https?://')
);

alter table public.technology_source_icons enable row level security;
revoke all on table public.technology_source_icons from public, anon, authenticated;
grant select, insert, update on table public.technology_source_icons to service_role;

create index if not exists technology_source_icons_expiry_idx
  on public.technology_source_icons(expires_at);

update public.technology_feed_items
set source_icon_url = 'https://www.youtube.com/favicon.ico',
    source_domain = 'youtube.com'
where source_type = 'youtube';

notify pgrst, 'reload schema';
