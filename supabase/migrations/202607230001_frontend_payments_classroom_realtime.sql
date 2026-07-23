create extension if not exists "pgcrypto";

alter table public.payments add column if not exists reported_status text not null default 'initiated';
alter table public.payments add column if not exists verification_status text not null default 'unverified';
alter table public.payments add column if not exists client_event_token_hash text;
alter table public.payments add column if not exists opened_at timestamptz;
alter table public.payments add column if not exists client_success_at timestamptz;
alter table public.payments add column if not exists cancelled_at timestamptz;
alter table public.payments add column if not exists closed_at timestamptz;
alter table public.payments add column if not exists failed_at timestamptz;
alter table public.payments add column if not exists abandoned_at timestamptz;
alter table public.payments add column if not exists last_client_event_at timestamptz;

update public.payments
set verification_status = case when verified_at is not null then 'verified' else 'unverified' end,
    reported_status = case
      when verified_at is null and status = 'success' then 'client_success'
      else status
    end;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in (
    'initiated', 'opened', 'client_success', 'pending', 'initialized', 'processing', 'ongoing',
    'success', 'failed', 'declined', 'cancelled', 'closed', 'abandoned', 'reversed'
  ));

alter table public.payments drop constraint if exists payments_reported_status_check;
alter table public.payments
  add constraint payments_reported_status_check
  check (reported_status in (
    'initiated', 'opened', 'client_success', 'pending', 'initialized', 'processing', 'ongoing',
    'success', 'failed', 'declined', 'cancelled', 'closed', 'abandoned', 'reversed'
  ));

alter table public.payments drop constraint if exists payments_verification_status_check;
alter table public.payments
  add constraint payments_verification_status_check
  check (verification_status in ('unverified', 'verified', 'rejected'));

alter table public.payments drop constraint if exists payments_initialization_mode_check;
alter table public.payments
  add constraint payments_initialization_mode_check
  check (
    initialization_mode is null
    or initialization_mode in ('backend', 'frontend_fallback', 'backend_failed', 'frontend_direct')
  );

create table if not exists public.payment_attempt_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  reference text not null,
  event_type text not null check (event_type in (
    'initiated', 'opened', 'client_success', 'cancelled', 'closed', 'failed', 'abandoned'
  )),
  provider_transaction_id text,
  event_message text,
  event_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.payment_attempt_events enable row level security;

drop policy if exists "Verified admins can read payment attempt events" on public.payment_attempt_events;
create policy "Verified admins can read payment attempt events"
  on public.payment_attempt_events for select
  to authenticated
  using (public.is_verified_admin_session());

create index if not exists payment_attempt_events_payment_created_idx
  on public.payment_attempt_events(payment_id, created_at desc);
create index if not exists payment_attempt_events_reference_created_idx
  on public.payment_attempt_events(reference, created_at desc);
create index if not exists payments_reported_verification_created_idx
  on public.payments(reported_status, verification_status, created_at desc);

