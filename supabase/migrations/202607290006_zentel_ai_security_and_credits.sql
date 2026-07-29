create or replace function public.ai_refresh_wallet(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_lot record;
  balance_before integer;
  balance_after integer;
begin
  if target_user_id is null then
    raise exception 'A Student account is required.';
  end if;

  insert into public.ai_credit_wallets (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  for expired_lot in
    select lot.*
    from public.ai_credit_lots lot
    where lot.user_id = target_user_id
      and lot.remaining_credits > 0
      and lot.expires_at <= now()
    order by lot.expires_at, lot.created_at
    for update
  loop
    select total_available into balance_before
    from public.ai_credit_wallets
    where user_id = target_user_id
    for update;

    update public.ai_credit_lots
    set remaining_credits = 0,
        updated_at = now()
    where id = expired_lot.id;

    if expired_lot.credit_source = 'monthly' then
      update public.ai_credit_wallets
      set monthly_credits = greatest(0, monthly_credits - expired_lot.remaining_credits),
          updated_at = now()
      where user_id = target_user_id;
    elsif expired_lot.credit_source = 'promotional' then
      update public.ai_credit_wallets
      set promotional_credits = greatest(0, promotional_credits - expired_lot.remaining_credits),
          updated_at = now()
      where user_id = target_user_id;
    else
      update public.ai_credit_wallets
      set topup_credits = greatest(0, topup_credits - expired_lot.remaining_credits),
          updated_at = now()
      where user_id = target_user_id;
    end if;

    select total_available into balance_after
    from public.ai_credit_wallets
    where user_id = target_user_id;

    insert into public.ai_credit_ledger (
      user_id,
      subscription_id,
      transaction_type,
      credit_source,
      credits,
      balance_before,
      balance_after,
      description,
      metadata,
      idempotency_key
    ) values (
      target_user_id,
      expired_lot.subscription_id,
      'expiry',
      expired_lot.credit_source,
      -expired_lot.remaining_credits,
      balance_before,
      balance_after,
      'Expired Zentel AI credits',
      jsonb_build_object('lot_id', expired_lot.id, 'expired_at', expired_lot.expires_at),
      'expiry:' || expired_lot.id::text
    )
    on conflict (idempotency_key) do nothing;
  end loop;

  update public.ai_credit_wallets wallet
  set monthly_credits = coalesce((
        select sum(lot.remaining_credits)::integer
        from public.ai_credit_lots lot
        where lot.user_id = target_user_id and lot.credit_source = 'monthly' and lot.expires_at > now()
      ), 0),
      promotional_credits = coalesce((
        select sum(lot.remaining_credits)::integer
        from public.ai_credit_lots lot
        where lot.user_id = target_user_id and lot.credit_source = 'promotional' and lot.expires_at > now()
      ), 0),
      topup_credits = coalesce((
        select sum(lot.remaining_credits)::integer
        from public.ai_credit_lots lot
        where lot.user_id = target_user_id and lot.credit_source = 'topup' and lot.expires_at > now()
      ), 0),
      updated_at = now()
  where wallet.user_id = target_user_id;
end;
$$;

create or replace function public.ai_allocate_credits(
  target_user_id uuid,
  credit_amount integer,
  source_type text,
  source_key_value text,
  expiry_time timestamptz,
  description_value text,
  target_subscription_id uuid default null,
  target_topup_purchase_id uuid default null
)
returns public.ai_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_lot_id uuid;
  balance_before integer;
  balance_after integer;
  wallet_record public.ai_credit_wallets%rowtype;
  ledger_type text;
begin
  if target_user_id is null or credit_amount <= 0 then
    raise exception 'A valid credit allocation is required.';
  end if;
  if source_type not in ('monthly', 'promotional', 'topup') then
    raise exception 'A valid credit source is required.';
  end if;
  if nullif(btrim(source_key_value), '') is null or expiry_time <= now() then
    raise exception 'A valid allocation source and expiry are required.';
  end if;

  perform public.ai_refresh_wallet(target_user_id);
  select total_available into balance_before
  from public.ai_credit_wallets
  where user_id = target_user_id
  for update;

  insert into public.ai_credit_lots (
    user_id,
    subscription_id,
    topup_purchase_id,
    credit_source,
    initial_credits,
    remaining_credits,
    source_key,
    expires_at
  ) values (
    target_user_id,
    target_subscription_id,
    target_topup_purchase_id,
    source_type,
    credit_amount,
    credit_amount,
    source_key_value,
    expiry_time
  )
  on conflict (source_key) do nothing
  returning id into inserted_lot_id;

  if inserted_lot_id is null then
    select * into wallet_record from public.ai_credit_wallets where user_id = target_user_id;
    return wallet_record;
  end if;

  if source_type = 'monthly' then
    update public.ai_credit_wallets
    set monthly_credits = monthly_credits + credit_amount,
        cycle_start = coalesce(cycle_start, now()),
        cycle_end = greatest(coalesce(cycle_end, expiry_time), expiry_time),
        updated_at = now()
    where user_id = target_user_id;
  elsif source_type = 'promotional' then
    update public.ai_credit_wallets
    set promotional_credits = promotional_credits + credit_amount,
        updated_at = now()
    where user_id = target_user_id;
  else
    update public.ai_credit_wallets
    set topup_credits = topup_credits + credit_amount,
        updated_at = now()
    where user_id = target_user_id;
  end if;

  select total_available into balance_after
  from public.ai_credit_wallets
  where user_id = target_user_id;

  ledger_type := case when source_type = 'topup' then 'topup' else 'allocation' end;
  insert into public.ai_credit_ledger (
    user_id,
    subscription_id,
    transaction_type,
    credit_source,
    credits,
    balance_before,
    balance_after,
    description,
    metadata,
    idempotency_key
  ) values (
    target_user_id,
    target_subscription_id,
    ledger_type,
    source_type,
    credit_amount,
    balance_before,
    balance_after,
    left(coalesce(nullif(description_value, ''), 'Zentel AI credit allocation'), 240),
    jsonb_build_object('lot_id', inserted_lot_id, 'expires_at', expiry_time),
    'allocation:' || source_key_value
  );

  select * into wallet_record from public.ai_credit_wallets where user_id = target_user_id;
  return wallet_record;
end;
$$;

create or replace function public.ai_reserve_request_credits(
  target_user_id uuid,
  target_request_id uuid,
  reserve_amount integer
)
returns public.ai_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_record public.ai_credit_wallets%rowtype;
  request_record public.ai_requests%rowtype;
  balance_before integer;
begin
  if reserve_amount <= 0 then
    raise exception 'A valid credit reservation is required.';
  end if;

  perform public.ai_refresh_wallet(target_user_id);
  select * into request_record
  from public.ai_requests
  where id = target_request_id and user_id = target_user_id
  for update;

  if request_record.id is null then
    raise exception 'The Zentel AI request could not be found.';
  end if;
  if request_record.status in ('reserved', 'processing', 'completed') then
    select * into wallet_record from public.ai_credit_wallets where user_id = target_user_id;
    return wallet_record;
  end if;

  select * into wallet_record
  from public.ai_credit_wallets
  where user_id = target_user_id
  for update;

  if wallet_record.total_available < reserve_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  balance_before := wallet_record.total_available;
  update public.ai_credit_wallets
  set reserved_credits = reserved_credits + reserve_amount,
      updated_at = now()
  where user_id = target_user_id
  returning * into wallet_record;

  update public.ai_requests
  set status = 'reserved',
      credits_reserved = reserve_amount
  where id = target_request_id;

  insert into public.ai_credit_ledger (
    user_id,
    conversation_id,
    request_id,
    transaction_type,
    credit_source,
    credits,
    balance_before,
    balance_after,
    description,
    idempotency_key
  ) values (
    target_user_id,
    request_record.conversation_id,
    target_request_id,
    'reservation',
    'mixed',
    -reserve_amount,
    balance_before,
    wallet_record.total_available,
    'Estimated Zentel AI usage reserved',
    'request:' || target_request_id::text || ':reserve'
  )
  on conflict (idempotency_key) do nothing;

  return wallet_record;
end;
$$;

create or replace function public.ai_finalize_request_credits(
  target_user_id uuid,
  target_request_id uuid,
  charge_amount integer
)
returns public.ai_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_record public.ai_credit_wallets%rowtype;
  request_record public.ai_requests%rowtype;
  lot_record record;
  remaining_charge integer;
  lot_charge integer;
  balance_before integer;
  balance_released integer;
begin
  select * into request_record
  from public.ai_requests
  where id = target_request_id and user_id = target_user_id
  for update;

  if request_record.id is null then
    raise exception 'The Zentel AI request could not be found.';
  end if;
  if request_record.status = 'completed' then
    select * into wallet_record from public.ai_credit_wallets where user_id = target_user_id;
    return wallet_record;
  end if;
  if charge_amount < 1 or charge_amount > request_record.credits_reserved then
    raise exception 'The final credit charge is invalid.';
  end if;

  select * into wallet_record
  from public.ai_credit_wallets
  where user_id = target_user_id
  for update;

  balance_before := wallet_record.total_available;
  update public.ai_credit_wallets
  set reserved_credits = greatest(0, reserved_credits - request_record.credits_reserved),
      updated_at = now()
  where user_id = target_user_id
  returning * into wallet_record;
  balance_released := wallet_record.total_available;

  insert into public.ai_credit_ledger (
    user_id, conversation_id, request_id, transaction_type, credit_source, credits,
    balance_before, balance_after, description, idempotency_key
  ) values (
    target_user_id, request_record.conversation_id, target_request_id, 'release', 'mixed', request_record.credits_reserved,
    balance_before, balance_released, 'Estimated Zentel AI usage released',
    'request:' || target_request_id::text || ':release'
  ) on conflict (idempotency_key) do nothing;

  remaining_charge := charge_amount;
  for lot_record in
    select lot.*
    from public.ai_credit_lots lot
    where lot.user_id = target_user_id
      and lot.remaining_credits > 0
      and lot.expires_at > now()
    order by case lot.credit_source when 'monthly' then 1 when 'promotional' then 2 else 3 end,
             lot.expires_at,
             lot.created_at
    for update
  loop
    exit when remaining_charge <= 0;
    lot_charge := least(remaining_charge, lot_record.remaining_credits);
    update public.ai_credit_lots
    set remaining_credits = remaining_credits - lot_charge,
        updated_at = now()
    where id = lot_record.id;
    remaining_charge := remaining_charge - lot_charge;
  end loop;

  if remaining_charge > 0 then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  perform public.ai_refresh_wallet(target_user_id);
  select * into wallet_record from public.ai_credit_wallets where user_id = target_user_id;

  insert into public.ai_credit_ledger (
    user_id, conversation_id, request_id, transaction_type, credit_source, credits,
    balance_before, balance_after, description, idempotency_key
  ) values (
    target_user_id, request_record.conversation_id, target_request_id, 'charge', 'mixed', -charge_amount,
    balance_released, wallet_record.total_available, 'Zentel AI learning request',
    'request:' || target_request_id::text || ':charge'
  ) on conflict (idempotency_key) do nothing;

  update public.ai_requests
  set status = 'completed',
      credits_charged = charge_amount,
      completed_at = now()
  where id = target_request_id;

  return wallet_record;
end;
$$;

create or replace function public.ai_release_request_credits(
  target_user_id uuid,
  target_request_id uuid,
  final_status text,
  safe_error_code text default null
)
returns public.ai_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_record public.ai_credit_wallets%rowtype;
  request_record public.ai_requests%rowtype;
  balance_before integer;
begin
  if final_status not in ('failed', 'blocked', 'cancelled', 'refunded') then
    raise exception 'A valid final request status is required.';
  end if;

  select * into request_record
  from public.ai_requests
  where id = target_request_id and user_id = target_user_id
  for update;

  if request_record.id is null then
    raise exception 'The Zentel AI request could not be found.';
  end if;

  select * into wallet_record
  from public.ai_credit_wallets
  where user_id = target_user_id
  for update;

  if request_record.credits_reserved > 0 and request_record.status not in ('completed', 'failed', 'blocked', 'cancelled', 'refunded') then
    balance_before := wallet_record.total_available;
    update public.ai_credit_wallets
    set reserved_credits = greatest(0, reserved_credits - request_record.credits_reserved),
        updated_at = now()
    where user_id = target_user_id
    returning * into wallet_record;

    insert into public.ai_credit_ledger (
      user_id, conversation_id, request_id, transaction_type, credit_source, credits,
      balance_before, balance_after, description, idempotency_key
    ) values (
      target_user_id, request_record.conversation_id, target_request_id,
      case when final_status = 'refunded' then 'refund' else 'release' end,
      'mixed', request_record.credits_reserved, balance_before, wallet_record.total_available,
      'Unused Zentel AI credits returned',
      'request:' || target_request_id::text || ':failure-release'
    ) on conflict (idempotency_key) do nothing;
  end if;

  update public.ai_requests
  set status = final_status,
      error_code = left(safe_error_code, 80),
      completed_at = now()
  where id = target_request_id and status <> 'completed';

  return wallet_record;
end;
$$;

create or replace function public.ai_apply_verified_payment(
  target_payment_id uuid,
  webhook_event_key text,
  provider_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_record public.payments%rowtype;
  plan_record public.ai_plans%rowtype;
  topup_record public.ai_topup_products%rowtype;
  subscription_record public.ai_subscriptions%rowtype;
  purchase_record public.ai_topup_purchases%rowtype;
  period_start timestamptz := now();
  period_end timestamptz;
begin
  select * into payment_record
  from public.payments
  where id = target_payment_id
  for update;

  if payment_record.id is null then
    raise exception 'The verified payment could not be found.';
  end if;
  if payment_record.status <> 'success' or payment_record.verification_status <> 'verified' then
    raise exception 'Payment verification must complete before fulfilment.';
  end if;
  if payment_record.fulfilment_status = 'fulfilled' then
    return jsonb_build_object('fulfilled', true, 'duplicate', true, 'payment_id', payment_record.id);
  end if;

  if payment_record.product_type = 'zentel_ai_subscription' then
    select * into plan_record from public.ai_plans where id = payment_record.ai_plan_id and active = true;
    if plan_record.id is null then
      raise exception 'The Zentel AI plan is unavailable.';
    end if;
    period_end := period_start + interval '1 month';

    select * into subscription_record
    from public.ai_subscriptions
    where user_id = payment_record.user_id
    order by created_at desc
    limit 1
    for update;

    if subscription_record.id is null then
      insert into public.ai_subscriptions (
        user_id, plan_id, provider, provider_customer_code, provider_subscription_code,
        provider_email_token, status, current_period_start, current_period_end, next_payment_date
      ) values (
        payment_record.user_id,
        plan_record.id,
        'paystack',
        nullif(provider_details->>'customer_code', ''),
        nullif(provider_details->>'subscription_code', ''),
        nullif(provider_details->>'email_token', ''),
        'active',
        period_start,
        period_end,
        coalesce(nullif(provider_details->>'next_payment_date', '')::timestamptz, period_end)
      ) returning * into subscription_record;
    else
      update public.ai_subscriptions
      set plan_id = plan_record.id,
          provider = 'paystack',
          provider_customer_code = coalesce(nullif(provider_details->>'customer_code', ''), provider_customer_code),
          provider_subscription_code = coalesce(nullif(provider_details->>'subscription_code', ''), provider_subscription_code),
          provider_email_token = coalesce(nullif(provider_details->>'email_token', ''), provider_email_token),
          status = 'active',
          current_period_start = period_start,
          current_period_end = period_end,
          next_payment_date = coalesce(nullif(provider_details->>'next_payment_date', '')::timestamptz, period_end),
          cancel_at_period_end = false,
          updated_at = now()
      where id = subscription_record.id
      returning * into subscription_record;
    end if;

    perform public.ai_allocate_credits(
      payment_record.user_id,
      plan_record.monthly_credits,
      'monthly',
      'subscription-payment:' || payment_record.reference,
      period_end,
      plan_record.name || ' monthly allocation',
      subscription_record.id,
      null
    );

    insert into public.portal_notifications (user_id, title, message, notification_type, link_path)
    values (
      payment_record.user_id,
      'Zentel AI plan active',
      plan_record.name || ' is active. Your monthly credits are ready.',
      'zentel_ai_subscription',
      '/portal/zentel-ai'
    );
  elsif payment_record.product_type = 'zentel_ai_topup' then
    select * into topup_record from public.ai_topup_products where id = payment_record.ai_topup_product_id and active = true;
    if topup_record.id is null then
      raise exception 'The Zentel AI credit pack is unavailable.';
    end if;

    insert into public.ai_topup_purchases (
      user_id, product_id, payment_id, reference, credits, amount_kobo, status, expires_at, fulfilled_at
    ) values (
      payment_record.user_id,
      topup_record.id,
      payment_record.id,
      payment_record.reference,
      topup_record.credits,
      topup_record.price_kobo,
      'verified',
      now() + make_interval(days => topup_record.validity_days),
      now()
    )
    on conflict (payment_id) do update set
      status = 'verified',
      fulfilled_at = coalesce(public.ai_topup_purchases.fulfilled_at, now()),
      updated_at = now()
    returning * into purchase_record;

    perform public.ai_allocate_credits(
      payment_record.user_id,
      topup_record.credits,
      'topup',
      'topup-payment:' || payment_record.reference,
      purchase_record.expires_at,
      topup_record.name || ' purchased',
      null,
      purchase_record.id
    );

    insert into public.portal_notifications (user_id, title, message, notification_type, link_path)
    values (
      payment_record.user_id,
      'Zentel AI credits added',
      topup_record.credits || ' Zentel AI credits have been added to your account.',
      'zentel_ai_topup',
      '/portal/zentel-ai/usage'
    );
  else
    raise exception 'This payment is not a Zentel AI purchase.';
  end if;

  update public.payments
  set fulfilment_status = 'fulfilled',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('fulfilled_by_event', webhook_event_key),
      updated_at = now()
  where id = payment_record.id;

  return jsonb_build_object('fulfilled', true, 'duplicate', false, 'payment_id', payment_record.id);
exception when others then
  update public.payments
  set fulfilment_status = 'failed',
      updated_at = now()
  where id = target_payment_id;
  raise;
end;
$$;

create or replace function public.ai_claim_trial()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_id_value uuid := auth.uid();
  settings_record public.ai_system_settings%rowtype;
  plan_record public.ai_plans%rowtype;
  subscription_record public.ai_subscriptions%rowtype;
  trial_end timestamptz;
begin
  if user_id_value is null then
    raise exception 'Authentication is required.';
  end if;
  if not exists (select 1 from public.user_roles where user_id = user_id_value and role = 'student') then
    raise exception 'Student access is required.';
  end if;
  if not public.is_account_active(user_id_value) then
    raise exception 'Your Student account must be active.';
  end if;
  if exists (select 1 from public.profiles where id = user_id_value and ai_access_status = 'suspended') then
    raise exception 'Zentel AI access is suspended for this account.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(user_id_value::text, 0));
  if exists (select 1 from public.ai_trial_claims where user_id = user_id_value) then
    raise exception 'Your one-time Zentel AI trial has already been used.';
  end if;

  select * into settings_record from public.ai_system_settings where id = 1;
  if settings_record.emergency_disabled or not settings_record.trial_enabled or settings_record.trial_credits <= 0 then
    raise exception 'The Zentel AI trial is not currently available.';
  end if;

  select * into plan_record from public.ai_plans where slug = 'starter' and active = true;
  if plan_record.id is null then
    raise exception 'The Zentel AI trial is not currently available.';
  end if;
  trial_end := now() + make_interval(days => settings_record.trial_days);

  insert into public.ai_subscriptions (
    user_id, plan_id, provider, status, current_period_start, current_period_end, next_payment_date
  ) values (
    user_id_value, plan_record.id, 'trial', 'trialing', now(), trial_end, null
  ) returning * into subscription_record;

  insert into public.ai_trial_claims (user_id, subscription_id, credits_granted, expires_at)
  values (user_id_value, subscription_record.id, settings_record.trial_credits, trial_end);

  perform public.ai_allocate_credits(
    user_id_value,
    settings_record.trial_credits,
    'promotional',
    'trial:' || user_id_value::text,
    trial_end,
    'One-time Zentel AI trial',
    subscription_record.id,
    null
  );

  insert into public.portal_notifications (user_id, title, message, notification_type, link_path)
  values (
    user_id_value,
    'Zentel AI trial active',
    'Your one-time Zentel AI trial is ready.',
    'zentel_ai_trial',
    '/portal/zentel-ai'
  );

  return jsonb_build_object('ok', true, 'expires_at', trial_end, 'credits', settings_record.trial_credits);
end;
$$;

create or replace function public.ai_get_student_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_id_value uuid := auth.uid();
  result jsonb;
begin
  if user_id_value is null then
    raise exception 'Authentication is required.';
  end if;
  if not exists (select 1 from public.user_roles where user_id = user_id_value and role = 'student') then
    raise exception 'Student access is required.';
  end if;

  perform public.ai_refresh_wallet(user_id_value);

  select jsonb_build_object(
    'plans', coalesce((select jsonb_agg(to_jsonb(plan_record) order by plan_record.display_order) from (
      select id, slug, name, monthly_price_kobo, monthly_credits, description, features,
             maximum_request_credits, display_order, badge
      from public.ai_plans where active = true
    ) plan_record), '[]'::jsonb),
    'topups', coalesce((select jsonb_agg(to_jsonb(topup_record) order by topup_record.display_order) from (
      select id, slug, name, credits, price_kobo, validity_days, display_order
      from public.ai_topup_products where active = true
    ) topup_record), '[]'::jsonb),
    'subscription', (select to_jsonb(subscription_record) from (
      select subscription.id, subscription.plan_id, subscription.status, subscription.current_period_start,
             subscription.current_period_end, subscription.next_payment_date, subscription.cancel_at_period_end,
             plan.name as plan_name, plan.slug as plan_slug, plan.monthly_credits
      from public.ai_subscriptions subscription
      join public.ai_plans plan on plan.id = subscription.plan_id
      where subscription.user_id = user_id_value
      order by subscription.created_at desc
      limit 1
    ) subscription_record),
    'wallet', (select to_jsonb(wallet_record) from (
      select monthly_credits, promotional_credits, topup_credits, reserved_credits, total_available,
             cycle_start, cycle_end, updated_at
      from public.ai_credit_wallets where user_id = user_id_value
    ) wallet_record),
    'ledger', coalesce((select jsonb_agg(to_jsonb(ledger_record) order by ledger_record.created_at desc) from (
      select id, transaction_type, credit_source, credits, balance_before, balance_after, description, created_at
      from public.ai_credit_ledger where user_id = user_id_value order by created_at desc limit 30
    ) ledger_record), '[]'::jsonb),
    'access', jsonb_build_object(
      'account_active', public.is_account_active(user_id_value),
      'ai_access_status', coalesce((select ai_access_status from public.profiles where id = user_id_value), 'active'),
      'system_available', not coalesce((select emergency_disabled from public.ai_system_settings where id = 1), true),
      'trial_available', coalesce((select trial_enabled from public.ai_system_settings where id = 1), false)
        and not exists (select 1 from public.ai_trial_claims where user_id = user_id_value)
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.ai_admin_adjust_credits(
  target_user_id uuid,
  credit_delta integer,
  source_key_value text,
  description_value text
)
returns public.ai_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_record public.ai_credit_wallets%rowtype;
  lot_record record;
  remaining_remove integer;
  lot_remove integer;
  balance_before integer;
begin
  if credit_delta = 0 or abs(credit_delta) > 10000 then
    raise exception 'A valid credit adjustment is required.';
  end if;
  if credit_delta > 0 then
    return public.ai_allocate_credits(
      target_user_id,
      credit_delta,
      'promotional',
      'admin-adjustment:' || source_key_value,
      now() + interval '365 days',
      description_value,
      null,
      null
    );
  end if;

  perform public.ai_refresh_wallet(target_user_id);
  select * into wallet_record from public.ai_credit_wallets where user_id = target_user_id for update;
  if wallet_record.total_available < abs(credit_delta) then
    raise exception 'The account does not have enough credits for this adjustment.';
  end if;
  balance_before := wallet_record.total_available;
  remaining_remove := abs(credit_delta);

  for lot_record in
    select lot.*
    from public.ai_credit_lots lot
    where lot.user_id = target_user_id and lot.remaining_credits > 0 and lot.expires_at > now()
    order by case lot.credit_source when 'monthly' then 1 when 'promotional' then 2 else 3 end,
             lot.expires_at,
             lot.created_at
    for update
  loop
    exit when remaining_remove <= 0;
    lot_remove := least(remaining_remove, lot_record.remaining_credits);
    update public.ai_credit_lots
    set remaining_credits = remaining_credits - lot_remove,
        updated_at = now()
    where id = lot_record.id;
    remaining_remove := remaining_remove - lot_remove;
  end loop;

  perform public.ai_refresh_wallet(target_user_id);
  select * into wallet_record from public.ai_credit_wallets where user_id = target_user_id;
  insert into public.ai_credit_ledger (
    user_id, transaction_type, credit_source, credits, balance_before, balance_after,
    description, idempotency_key
  ) values (
    target_user_id, 'adjustment', 'mixed', credit_delta, balance_before, wallet_record.total_available,
    left(description_value, 240), 'admin-adjustment:' || source_key_value
  );
  return wallet_record;
end;
$$;

revoke all on function public.ai_refresh_wallet(uuid) from public;
revoke all on function public.ai_allocate_credits(uuid, integer, text, text, timestamptz, text, uuid, uuid) from public;
revoke all on function public.ai_reserve_request_credits(uuid, uuid, integer) from public;
revoke all on function public.ai_finalize_request_credits(uuid, uuid, integer) from public;
revoke all on function public.ai_release_request_credits(uuid, uuid, text, text) from public;
revoke all on function public.ai_apply_verified_payment(uuid, text, jsonb) from public;
revoke all on function public.ai_admin_adjust_credits(uuid, integer, text, text) from public;
grant execute on function public.ai_refresh_wallet(uuid) to service_role;
grant execute on function public.ai_allocate_credits(uuid, integer, text, text, timestamptz, text, uuid, uuid) to service_role;
grant execute on function public.ai_reserve_request_credits(uuid, uuid, integer) to service_role;
grant execute on function public.ai_finalize_request_credits(uuid, uuid, integer) to service_role;
grant execute on function public.ai_release_request_credits(uuid, uuid, text, text) to service_role;
grant execute on function public.ai_apply_verified_payment(uuid, text, jsonb) to service_role;
grant execute on function public.ai_admin_adjust_credits(uuid, integer, text, text) to service_role;

revoke all on function public.ai_claim_trial() from public;
revoke all on function public.ai_get_student_snapshot() from public;
grant execute on function public.ai_claim_trial() to authenticated;
grant execute on function public.ai_get_student_snapshot() to authenticated;

revoke all on table public.ai_plans from anon, authenticated;
revoke all on table public.ai_system_settings from anon, authenticated;
revoke all on table public.ai_pricing_configuration from anon, authenticated;
revoke all on table public.ai_subscriptions from anon, authenticated;
revoke all on table public.ai_credit_wallets from anon, authenticated;
revoke all on table public.ai_credit_lots from anon, authenticated;
revoke all on table public.ai_credit_ledger from anon, authenticated;
revoke all on table public.ai_topup_products from anon, authenticated;
revoke all on table public.ai_topup_purchases from anon, authenticated;
revoke all on table public.ai_requests from anon, authenticated;
revoke all on table public.ai_trial_claims from anon, authenticated;
revoke all on table public.paystack_webhook_events from anon, authenticated;
revoke all on table public.ai_conversations from anon, authenticated;
revoke all on table public.ai_messages from anon, authenticated;
revoke all on table public.ai_attachments from anon, authenticated;

grant select on table public.ai_plans, public.ai_topup_products to authenticated;
grant select on table public.ai_subscriptions, public.ai_credit_wallets, public.ai_credit_ledger, public.ai_topup_purchases to authenticated;
grant select (id, user_id, conversation_id, status, request_type, credits_charged, error_code, created_at, completed_at)
  on table public.ai_requests to authenticated;
grant select, insert, update, delete on table public.ai_conversations to authenticated;
grant select on table public.ai_messages to authenticated;
grant update (feedback) on table public.ai_messages to authenticated;
grant select, insert, update, delete on table public.ai_attachments to authenticated;

drop policy if exists "Authenticated users can read active AI plans" on public.ai_plans;
create policy "Authenticated users can read active AI plans"
  on public.ai_plans for select to authenticated
  using (active = true or public.is_verified_admin_session());

drop policy if exists "Authenticated users can read active AI topups" on public.ai_topup_products;
create policy "Authenticated users can read active AI topups"
  on public.ai_topup_products for select to authenticated
  using (active = true or public.is_verified_admin_session());

drop policy if exists "Students can read own AI subscriptions" on public.ai_subscriptions;
create policy "Students can read own AI subscriptions"
  on public.ai_subscriptions for select to authenticated
  using (user_id = auth.uid() and public.is_account_active(auth.uid()));

drop policy if exists "Students can read own AI wallet" on public.ai_credit_wallets;
create policy "Students can read own AI wallet"
  on public.ai_credit_wallets for select to authenticated
  using (user_id = auth.uid() and public.is_account_active(auth.uid()));

drop policy if exists "Students can read own AI ledger" on public.ai_credit_ledger;
create policy "Students can read own AI ledger"
  on public.ai_credit_ledger for select to authenticated
  using (user_id = auth.uid() and public.is_account_active(auth.uid()));

drop policy if exists "Students can read own AI topup purchases" on public.ai_topup_purchases;
create policy "Students can read own AI topup purchases"
  on public.ai_topup_purchases for select to authenticated
  using (user_id = auth.uid() and public.is_account_active(auth.uid()));

drop policy if exists "Students can read own safe AI requests" on public.ai_requests;
create policy "Students can read own safe AI requests"
  on public.ai_requests for select to authenticated
  using (user_id = auth.uid() and public.is_account_active(auth.uid()));

drop policy if exists "Students can manage own AI conversations" on public.ai_conversations;
create policy "Students can manage own AI conversations"
  on public.ai_conversations for all to authenticated
  using (user_id = auth.uid() and public.is_account_active(auth.uid()))
  with check (user_id = auth.uid() and public.is_account_active(auth.uid()));

drop policy if exists "Students can read own AI messages" on public.ai_messages;
create policy "Students can read own AI messages"
  on public.ai_messages for select to authenticated
  using (
    user_id = auth.uid()
    and public.is_account_active(auth.uid())
    and exists (
      select 1 from public.ai_conversations conversation
      where conversation.id = ai_messages.conversation_id and conversation.user_id = auth.uid()
    )
  );

drop policy if exists "Students can update own AI message feedback" on public.ai_messages;
create policy "Students can update own AI message feedback"
  on public.ai_messages for update to authenticated
  using (user_id = auth.uid() and role = 'assistant' and public.is_account_active(auth.uid()))
  with check (user_id = auth.uid() and role = 'assistant' and public.is_account_active(auth.uid()));

drop policy if exists "Students can read own AI attachments" on public.ai_attachments;
create policy "Students can read own AI attachments"
  on public.ai_attachments for select to authenticated
  using (user_id = auth.uid() and public.is_account_active(auth.uid()));

drop policy if exists "Students can create own AI attachments" on public.ai_attachments;
create policy "Students can create own AI attachments"
  on public.ai_attachments for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_account_active(auth.uid())
    and exists (
      select 1 from public.ai_conversations conversation
      where conversation.id = ai_attachments.conversation_id and conversation.user_id = auth.uid()
    )
  );

drop policy if exists "Students can update own AI attachments" on public.ai_attachments;
create policy "Students can update own AI attachments"
  on public.ai_attachments for update to authenticated
  using (user_id = auth.uid() and public.is_account_active(auth.uid()))
  with check (user_id = auth.uid() and public.is_account_active(auth.uid()));

drop policy if exists "Verified admins can read AI plans" on public.ai_plans;
create policy "Verified admins can read AI plans" on public.ai_plans for select to authenticated using (public.is_verified_admin_session());
drop policy if exists "Verified admins can read AI settings" on public.ai_system_settings;
create policy "Verified admins can read AI settings" on public.ai_system_settings for select to authenticated using (public.is_verified_admin_session());
drop policy if exists "Verified admins can read AI pricing" on public.ai_pricing_configuration;
create policy "Verified admins can read AI pricing" on public.ai_pricing_configuration for select to authenticated using (public.is_verified_admin_session());
drop policy if exists "Verified admins can read AI subscriptions" on public.ai_subscriptions;
create policy "Verified admins can read AI subscriptions" on public.ai_subscriptions for select to authenticated using (public.is_verified_admin_session());
drop policy if exists "Verified admins can read AI wallets" on public.ai_credit_wallets;
create policy "Verified admins can read AI wallets" on public.ai_credit_wallets for select to authenticated using (public.is_verified_admin_session());
drop policy if exists "Verified admins can read AI requests" on public.ai_requests;
create policy "Verified admins can read AI requests" on public.ai_requests for select to authenticated using (public.is_verified_admin_session());
drop policy if exists "Verified admins can read AI conversations" on public.ai_conversations;
create policy "Verified admins can read AI conversations" on public.ai_conversations for select to authenticated using (public.is_verified_admin_session());
drop policy if exists "Verified admins can read AI attachments" on public.ai_attachments;
create policy "Verified admins can read AI attachments" on public.ai_attachments for select to authenticated using (public.is_verified_admin_session());

drop policy if exists "Students can upload own Zentel AI files" on storage.objects;
create policy "Students can upload own Zentel AI files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'zentel-ai-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_account_active(auth.uid())
  );

drop policy if exists "Students can read own Zentel AI files" on storage.objects;
create policy "Students can read own Zentel AI files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'zentel-ai-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_account_active(auth.uid())
  );

drop policy if exists "Students can remove own Zentel AI files" on storage.objects;
create policy "Students can remove own Zentel AI files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'zentel-ai-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_account_active(auth.uid())
  );

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['ai_conversations', 'ai_messages', 'ai_credit_wallets', 'ai_subscriptions'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';
