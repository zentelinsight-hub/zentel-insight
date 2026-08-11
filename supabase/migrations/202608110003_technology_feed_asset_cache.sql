insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'technology-feed-assets',
  'technology-feed-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/x-icon', 'image/vnd.microsoft.icon']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Force legacy external icon cache rows through the new managed-asset resolver.
update public.technology_source_icons
set expires_at = now()
where icon_url is null
   or icon_url not like '%/storage/v1/object/public/technology-feed-assets/%';

notify pgrst, 'reload schema';
