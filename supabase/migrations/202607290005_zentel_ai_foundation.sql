create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists ai_access_status text not null default 'active';

alter table public.profiles drop constraint if exists profiles_ai_access_status_check;
alter table public.profiles
  add constraint profiles_ai_access_status_check
  check (ai_access_status in ('active', 'suspended'));

create table if not exists public.ai_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  monthly_price_kobo integer not null check (monthly_price_kobo > 0),
  monthly_credits integer not null check (monthly_credits > 0),
  description text not null default '',
  features jsonb not null default '[]'::jsonb,
  maximum_request_credits integer not null check (maximum_request_credits > 0),
  active boolean not null default true,
  display_order integer not null default 100,
  badge text not null default '',
  provider_plan_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_system_settings (
  id smallint primary key default 1 check (id = 1),
  emergency_disabled boolean not null default false,
  web_search_enabled boolean not null default true,
  file_uploads_enabled boolean not null default true,
  trial_enabled boolean not null default true,
  trial_credits integer not null default 20 check (trial_credits between 0 and 100),
  trial_days integer not null default 7 check (trial_days between 1 and 30),
  model_mappings jsonb not null default '{"standard":"gpt-5.6-luna","advanced":"gpt-5.6-terra","expert":"gpt-5.6-sol"}'::jsonb,
  credit_cost_unit_ngn numeric(12,4) not null default 7 check (credit_cost_unit_ngn > 0),
  internal_exchange_rate numeric(12,4) not null default 1650 check (internal_exchange_rate > 0),
  risk_multiplier numeric(8,4) not null default 1.25 check (risk_multiplier >= 1),
  maximum_output_tokens integer not null default 5000 check (maximum_output_tokens between 256 and 20000),
  maximum_input_characters integer not null default 30000 check (maximum_input_characters between 1000 and 200000),
  maximum_files_per_request integer not null default 3 check (maximum_files_per_request between 0 and 10),
  maximum_file_bytes integer not null default 10485760 check (maximum_file_bytes between 1048576 and 52428800),
  maximum_web_searches_per_request integer not null default 3 check (maximum_web_searches_per_request between 0 and 10),
  per_student_daily_credits integer not null default 150 check (per_student_daily_credits > 0),
  per_student_daily_cost_usd numeric(12,4) not null default 5 check (per_student_daily_cost_usd > 0),
  global_daily_cost_usd numeric(12,4) not null default 100 check (global_daily_cost_usd > 0),
  global_monthly_cost_usd numeric(12,4) not null default 2000 check (global_monthly_cost_usd > 0),
  maximum_concurrent_requests integer not null default 1 check (maximum_concurrent_requests between 1 and 5),
  requests_per_minute integer not null default 8 check (requests_per_minute between 1 and 60),
  request_timeout_seconds integer not null default 90 check (request_timeout_seconds between 15 and 300),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_system_settings (id) values (1)
on conflict (id) do nothing;

create table if not exists public.ai_pricing_configuration (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  model_route text not null check (model_route in ('standard', 'advanced', 'expert')),
  input_rate_usd numeric(14,8) not null check (input_rate_usd >= 0),
  cached_input_rate_usd numeric(14,8) not null check (cached_input_rate_usd >= 0),
  output_rate_usd numeric(14,8) not null check (output_rate_usd >= 0),
  web_search_rate_usd numeric(14,8) not null default 0.01 check (web_search_rate_usd >= 0),
  file_search_rate_usd numeric(14,8) not null default 0.0025 check (file_search_rate_usd >= 0),
  internal_exchange_rate numeric(12,4) not null default 1650 check (internal_exchange_rate > 0),
  risk_multiplier numeric(8,4) not null default 1.25 check (risk_multiplier >= 1),
  credit_cost_unit_ngn numeric(12,4) not null default 7 check (credit_cost_unit_ngn > 0),
  effective_from timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_pricing_active_route_idx
  on public.ai_pricing_configuration(model_route) where active = true;

create table if not exists public.ai_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.ai_plans(id),
  provider text not null default 'paystack',
  provider_customer_code text,
  provider_subscription_code text,
  provider_email_token text,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  next_payment_date timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_subscriptions_user_current_idx
  on public.ai_subscriptions(user_id) where status in ('trialing', 'active', 'past_due', 'suspended');
create index if not exists ai_subscriptions_status_period_idx on public.ai_subscriptions(status, current_period_end);
create index if not exists ai_subscriptions_provider_code_idx on public.ai_subscriptions(provider_subscription_code) where provider_subscription_code is not null;

create table if not exists public.ai_credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_credits integer not null default 0 check (monthly_credits >= 0),
  promotional_credits integer not null default 0 check (promotional_credits >= 0),
  topup_credits integer not null default 0 check (topup_credits >= 0),
  reserved_credits integer not null default 0 check (reserved_credits >= 0),
  total_available integer generated always as (greatest(0, monthly_credits + promotional_credits + topup_credits - reserved_credits)) stored,
  cycle_start timestamptz,
  cycle_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_topup_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  credits integer not null check (credits > 0),
  price_kobo integer not null check (price_kobo > 0),
  validity_days integer not null default 90 check (validity_days between 1 and 365),
  active boolean not null default true,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_topup_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.ai_topup_products(id),
  payment_id uuid not null unique references public.payments(id),
  reference text not null unique,
  credits integer not null check (credits > 0),
  amount_kobo integer not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed', 'expired')),
  expires_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_credit_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.ai_subscriptions(id) on delete set null,
  topup_purchase_id uuid references public.ai_topup_purchases(id) on delete set null,
  credit_source text not null check (credit_source in ('monthly', 'promotional', 'topup')),
  initial_credits integer not null check (initial_credits > 0),
  remaining_credits integer not null check (remaining_credits >= 0),
  source_key text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_credit_lots_user_expiry_idx on public.ai_credit_lots(user_id, credit_source, expires_at);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New learning conversation' check (char_length(title) between 1 and 120),
  archived boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_recent_idx on public.ai_conversations(user_id, archived, last_message_at desc);

create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'created' check (status in ('created', 'reserved', 'processing', 'completed', 'failed', 'blocked', 'cancelled', 'refunded')),
  request_type text not null,
  model_route text not null check (model_route in ('standard', 'advanced', 'expert')),
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  web_search_calls integer not null default 0 check (web_search_calls >= 0),
  file_search_calls integer not null default 0 check (file_search_calls >= 0),
  provider_cost_usd numeric(14,8) not null default 0 check (provider_cost_usd >= 0),
  protected_cost_ngn numeric(14,4) not null default 0 check (protected_cost_ngn >= 0),
  credits_reserved integer not null default 0 check (credits_reserved >= 0),
  credits_charged integer not null default 0 check (credits_charged >= 0),
  openai_request_id text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_requests_status_idx on public.ai_requests(status, created_at desc);
create index if not exists ai_requests_user_created_idx on public.ai_requests(user_id, created_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content jsonb not null default '{}'::jsonb,
  request_id uuid references public.ai_requests(id) on delete set null,
  status text not null default 'completed' check (status in ('pending', 'streaming', 'completed', 'failed', 'blocked', 'cancelled')),
  model_route text,
  credit_cost integer check (credit_cost is null or credit_cost >= 0),
  feedback text check (feedback is null or feedback in ('positive', 'negative')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_created_idx on public.ai_messages(conversation_id, created_at desc);

create table if not exists public.ai_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  request_id uuid references public.ai_requests(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0),
  status text not null default 'uploaded' check (status in ('uploading', 'uploaded', 'processing', 'ready', 'failed', 'removed')),
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_attachments_user_conversation_idx on public.ai_attachments(user_id, conversation_id, created_at desc);

create table if not exists public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.ai_subscriptions(id) on delete set null,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  request_id uuid references public.ai_requests(id) on delete set null,
  transaction_type text not null check (transaction_type in ('allocation', 'reservation', 'charge', 'release', 'refund', 'topup', 'adjustment', 'expiry')),
  credit_source text not null check (credit_source in ('monthly', 'promotional', 'topup', 'mixed')),
  credits integer not null,
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists ai_credit_ledger_user_created_idx on public.ai_credit_ledger(user_id, created_at desc);

create table if not exists public.ai_trial_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.ai_subscriptions(id) on delete cascade,
  credits_granted integer not null check (credits_granted > 0),
  expires_at timestamptz not null,
  claimed_at timestamptz not null default now()
);

create table if not exists public.paystack_webhook_events (
  event_key text primary key,
  event_type text not null,
  reference text,
  payload_hash text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed', 'ignored')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.payments add column if not exists ai_plan_id uuid references public.ai_plans(id);
alter table public.payments add column if not exists ai_topup_product_id uuid references public.ai_topup_products(id);
alter table public.payments add column if not exists fulfilment_status text not null default 'not_applicable';
alter table public.payments drop constraint if exists payments_fulfilment_status_check;
alter table public.payments
  add constraint payments_fulfilment_status_check
  check (fulfilment_status in ('not_applicable', 'awaiting_webhook', 'fulfilled', 'failed'));

create index if not exists payments_ai_plan_idx on public.payments(ai_plan_id) where ai_plan_id is not null;
create index if not exists payments_ai_topup_idx on public.payments(ai_topup_product_id) where ai_topup_product_id is not null;

insert into public.ai_plans (
  slug, name, monthly_price_kobo, monthly_credits, description, features, maximum_request_credits, active, display_order, badge
) values
  (
    'starter', 'Zentel AI Starter', 800000, 300,
    'A focused learning assistant for everyday study, coding practice and guided research.',
    '["General-purpose AI tutoring","Teaching across subjects and programmes","Web research when current information is needed","Coding assistance","Assignment guidance","Quizzes and practice exercises","Learning plans","Basic document and image analysis","Saved conversation history","Cross-device access"]'::jsonb,
    20, true, 10, 'Starter'
  ),
  (
    'plus', 'Zentel AI Plus', 1500000, 700,
    'Longer sessions, deeper explanations and expanded research and document support.',
    '["Everything in Starter","Longer teaching sessions","More frequent web research","Larger document allowance","Extended conversation context","Detailed coding and project help","Advanced research mode","More comprehensive learning plans"]'::jsonb,
    40, true, 20, 'Most Popular'
  ),
  (
    'pro', 'Zentel AI Pro', 2500000, 1300,
    'Advanced assistance for demanding technical, research and professional learning work.',
    '["Everything in Plus","Advanced reasoning","Deep technical explanations","Comprehensive web research","Multi-document analysis","Complex code analysis","Long-form project assistance","Advanced data-analysis guidance","Higher request limits"]'::jsonb,
    50, true, 30, 'For advanced learners and professionals'
  )
on conflict (slug) do update set
  name = excluded.name,
  monthly_price_kobo = excluded.monthly_price_kobo,
  monthly_credits = excluded.monthly_credits,
  description = excluded.description,
  features = excluded.features,
  maximum_request_credits = excluded.maximum_request_credits,
  display_order = excluded.display_order,
  badge = excluded.badge,
  updated_at = now();

insert into public.ai_topup_products (slug, name, credits, price_kobo, validity_days, active, display_order)
values
  ('credits-100', '100 credits', 100, 300000, 90, true, 10),
  ('credits-300', '300 credits', 300, 850000, 90, true, 20),
  ('credits-700', '700 credits', 700, 1800000, 90, true, 30)
on conflict (slug) do update set
  name = excluded.name,
  credits = excluded.credits,
  price_kobo = excluded.price_kobo,
  validity_days = excluded.validity_days,
  display_order = excluded.display_order,
  updated_at = now();

insert into public.ai_pricing_configuration (
  model, model_route, input_rate_usd, cached_input_rate_usd, output_rate_usd,
  web_search_rate_usd, file_search_rate_usd, internal_exchange_rate, risk_multiplier,
  credit_cost_unit_ngn, effective_from, active
) values
  ('gpt-5.6-luna', 'standard', 1.00, 0.10, 6.00, 0.01, 0.0025, 1650, 1.25, 7, now(), true),
  ('gpt-5.6-terra', 'advanced', 2.50, 0.25, 15.00, 0.01, 0.0025, 1650, 1.25, 7, now(), true),
  ('gpt-5.6-sol', 'expert', 5.00, 0.50, 30.00, 0.01, 0.0025, 1650, 1.25, 7, now(), true)
on conflict (model_route) where active = true do update set
  model = excluded.model,
  input_rate_usd = excluded.input_rate_usd,
  cached_input_rate_usd = excluded.cached_input_rate_usd,
  output_rate_usd = excluded.output_rate_usd,
  web_search_rate_usd = excluded.web_search_rate_usd,
  file_search_rate_usd = excluded.file_search_rate_usd,
  internal_exchange_rate = excluded.internal_exchange_rate,
  risk_multiplier = excluded.risk_multiplier,
  credit_cost_unit_ngn = excluded.credit_cost_unit_ngn,
  effective_from = excluded.effective_from,
  updated_at = now();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_plans', 'ai_system_settings', 'ai_pricing_configuration', 'ai_subscriptions',
    'ai_credit_wallets', 'ai_topup_products', 'ai_topup_purchases', 'ai_credit_lots',
    'ai_conversations', 'ai_requests', 'ai_messages', 'ai_attachments', 'ai_credit_ledger',
    'ai_trial_claims', 'paystack_webhook_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_plans', 'ai_system_settings', 'ai_pricing_configuration', 'ai_subscriptions',
    'ai_credit_wallets', 'ai_topup_products', 'ai_topup_purchases', 'ai_credit_lots',
    'ai_conversations', 'ai_messages', 'ai_attachments'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function public.prevent_ai_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Credit ledger entries are immutable.';
end;
$$;

drop trigger if exists ai_credit_ledger_immutable on public.ai_credit_ledger;
create trigger ai_credit_ledger_immutable
  before update or delete on public.ai_credit_ledger
  for each row execute procedure public.prevent_ai_ledger_mutation();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zentel-ai-files',
  'zentel-ai-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