create or replace function public.create_frontend_payment_attempt(
  input_reference text,
  input_brand text,
  input_product_type text,
  input_program_id uuid,
  input_track_id uuid,
  input_program_slug text,
  input_track_slug text,
  input_class_level text,
  input_subject_names jsonb,
  input_months integer,
  input_customer_name text,
  input_customer_email text,
  input_customer_phone text,
  input_student_name text
)
returns table (
  payment_id uuid,
  reference text,
  amount_kobo integer,
  currency text,
  client_event_token text,
  reported_status text,
  verification_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reference text := upper(btrim(coalesce(input_reference, '')));
  clean_brand text := lower(btrim(coalesce(input_brand, '')));
  clean_product_type text := lower(btrim(coalesce(input_product_type, '')));
  clean_program_slug text := lower(btrim(coalesce(input_program_slug, '')));
  clean_track_slug text := lower(btrim(coalesce(input_track_slug, '')));
  clean_class_level text := upper(btrim(coalesce(input_class_level, '')));
  clean_customer_name text := btrim(coalesce(input_customer_name, ''));
  clean_customer_email text := lower(btrim(coalesce(input_customer_email, '')));
  clean_customer_phone text := btrim(coalesce(input_customer_phone, ''));
  clean_student_name text := btrim(coalesce(input_student_name, ''));
  clean_subject_names jsonb := coalesce(input_subject_names, '[]'::jsonb);
  selected_program public.programs;
  selected_track public.program_levels;
  trusted_amount_kobo integer;
  trusted_product_name text;
  trusted_selected_level text;
  subject_count integer := 0;
  raw_client_token text := encode(gen_random_bytes(24), 'hex');
  saved_payment public.payments;
begin
  if clean_reference !~ '^(ZI-COURSE|ZH-(JSS|SSS|SUMMER))-[0-9]{13}-[A-Z0-9]{8,20}$' then
    raise exception 'The payment reference is invalid.';
  end if;
  if length(clean_customer_name) < 2 or length(clean_customer_name) > 160 then
    raise exception 'Enter a valid customer name.';
  end if;
  if clean_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(clean_customer_email) > 254 then
    raise exception 'Enter a valid customer email address.';
  end if;
  if length(clean_customer_phone) < 7 or length(clean_customer_phone) > 32 then
    raise exception 'Enter a valid customer phone number.';
  end if;

  if clean_brand in ('zentel', 'zentel_insight') and clean_product_type = 'zentel_course' then
    if input_program_id is null or input_track_id is null then
      raise exception 'A valid programme and track are required.';
    end if;

    select * into selected_program
    from public.programs
    where id = input_program_id
      and active = true;

    if selected_program.id is null or selected_program.slug <> clean_program_slug then
      raise exception 'The selected programme is invalid.';
    end if;

    select * into selected_track
    from public.program_levels
    where id = input_track_id
      and program_id = selected_program.id
      and active = true;

    if selected_track.id is null then
      raise exception 'The selected track is invalid.';
    end if;
    if lower(regexp_replace(regexp_replace(selected_track.level_name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')) <> clean_track_slug then
      raise exception 'The selected track is invalid.';
    end if;

    trusted_amount_kobo := selected_track.price_kobo;
    trusted_product_name := selected_program.title;
    trusted_selected_level := selected_track.level_name;
    clean_brand := 'zentel_insight';
  elsif clean_brand = 'studyhub' and clean_product_type in ('studyhub_jss', 'studyhub_sss', 'studyhub_summer_lessons') then
    if clean_class_level !~ '^(JSS|SSS)[1-3]$' then
      raise exception 'The selected class is invalid.';
    end if;
    if jsonb_typeof(clean_subject_names) <> 'array' then
      raise exception 'The selected subjects are invalid.';
    end if;

    subject_count := jsonb_array_length(clean_subject_names);
    if clean_product_type = 'studyhub_summer_lessons' then
      if input_months is distinct from 1 then
        raise exception 'The Summer Lessons duration is invalid.';
      end if;
      trusted_amount_kobo := 3000000;
      trusted_product_name := 'Summer Lessons';
    else
      if subject_count < 1 or subject_count > 20 or input_months is null or input_months < 1 or input_months > 12 then
        raise exception 'The selected StudyHub options are invalid.';
      end if;
      if clean_product_type = 'studyhub_jss' and clean_class_level !~ '^JSS[1-3]$' then
        raise exception 'The selected StudyHub class is invalid.';
      end if;
      if clean_product_type = 'studyhub_sss' and clean_class_level !~ '^SSS[1-3]$' then
        raise exception 'The selected StudyHub class is invalid.';
      end if;
      trusted_amount_kobo := (case when clean_product_type = 'studyhub_sss' then 2000000 else 1500000 end)
        * subject_count * input_months;
      trusted_product_name := case when clean_product_type = 'studyhub_sss' then 'StudyHub SSS' else 'StudyHub JSS' end;
    end if;
    trusted_selected_level := clean_class_level;
  else
    raise exception 'The selected payment product is invalid.';
  end if;

  if trusted_amount_kobo is null or trusted_amount_kobo <= 0 then
    raise exception 'The current price could not be resolved.';
  end if;

  insert into public.payments (
    reference,
    user_id,
    brand,
    product_type,
    product_id,
    product_key,
    product_name,
    selected_level,
    selected_subjects,
    selected_class,
    number_of_months,
    customer_name,
    customer_email,
    customer_phone,
    student_name,
    expected_amount_kobo,
    amount_kobo,
    currency,
    status,
    reported_status,
    verification_status,
    provider,
    provider_status,
    verification_source,
    initialization_mode,
    program_id,
    program_slug,
    track_id,
    track_slug,
    class_level,
    subject_ids,
    months,
    metadata,
    client_event_token_hash,
    last_client_event_at
  )
  values (
    clean_reference,
    auth.uid(),
    clean_brand,
    clean_product_type,
    selected_program.id,
    coalesce(nullif(clean_track_slug, ''), clean_product_type),
    trusted_product_name,
    trusted_selected_level,
    clean_subject_names,
    nullif(clean_class_level, ''),
    input_months,
    clean_customer_name,
    clean_customer_email,
    clean_customer_phone,
    nullif(clean_student_name, ''),
    trusted_amount_kobo,
    trusted_amount_kobo,
    'NGN',
    'initiated',
    'initiated',
    'unverified',
    'paystack',
    'initiated',
    'frontend_client_report',
    'frontend_direct',
    selected_program.id,
    nullif(clean_program_slug, ''),
    selected_track.id,
    nullif(clean_track_slug, ''),
    nullif(clean_class_level, ''),
    clean_subject_names,
    input_months,
    jsonb_build_object('source', 'frontend_direct', 'client_reported', true),
    encode(digest(raw_client_token, 'sha256'), 'hex'),
    now()
  )
  returning * into saved_payment;

  insert into public.payment_attempt_events (
    payment_id,
    reference,
    event_type,
    event_metadata
  )
  values (
    saved_payment.id,
    saved_payment.reference,
    'initiated',
    jsonb_build_object('source', 'frontend_direct')
  );

  return query
  select
    saved_payment.id,
    saved_payment.reference,
    saved_payment.amount_kobo,
    saved_payment.currency,
    raw_client_token,
    saved_payment.reported_status,
    saved_payment.verification_status;
end;
$$;

revoke all on function public.create_frontend_payment_attempt(
  text, text, text, uuid, uuid, text, text, text, jsonb, integer, text, text, text, text
) from public;
grant execute on function public.create_frontend_payment_attempt(
  text, text, text, uuid, uuid, text, text, text, jsonb, integer, text, text, text, text
) to anon, authenticated;

create or replace function public.record_frontend_payment_event(
  input_reference text,
  input_client_event_token text,
  input_event_type text,
  input_provider_transaction_id text default null,
  input_event_message text default null
)
returns table (
  payment_id uuid,
  reference text,
  reported_status text,
  verification_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reference text := upper(btrim(coalesce(input_reference, '')));
  clean_token text := btrim(coalesce(input_client_event_token, ''));
  clean_event text := lower(btrim(coalesce(input_event_type, '')));
  clean_transaction_id text := left(btrim(coalesce(input_provider_transaction_id, '')), 120);
  clean_message text := left(btrim(coalesce(input_event_message, '')), 500);
  current_payment public.payments;
  saved_payment public.payments;
  server_verified boolean;
begin
  if clean_event not in ('initiated', 'opened', 'client_success', 'cancelled', 'closed', 'failed', 'abandoned') then
    raise exception 'The payment event is invalid.';
  end if;
  if length(clean_token) < 32 then
    raise exception 'The payment event token is invalid.';
  end if;

  select * into current_payment
  from public.payments
  where payments.reference = clean_reference
    and payments.client_event_token_hash = encode(digest(clean_token, 'sha256'), 'hex');

  if current_payment.id is null then
    raise exception 'The payment attempt could not be found.';
  end if;

  server_verified := current_payment.verified_at is not null or current_payment.verification_status = 'verified';

  update public.payments
  set
    reported_status = clean_event,
    status = case when server_verified then status else clean_event end,
    provider_status = case when server_verified then provider_status else clean_event end,
    provider_transaction_id = coalesce(nullif(clean_transaction_id, ''), provider_transaction_id),
    failure_reason = case
      when clean_event in ('failed', 'cancelled', 'closed', 'abandoned') then coalesce(nullif(clean_message, ''), clean_event)
      else failure_reason
    end,
    opened_at = case when clean_event = 'opened' then coalesce(opened_at, now()) else opened_at end,
    client_success_at = case when clean_event = 'client_success' then coalesce(client_success_at, now()) else client_success_at end,
    cancelled_at = case when clean_event = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
    closed_at = case when clean_event = 'closed' then coalesce(closed_at, now()) else closed_at end,
    failed_at = case when clean_event = 'failed' then coalesce(failed_at, now()) else failed_at end,
    abandoned_at = case when clean_event = 'abandoned' then coalesce(abandoned_at, now()) else abandoned_at end,
    last_client_event_at = now(),
    updated_at = now()
  where id = current_payment.id
  returning * into saved_payment;

  insert into public.payment_attempt_events (
    payment_id,
    reference,
    event_type,
    provider_transaction_id,
    event_message,
    event_metadata
  )
  values (
    saved_payment.id,
    saved_payment.reference,
    clean_event,
    nullif(clean_transaction_id, ''),
    nullif(clean_message, ''),
    jsonb_build_object('source', 'frontend_direct', 'server_verified_at_event', server_verified)
  );

  return query
  select
    saved_payment.id,
    saved_payment.reference,
    saved_payment.reported_status,
    saved_payment.verification_status,
    saved_payment.updated_at;
end;
$$;

revoke all on function public.record_frontend_payment_event(text, text, text, text, text) from public;
grant execute on function public.record_frontend_payment_event(text, text, text, text, text) to anon, authenticated;

create or replace function public.get_program_chat_unread_counts()
returns table (
  room_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    message.room_id,
    count(*)::bigint as unread_count
  from public.program_chat_messages message
  join public.program_chat_members member
    on member.room_id = message.room_id
   and member.user_id = auth.uid()
   and member.active = true
  where public.is_account_active(auth.uid())
    and message.sender_id <> auth.uid()
    and message.deleted_for_moderation_at is null
    and not exists (
      select 1
      from public.message_read_receipts receipt
      where receipt.message_id = message.id
        and receipt.user_id = auth.uid()
    )
  group by message.room_id;
$$;

revoke all on function public.get_program_chat_unread_counts() from public;
grant execute on function public.get_program_chat_unread_counts() to authenticated;

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'payments',
      'payment_attempt_events',
      'profiles',
      'programs',
      'program_levels',
      'enrolments',
      'student_program_preferences',
      'tutor_program_assignments',
      'program_chat_messages',
      'message_read_receipts',
      'live_class_sessions'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end $$;
