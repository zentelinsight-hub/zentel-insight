alter table public.payments drop constraint if exists payments_brand_check;
alter table public.payments
  add constraint payments_brand_check
  check (brand in ('zentel', 'zentel_insight', 'studyhub'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in ('initiated','pending','initialized','processing','ongoing','success','failed','cancelled','abandoned','reversed'));

alter table public.payments add column if not exists student_name text;
alter table public.payments add column if not exists program_id uuid references public.programs(id);
alter table public.payments add column if not exists program_slug text;
alter table public.payments add column if not exists track_id uuid references public.program_levels(id);
alter table public.payments add column if not exists track_slug text;
alter table public.payments add column if not exists class_level text;
alter table public.payments add column if not exists subject_ids jsonb not null default '[]'::jsonb;
alter table public.payments add column if not exists months integer;
alter table public.payments add column if not exists amount_kobo integer;
alter table public.payments add column if not exists provider text not null default 'paystack';
alter table public.payments add column if not exists provider_status text;
alter table public.payments add column if not exists provider_transaction_id text;
alter table public.payments add column if not exists initialization_mode text;
alter table public.payments add column if not exists access_code text;
alter table public.payments add column if not exists authorization_url text;
alter table public.payments add column if not exists failure_reason text;
alter table public.payments add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.payments add column if not exists verified_at timestamptz;

update public.payments
set amount_kobo = expected_amount_kobo
where amount_kobo is null;

alter table public.payments drop constraint if exists payments_amount_kobo_positive_check;
alter table public.payments
  add constraint payments_amount_kobo_positive_check
  check (amount_kobo is null or amount_kobo > 0);

alter table public.payments drop constraint if exists payments_months_positive_check;
alter table public.payments
  add constraint payments_months_positive_check
  check (months is null or months > 0);

alter table public.payments drop constraint if exists payments_initialization_mode_check;
alter table public.payments
  add constraint payments_initialization_mode_check
  check (
    initialization_mode is null
    or initialization_mode in ('backend', 'frontend_fallback', 'backend_failed')
  );

create unique index if not exists payments_reference_unique_idx on public.payments(reference);
create index if not exists payments_provider_status_idx on public.payments(provider, provider_status);
create index if not exists payments_brand_status_idx on public.payments(brand, status);

alter table public.enrolments alter column user_id drop not null;
alter table public.enrolments drop constraint if exists enrolments_status_check;
alter table public.enrolments
  add constraint enrolments_status_check
  check (status in ('pending','active','paid_unlinked','completed','cancelled'));

drop policy if exists "Users can read own Zentel payments" on public.payments;
create policy "Users can read own Zentel payments"
  on public.payments for select
  using (auth.uid() = user_id and brand in ('zentel', 'zentel_insight'));
