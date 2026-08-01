-- Keep immutable ledger history independent from disposable Auth and AI content.
alter table public.ai_credit_ledger drop constraint if exists ai_credit_ledger_user_id_fkey;
alter table public.ai_credit_ledger drop constraint if exists ai_credit_ledger_subscription_id_fkey;
alter table public.ai_credit_ledger drop constraint if exists ai_credit_ledger_conversation_id_fkey;
alter table public.ai_credit_ledger drop constraint if exists ai_credit_ledger_request_id_fkey;

comment on column public.ai_credit_ledger.user_id is
  'Immutable historical Auth user UUID. Intentionally not a foreign key so Auth deletion cannot mutate ledger history.';
comment on column public.ai_credit_ledger.subscription_id is
  'Immutable historical subscription UUID. Intentionally not a foreign key.';
comment on column public.ai_credit_ledger.conversation_id is
  'Immutable historical conversation UUID. Intentionally not a foreign key.';
comment on column public.ai_credit_ledger.request_id is
  'Immutable historical request UUID. Intentionally not a foreign key.';

-- Preserve financial history while allowing the live Auth relationship to be cleared.
alter table public.ai_subscriptions add column if not exists historical_user_id uuid;
update public.ai_subscriptions
set historical_user_id = user_id
where historical_user_id is null;
alter table public.ai_subscriptions alter column historical_user_id set not null;
alter table public.ai_subscriptions drop constraint if exists ai_subscriptions_user_id_fkey;
alter table public.ai_subscriptions alter column user_id drop not null;
alter table public.ai_subscriptions
  add constraint ai_subscriptions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.ai_topup_purchases add column if not exists historical_user_id uuid;
update public.ai_topup_purchases
set historical_user_id = user_id
where historical_user_id is null;
alter table public.ai_topup_purchases alter column historical_user_id set not null;
alter table public.ai_topup_purchases drop constraint if exists ai_topup_purchases_user_id_fkey;
alter table public.ai_topup_purchases alter column user_id drop not null;
alter table public.ai_topup_purchases
  add constraint ai_topup_purchases_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

create or replace function public.preserve_ai_historical_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.historical_user_id := coalesce(new.historical_user_id, new.user_id);
  else
    new.historical_user_id := old.historical_user_id;
  end if;
  if new.historical_user_id is null then
    raise exception 'A historical user identifier is required.';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_subscriptions_preserve_historical_user on public.ai_subscriptions;
create trigger ai_subscriptions_preserve_historical_user
  before insert or update on public.ai_subscriptions
  for each row execute procedure public.preserve_ai_historical_user_id();

drop trigger if exists ai_topup_purchases_preserve_historical_user on public.ai_topup_purchases;
create trigger ai_topup_purchases_preserve_historical_user
  before insert or update on public.ai_topup_purchases
  for each row execute procedure public.preserve_ai_historical_user_id();

revoke all on function public.preserve_ai_historical_user_id() from public, anon, authenticated;

-- The normal ledger guard remains absolute. Only a service-role cleanup RPC can
-- set a transaction-local marker for DELETEs belonging to one verified smoke UUID.
create or replace function public.prevent_ai_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
    and auth.role() = 'service_role'
    and current_setting('app.ai_ledger_maintenance_mode', true) = 'zentel_smoke_cleanup'
    and current_setting('app.ai_ledger_maintenance_user_id', true) = old.user_id::text
  then
    return old;
  end if;
  raise exception 'Credit ledger entries are immutable.';
end;
$$;

revoke all on function public.prevent_ai_ledger_mutation() from public, anon, authenticated;

create table if not exists public.zentel_smoke_cleanup_audit (
  user_id uuid primary key,
  email_hash text not null,
  records_report jsonb not null default '{}'::jsonb,
  cleanup_started_at timestamptz not null default now(),
  auth_deleted_at timestamptz
);

alter table public.zentel_smoke_cleanup_audit enable row level security;
revoke all on table public.zentel_smoke_cleanup_audit from public, anon, authenticated;

