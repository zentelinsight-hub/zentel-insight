alter table public.technology_feed_items
  add column if not exists source_icon_url text,
  add column if not exists source_domain text;

notify pgrst, 'reload schema';
