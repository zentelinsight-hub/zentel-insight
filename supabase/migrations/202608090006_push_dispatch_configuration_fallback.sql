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
  project_url := coalesce(nullif(project_url, ''), nullif(current_setting('app.settings.supabase_url', true), ''));
  service_key := coalesce(nullif(service_key, ''), nullif(current_setting('app.settings.service_role_key', true), ''));

  if project_url is not null and service_key is not null then
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