create or replace function public.maintain_zentel_smoke_account(
  target_user_id uuid,
  expected_email text,
  perform_cleanup boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := lower(btrim(coalesce(expected_email, '')));
  actual_email text;
  profile_email text;
  account_role text;
  report jsonb;
  email_digest text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role maintenance authorization is required.' using errcode = '42501';
  end if;
  if target_user_id is null then
    raise exception 'An explicit smoke-test user UUID is required.';
  end if;
  if normalized_email !~ '^zentel-ai-smoke-[0-9]+@example[.]com$' then
    raise exception 'The email is not an approved Zentel AI smoke-test address.';
  end if;

  email_digest := encode(digest(normalized_email, 'sha256'), 'hex');
  select lower(email) into actual_email from auth.users where id = target_user_id;
  if actual_email is null then
    if exists (
      select 1 from public.zentel_smoke_cleanup_audit
      where user_id = target_user_id and email_hash = email_digest
    ) then
      return jsonb_build_object('ok', true, 'already_cleaned', true, 'user_id', target_user_id);
    end if;
    raise exception 'The explicit Auth user does not exist.';
  end if;
  if actual_email <> normalized_email then
    raise exception 'The Auth email does not match the explicitly confirmed smoke-test email.';
  end if;

  select lower(email) into profile_email from public.profiles where id = target_user_id;
  if profile_email is distinct from normalized_email then
    raise exception 'The profile email does not match the confirmed smoke-test email.';
  end if;
  select lower(role::text) into account_role from public.user_roles where user_id = target_user_id;
  account_role := coalesce(account_role, 'student');
  if account_role <> 'student' then
    raise exception 'Tutor and Admin accounts cannot use smoke-test cleanup.';
  end if;
  if exists (select 1 from public.tutor_profiles where user_id = target_user_id)
    or exists (select 1 from public.tutor_program_assignments where tutor_id = target_user_id)
  then
    raise exception 'Tutor records exist; cleanup is refused.';
  end if;
  if exists (select 1 from public.enrolments where user_id = target_user_id) then
    raise exception 'Student enrolments exist; cleanup is refused.';
  end if;
  if exists (
    select 1 from public.payments
    where user_id = target_user_id
      and (status = 'success' or verification_status = 'verified')
  ) then
    raise exception 'Verified financial records exist; cleanup is refused.';
  end if;

  report := jsonb_build_object(
    'profiles', (select count(*) from public.profiles where id = target_user_id),
    'user_roles', (select count(*) from public.user_roles where user_id = target_user_id),
    'enrolments', (select count(*) from public.enrolments where user_id = target_user_id),
    'payments', (select count(*) from public.payments where user_id = target_user_id),
    'ai_subscriptions', (select count(*) from public.ai_subscriptions where user_id = target_user_id or historical_user_id = target_user_id),
    'ai_credit_wallets', (select count(*) from public.ai_credit_wallets where user_id = target_user_id),
    'ai_topup_purchases', (select count(*) from public.ai_topup_purchases where user_id = target_user_id or historical_user_id = target_user_id),
    'ai_credit_lots', (select count(*) from public.ai_credit_lots where user_id = target_user_id),
    'ai_conversations', (select count(*) from public.ai_conversations where user_id = target_user_id),
    'ai_requests', (select count(*) from public.ai_requests where user_id = target_user_id),
    'ai_messages', (select count(*) from public.ai_messages where user_id = target_user_id),
    'ai_attachments', (select count(*) from public.ai_attachments where user_id = target_user_id),
    'ai_credit_ledger', (select count(*) from public.ai_credit_ledger where user_id = target_user_id),
    'ai_trial_claims', (select count(*) from public.ai_trial_claims where user_id = target_user_id)
  );

  if not perform_cleanup then
    return jsonb_build_object('ok', true, 'eligible', true, 'user_id', target_user_id, 'records', report);
  end if;

  perform set_config('app.ai_ledger_maintenance_mode', 'zentel_smoke_cleanup', true);
  perform set_config('app.ai_ledger_maintenance_user_id', target_user_id::text, true);
  delete from public.ai_credit_ledger where user_id = target_user_id;
  perform set_config('app.ai_ledger_maintenance_mode', '', true);
  perform set_config('app.ai_ledger_maintenance_user_id', '', true);

  delete from public.ai_attachments where user_id = target_user_id;
  delete from public.ai_messages where user_id = target_user_id;
  delete from public.ai_requests where user_id = target_user_id;
  delete from public.ai_conversations where user_id = target_user_id;
  delete from public.ai_trial_claims where user_id = target_user_id;
  delete from public.ai_credit_lots where user_id = target_user_id;
  delete from public.ai_topup_purchases where user_id = target_user_id or historical_user_id = target_user_id;
  delete from public.ai_subscriptions where user_id = target_user_id or historical_user_id = target_user_id;
  delete from public.ai_credit_wallets where user_id = target_user_id;
  delete from public.payments where user_id = target_user_id;

  insert into public.zentel_smoke_cleanup_audit (user_id, email_hash, records_report, cleanup_started_at)
  values (target_user_id, email_digest, report, now())
  on conflict (user_id) do update
  set records_report = excluded.records_report,
      cleanup_started_at = excluded.cleanup_started_at;

  return jsonb_build_object('ok', true, 'eligible', true, 'cleaned', true, 'user_id', target_user_id, 'records', report);
end;
$$;

create or replace function public.mark_zentel_smoke_auth_deleted(
  target_user_id uuid,
  expected_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  email_digest text := encode(digest(lower(btrim(coalesce(expected_email, ''))), 'sha256'), 'hex');
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role maintenance authorization is required.' using errcode = '42501';
  end if;
  update public.zentel_smoke_cleanup_audit
  set auth_deleted_at = coalesce(auth_deleted_at, now())
  where user_id = target_user_id and email_hash = email_digest;
  if not found then raise exception 'No matching smoke cleanup audit exists.'; end if;
  return jsonb_build_object('ok', true, 'user_id', target_user_id, 'auth_deleted', true);
end;
$$;

revoke all on function public.maintain_zentel_smoke_account(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.mark_zentel_smoke_auth_deleted(uuid, text) from public, anon, authenticated;
grant execute on function public.maintain_zentel_smoke_account(uuid, text, boolean) to service_role;
grant execute on function public.mark_zentel_smoke_auth_deleted(uuid, text) to service_role;

-- Migration-time assertions: ordinary UPDATE/DELETE remain blocked, while the
-- one-user service-role maintenance marker permits only its matching test row.
do $$
declare
  test_user_id uuid := gen_random_uuid();
  update_blocked boolean := false;
  delete_blocked boolean := false;
begin
  insert into public.ai_credit_ledger (
    user_id, transaction_type, credit_source, credits,
    balance_before, balance_after, description, idempotency_key
  ) values (
    test_user_id, 'adjustment', 'promotional', 0,
    0, 0, 'Migration immutability assertion', 'migration:202607290008:' || test_user_id::text
  );

  begin
    update public.ai_credit_ledger set description = 'Forbidden update' where user_id = test_user_id;
  exception when raise_exception then
    update_blocked := position('immutable' in lower(sqlerrm)) > 0;
  end;
  begin
    delete from public.ai_credit_ledger where user_id = test_user_id;
  exception when raise_exception then
    delete_blocked := position('immutable' in lower(sqlerrm)) > 0;
  end;
  if not update_blocked or not delete_blocked then
    raise exception 'AI ledger immutability assertion failed.';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('app.ai_ledger_maintenance_mode', 'zentel_smoke_cleanup', true);
  perform set_config('app.ai_ledger_maintenance_user_id', test_user_id::text, true);
  delete from public.ai_credit_ledger where user_id = test_user_id;
  if found then
    perform set_config('app.ai_ledger_maintenance_mode', '', true);
    perform set_config('app.ai_ledger_maintenance_user_id', '', true);
  else
    raise exception 'Restricted ledger cleanup assertion failed.';
  end if;
end;
$$;
