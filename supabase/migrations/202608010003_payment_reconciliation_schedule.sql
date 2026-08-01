-- Private scheduled payment reconciliation. The shared credential is written
-- after deployment by the reconciliation Edge Function using service_role.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.payment_reconciliation_config (
  singleton boolean primary key default true check (singleton),
  secret_value text not null check (length(secret_value) >= 40),
  configured_at timestamptz not null default now()
);

revoke all on private.payment_reconciliation_config from public, anon, authenticated;

create or replace function public.configure_payment_reconciliation_schedule(schedule_secret text)
returns bigint
language plpgsql
security definer
set search_path = public, private, cron, extensions
as $$
declare
  scheduled_job_id bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role is required.'; end if;
  if coalesce(length(schedule_secret), 0) < 40 then raise exception 'A strong reconciliation credential is required.'; end if;

  insert into private.payment_reconciliation_config (singleton, secret_value, configured_at)
  values (true, schedule_secret, now())
  on conflict (singleton) do update set secret_value = excluded.secret_value, configured_at = now();

  perform cron.unschedule(jobid) from cron.job where jobname = 'zentel-payment-reconciliation';
  select cron.schedule(
    'zentel-payment-reconciliation',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := 'https://auzbmfwdxprtvjsvcxcj.supabase.co/functions/v1/reconcile-payments',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-reconciliation-secret', (select secret_value from private.payment_reconciliation_config where singleton = true)
        ),
        body := '{"dryRun":false,"limit":50}'::jsonb,
        timeout_milliseconds := 50000
      );
    $job$
  ) into scheduled_job_id;

  return scheduled_job_id;
end;
$$;

revoke all on function public.configure_payment_reconciliation_schedule(text) from public, anon, authenticated;
grant execute on function public.configure_payment_reconciliation_schedule(text) to service_role;

notify pgrst, 'reload schema';
