create extension if not exists pg_net;
create extension if not exists supabase_vault;

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0
);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.web_push_subscriptions;
create policy "Users can read own push subscriptions"
  on public.web_push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create table if not exists public.push_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.portal_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (notification_id, user_id)
);

alter table public.push_notification_outbox enable row level security;
revoke all on public.push_notification_outbox from public, anon, authenticated;

create index if not exists push_notification_outbox_pending_idx
  on public.push_notification_outbox(status, available_at, created_at);
create index if not exists web_push_subscriptions_user_enabled_idx
  on public.web_push_subscriptions(user_id, enabled);

create or replace function public.save_my_push_subscription(
  endpoint_value text,
  p256dh_value text,
  auth_value text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare subscription_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if endpoint_value !~ '^https://' or length(endpoint_value) > 2048 then raise exception 'A valid push endpoint is required.'; end if;
  if length(p256dh_value) not between 40 and 512 or length(auth_value) not between 8 and 256 then raise exception 'Valid push subscription keys are required.'; end if;

  insert into public.web_push_subscriptions(user_id, endpoint, p256dh, auth_secret, enabled, updated_at, failure_count)
  values (auth.uid(), endpoint_value, p256dh_value, auth_value, true, now(), 0)
  on conflict (endpoint) do update
  set user_id = auth.uid(),
      p256dh = excluded.p256dh,
      auth_secret = excluded.auth_secret,
      enabled = true,
      updated_at = now(),
      failure_count = 0
  returning id into subscription_id;

  return subscription_id;
end;
$$;

create or replace function public.disable_my_push_subscription(endpoint_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  update public.web_push_subscriptions
  set enabled = false, updated_at = now()
  where user_id = auth.uid() and endpoint = endpoint_value;
end;
$$;

revoke all on function public.save_my_push_subscription(text, text, text) from public;
revoke all on function public.disable_my_push_subscription(text) from public;
grant execute on function public.save_my_push_subscription(text, text, text) to authenticated;
grant execute on function public.disable_my_push_subscription(text) to authenticated;

create or replace function public.enqueue_portal_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.web_push_subscriptions subscription
    where subscription.user_id = new.user_id and subscription.enabled
  ) then
    insert into public.push_notification_outbox(notification_id, user_id)
    values (new.id, new.user_id)
    on conflict (notification_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists portal_notifications_enqueue_push on public.portal_notifications;
create trigger portal_notifications_enqueue_push
  after insert on public.portal_notifications
  for each row execute procedure public.enqueue_portal_notification_push();

-- Invoke the dispatcher when project URL/service credentials are present in Vault.
-- The key is read only inside this definer function and is never returned or logged.
create or replace function public.request_push_outbox_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name in ('project_url', 'supabase_url') order by name limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name in ('service_role_key', 'supabase_service_role_key') order by name limit 1;
  if nullif(project_url, '') is not null and nullif(service_key, '') is not null then
    perform net.http_post(
      url := rtrim(project_url, '/') || '/functions/v1/dispatch-push-notifications',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
      body := jsonb_build_object('outboxId', new.id),
      timeout_milliseconds := 5000
    );
  end if;
  return new;
end;
$$;

revoke all on function public.request_push_outbox_dispatch() from public, anon, authenticated;
drop trigger if exists push_outbox_request_dispatch on public.push_notification_outbox;
create trigger push_outbox_request_dispatch
  after insert on public.push_notification_outbox
  for each row execute procedure public.request_push_outbox_dispatch();

notify pgrst, 'reload schema';
