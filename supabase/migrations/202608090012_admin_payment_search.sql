-- Read-only, server-side Payment search for verified Admin sessions. The
-- authoritative payments table remains unchanged and exact references retain
-- their existing unique index.

create index if not exists payments_reference_lower_idx
  on public.payments(lower(reference));
create index if not exists payments_customer_name_lower_idx
  on public.payments(lower(customer_name));
create index if not exists payments_customer_phone_idx
  on public.payments(customer_phone);
create index if not exists payments_product_name_lower_idx
  on public.payments(lower(product_name));

create or replace function public.admin_search_payments(
  search_text text default '',
  status_filter text default 'all',
  page_number integer default 1,
  page_size integer default 25
)
returns table (
  id uuid,
  reference text,
  customer_name text,
  customer_email text,
  customer_phone text,
  amount_kobo integer,
  currency text,
  product_name text,
  programme_name text,
  selected_level text,
  payment_status text,
  verification_status text,
  fulfilment_status text,
  paid_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  portal_id text,
  exact_reference_match boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clean_search text := lower(btrim(coalesce(search_text, '')));
  clean_status text := lower(btrim(coalesce(status_filter, 'all')));
  safe_page integer := greatest(coalesce(page_number, 1), 1);
  safe_page_size integer := least(greatest(coalesce(page_size, 25), 1), 50);
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  return query
  with matching_payments as (
    select
      payment.id,
      payment.reference,
      payment.customer_name,
      payment.customer_email,
      payment.customer_phone,
      coalesce(payment.paid_amount_kobo, payment.amount_kobo, payment.expected_amount_kobo) as amount_kobo,
      payment.currency,
      payment.product_name,
      coalesce(program.title, payment.product_name) as programme_name,
      coalesce(payment.selected_level, payment.track_slug, '') as selected_level,
      coalesce(payment.reported_status, payment.status) as payment_status,
      payment.verification_status,
      payment.fulfilment_status,
      payment.paid_at,
      payment.created_at,
      payment.updated_at,
      profile.portal_id,
      lower(payment.reference) = clean_search as exact_reference_match
    from public.payments payment
    left join public.programs program
      on program.id = payment.program_id
    left join public.profiles profile
      on profile.id = payment.user_id
    where (
      clean_status in ('', 'all')
      or lower(coalesce(payment.reported_status, payment.status)) = clean_status
      or lower(payment.verification_status) = clean_status
      or lower(payment.fulfilment_status) = clean_status
    )
    and (
      clean_search = ''
      or lower(payment.reference) = clean_search
      or lower(payment.reference) like '%' || clean_search || '%'
      or payment.normalized_email like '%' || clean_search || '%'
      or lower(payment.customer_name) like '%' || clean_search || '%'
      or lower(payment.customer_phone) like '%' || clean_search || '%'
      or lower(payment.product_name) like '%' || clean_search || '%'
      or lower(coalesce(program.title, '')) like '%' || clean_search || '%'
      or lower(coalesce(payment.product_key, '')) like '%' || clean_search || '%'
      or lower(coalesce(payment.program_slug, '')) like '%' || clean_search || '%'
      or lower(coalesce(payment.selected_level, payment.track_slug, '')) like '%' || clean_search || '%'
      or lower(coalesce(payment.reported_status, payment.status)) like '%' || clean_search || '%'
    )
  )
  select
    matching.id,
    matching.reference,
    matching.customer_name,
    matching.customer_email,
    matching.customer_phone,
    matching.amount_kobo,
    matching.currency,
    matching.product_name,
    matching.programme_name,
    matching.selected_level,
    matching.payment_status,
    matching.verification_status,
    matching.fulfilment_status,
    matching.paid_at,
    matching.created_at,
    matching.updated_at,
    matching.portal_id,
    matching.exact_reference_match,
    count(*) over() as total_count
  from matching_payments matching
  order by
    matching.exact_reference_match desc,
    coalesce(matching.paid_at, matching.created_at) desc,
    matching.id desc
  limit safe_page_size
  offset (safe_page - 1) * safe_page_size;
end;
$$;

create or replace function public.admin_get_payment_details(payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin security verification is required.';
  end if;

  select jsonb_build_object(
    'id', payment.id,
    'reference', payment.reference,
    'brand', payment.brand,
    'provider', payment.provider,
    'provider_transaction_id', coalesce(payment.provider_transaction_id, payment.paystack_transaction_id),
    'customer_name', payment.customer_name,
    'customer_email', payment.customer_email,
    'customer_phone', payment.customer_phone,
    'amount_kobo', coalesce(payment.paid_amount_kobo, payment.amount_kobo, payment.expected_amount_kobo),
    'expected_amount_kobo', payment.expected_amount_kobo,
    'paid_amount_kobo', payment.paid_amount_kobo,
    'currency', payment.currency,
    'product_type', payment.product_type,
    'product_name', payment.product_name,
    'programme_name', coalesce(program.title, payment.product_name),
    'track_name', coalesce(level_record.level_name, payment.selected_level, payment.track_slug),
    'status', coalesce(payment.reported_status, payment.status),
    'provider_status', payment.provider_status,
    'verification_status', payment.verification_status,
    'verification_source', payment.verification_source,
    'fulfilment_status', payment.fulfilment_status,
    'payment_channel', payment.payment_channel,
    'gateway_response', payment.gateway_response,
    'reconciliation_required', payment.reconciliation_required,
    'created_at', payment.created_at,
    'updated_at', payment.updated_at,
    'paid_at', payment.paid_at,
    'verified_at', payment.verified_at,
    'linked_at', payment.linked_at,
    'account', case when profile.id is null then null else jsonb_build_object(
      'id', profile.id,
      'portal_id', profile.portal_id,
      'full_name', profile.full_name,
      'email', profile.email,
      'account_status', profile.account_status
    ) end,
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', transaction_record.id,
        'reference', transaction_record.reference,
        'provider_transaction_id', transaction_record.provider_transaction_id,
        'amount_kobo', transaction_record.amount_kobo,
        'currency', transaction_record.currency,
        'transaction_status', transaction_record.transaction_status,
        'verification_status', transaction_record.verification_status,
        'verification_source', transaction_record.verification_source,
        'verified_at', transaction_record.verified_at,
        'paid_at', transaction_record.paid_at,
        'created_at', transaction_record.created_at
      ) order by transaction_record.created_at desc)
      from public.payment_transactions transaction_record
      where transaction_record.payment_id = payment.id
    ), '[]'::jsonb),
    'fulfilments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fulfilment.id,
        'fulfilment_type', fulfilment.fulfilment_type,
        'status', fulfilment.status,
        'enrolment_id', fulfilment.enrolment_id,
        'attempt_count', fulfilment.attempt_count,
        'failure_code', fulfilment.failure_code,
        'fulfilled_at', fulfilment.fulfilled_at,
        'created_at', fulfilment.created_at,
        'updated_at', fulfilment.updated_at
      ) order by fulfilment.created_at desc)
      from public.payment_fulfilments fulfilment
      where fulfilment.payment_id = payment.id
    ), '[]'::jsonb)
  )
  into result
  from public.payments payment
  left join public.programs program on program.id = payment.program_id
  left join public.program_levels level_record on level_record.id = payment.track_id
  left join public.profiles profile on profile.id = payment.user_id
  where payment.id = payment_id;

  if result is null then
    raise exception 'Payment record was not found.';
  end if;
  return result;
end;
$$;

revoke all on function public.admin_search_payments(text, text, integer, integer) from public, anon;
revoke all on function public.admin_get_payment_details(uuid) from public, anon;
grant execute on function public.admin_search_payments(text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_payment_details(uuid) to authenticated;

notify pgrst, 'reload schema';
