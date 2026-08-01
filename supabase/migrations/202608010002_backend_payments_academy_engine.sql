-- Backend-only payments and academy engine.
-- Additive migration: existing users, prices, enrolments, assignments, chat records,
-- live classes, AI records, and payment history are preserved.

-- ---------------------------------------------------------------------------
-- Payment authority, identity linking, and financial audit projections.
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists normalized_email text,
  add column if not exists initialization_request_id uuid,
  add column if not exists linked_at timestamptz,
  add column if not exists reconciliation_required boolean not null default false;

update public.payments
set normalized_email = lower(btrim(customer_email))
where normalized_email is null or normalized_email <> lower(btrim(customer_email));

alter table public.payments alter column normalized_email set not null;

create unique index if not exists payments_initialization_request_id_uidx
  on public.payments(initialization_request_id)
  where initialization_request_id is not null;
create index if not exists payments_normalized_email_idx on public.payments(normalized_email);
create index if not exists payments_status_created_idx on public.payments(status, created_at desc);
create index if not exists payments_user_created_idx on public.payments(user_id, created_at desc);
create index if not exists payments_fulfilment_idx on public.payments(fulfilment_status, created_at desc);

alter table public.payment_attempt_events drop constraint if exists payment_attempt_events_payment_id_fkey;
alter table public.payment_attempt_events
  add constraint payment_attempt_events_payment_id_fkey
  foreign key (payment_id) references public.payments(id) on delete restrict;

create or replace function public.normalize_payment_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.customer_email := lower(btrim(new.customer_email));
  new.normalized_email := new.customer_email;
  if new.user_id is not null and new.linked_at is null then
    new.linked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists payments_normalize_identity on public.payments;
create trigger payments_normalize_identity
before insert or update of customer_email, user_id on public.payments
for each row execute function public.normalize_payment_identity();

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  reference text not null,
  provider_transaction_id text,
  amount_kobo integer not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  transaction_status text not null check (transaction_status in ('pending', 'successful', 'failed', 'reversed')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'rejected')),
  verification_source text,
  verified_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, transaction_status, verification_status)
);

create table if not exists public.payment_fulfilments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  fulfilment_type text not null check (fulfilment_type in ('course_enrolment', 'studyhub_registration', 'ai_subscription', 'ai_credits')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'fulfilled', 'failed')),
  enrolment_id uuid references public.enrolments(id) on delete set null,
  attempt_count integer not null default 0,
  failure_code text,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, fulfilment_type)
);

create table if not exists public.payment_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  started_by uuid references auth.users(id) on delete set null,
  run_mode text not null default 'scheduled' check (run_mode in ('scheduled', 'manual', 'dry_run')),
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed')),
  scanned_count integer not null default 0,
  verified_count integer not null default 0,
  pending_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb
);

alter table public.payment_transactions enable row level security;
alter table public.payment_fulfilments enable row level security;
alter table public.payment_reconciliation_runs enable row level security;

create index if not exists payment_transactions_reference_idx on public.payment_transactions(reference);
create index if not exists payment_transactions_payment_idx on public.payment_transactions(payment_id, created_at desc);
create index if not exists payment_fulfilments_payment_idx on public.payment_fulfilments(payment_id, status);

drop policy if exists "Students read own payment transactions" on public.payment_transactions;
create policy "Students read own payment transactions"
on public.payment_transactions for select
using (exists (select 1 from public.payments p where p.id = payment_id and p.user_id = auth.uid()));

drop policy if exists "Verified admins read payment transactions" on public.payment_transactions;
create policy "Verified admins read payment transactions"
on public.payment_transactions for select
using (public.is_verified_admin_session());

drop policy if exists "Students read own payment fulfilments" on public.payment_fulfilments;
create policy "Students read own payment fulfilments"
on public.payment_fulfilments for select
using (exists (select 1 from public.payments p where p.id = payment_id and p.user_id = auth.uid()));

drop policy if exists "Verified admins read payment fulfilments" on public.payment_fulfilments;
create policy "Verified admins read payment fulfilments"
on public.payment_fulfilments for select
using (public.is_verified_admin_session());

drop policy if exists "Verified admins read reconciliation runs" on public.payment_reconciliation_runs;
create policy "Verified admins read reconciliation runs"
on public.payment_reconciliation_runs for select
using (public.is_verified_admin_session());

create or replace function public.project_payment_audit_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  projected_status text;
  projected_fulfilment_type text;
begin
  projected_status := case
    when new.status = 'success' then 'successful'
    when new.status = 'reversed' then 'reversed'
    when new.status in ('failed', 'cancelled', 'abandoned') then 'failed'
    else 'pending'
  end;

  insert into public.payment_transactions (
    payment_id, reference, provider_transaction_id, amount_kobo, currency,
    transaction_status, verification_status, verification_source, verified_at, paid_at
  ) values (
    new.id, new.reference, coalesce(new.provider_transaction_id, new.paystack_transaction_id),
    coalesce(new.paid_amount_kobo, new.expected_amount_kobo), new.currency,
    projected_status, coalesce(new.verification_status, 'unverified'), new.verification_source,
    new.verified_at, new.paid_at
  )
  on conflict (payment_id, transaction_status, verification_status) do nothing;

  projected_fulfilment_type := case
    when new.product_type = 'zentel_course' then 'course_enrolment'
    when new.product_type like 'studyhub_%' then 'studyhub_registration'
    when new.product_type = 'zentel_ai_subscription' then 'ai_subscription'
    when new.product_type = 'zentel_ai_topup' then 'ai_credits'
    else null
  end;

  if projected_fulfilment_type is not null then
    insert into public.payment_fulfilments (payment_id, fulfilment_type, status, fulfilled_at)
    values (
      new.id,
      projected_fulfilment_type,
      case when new.fulfilment_status = 'fulfilled' or (new.status = 'success' and projected_fulfilment_type in ('course_enrolment', 'studyhub_registration')) then 'fulfilled'
           when new.fulfilment_status = 'failed' then 'failed'
           else 'pending' end,
      case when new.fulfilment_status = 'fulfilled' or (new.status = 'success' and projected_fulfilment_type in ('course_enrolment', 'studyhub_registration')) then coalesce(new.verified_at, now()) end
    )
    on conflict (payment_id, fulfilment_type) do update
    set status = excluded.status,
        fulfilled_at = coalesce(public.payment_fulfilments.fulfilled_at, excluded.fulfilled_at),
        updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists payments_project_audit on public.payments;
create trigger payments_project_audit
after insert or update of status, verification_status, fulfilment_status on public.payments
for each row execute function public.project_payment_audit_records();

create or replace function public.protect_payment_transaction_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Payment transaction history is immutable.';
end;
$$;

drop trigger if exists payment_transactions_immutable on public.payment_transactions;
create trigger payment_transactions_immutable
before update or delete on public.payment_transactions
for each row execute function public.protect_payment_transaction_history();

drop trigger if exists payment_attempt_events_immutable on public.payment_attempt_events;
create trigger payment_attempt_events_immutable
before update or delete on public.payment_attempt_events
for each row execute function public.protect_payment_transaction_history();

insert into public.payment_transactions (
  payment_id, reference, provider_transaction_id, amount_kobo, currency,
  transaction_status, verification_status, verification_source, verified_at, paid_at
)
select p.id, p.reference, coalesce(p.provider_transaction_id, p.paystack_transaction_id),
       coalesce(p.paid_amount_kobo, p.expected_amount_kobo), p.currency,
       case when p.status = 'success' then 'successful' when p.status = 'reversed' then 'reversed'
            when p.status in ('failed', 'cancelled', 'abandoned') then 'failed' else 'pending' end,
       coalesce(p.verification_status, 'unverified'), p.verification_source, p.verified_at, p.paid_at
from public.payments p
on conflict (payment_id, transaction_status, verification_status) do nothing;

create or replace function public.claim_verified_payments(target_user_id uuid, verified_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_email text := lower(btrim(coalesce(verified_email, '')));
  claimed_count integer := 0;
begin
  if target_user_id is null or canonical_email = '' then
    raise exception 'A verified account is required.';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = target_user_id
      and lower(btrim(coalesce(u.email, ''))) = canonical_email
      and u.email_confirmed_at is not null
  ) then
    raise exception 'The verified email does not match this account.';
  end if;

  with claimed as (
    update public.payments p
    set user_id = target_user_id, linked_at = now()
    where p.user_id is null
      and p.status = 'success'
      and p.normalized_email = canonical_email
      and p.brand in ('zentel', 'zentel_insight')
    returning p.id
  ), activated as (
    update public.enrolments e
    set user_id = target_user_id, status = 'active', updated_at = now()
    where e.user_id is null
      and e.status = 'paid_unlinked'
      and e.payment_id in (select id from claimed)
    returning e.id
  )
  select count(*) into claimed_count from activated;

  return claimed_count;
end;
$$;

revoke all on function public.claim_verified_payments(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_verified_payments(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Programme track, cohort, classroom, and membership model.
-- program_levels remains the canonical programme-track table.
-- ---------------------------------------------------------------------------

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  track_id uuid not null references public.program_levels(id) on delete restrict,
  name text not null,
  code text not null unique,
  start_date date not null,
  end_date date,
  timezone text not null default 'Africa/Lagos',
  status text not null default 'active' check (status in ('planned', 'active', 'completed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track_id, name),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  track_id uuid not null references public.program_levels(id) on delete restrict,
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  name text not null,
  code text not null unique,
  status text not null default 'active' check (status in ('planned', 'active', 'completed', 'cancelled')),
  capacity integer check (capacity is null or capacity > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, name)
);

create table if not exists public.classroom_memberships (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  member_role text not null default 'student' check (member_role in ('student', 'tutor')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, user_id, member_role)
);

create table if not exists public.tutor_classroom_assignments (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users(id) on delete restrict,
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  assignment_role text not null default 'lead_tutor' check (assignment_role in ('lead_tutor', 'assistant_tutor', 'reviewer')),
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tutor_id, classroom_id)
);

create unique index if not exists classroom_memberships_one_active_student_idx
  on public.classroom_memberships(user_id)
  where member_role = 'student' and active = true;
create index if not exists classroom_memberships_classroom_idx on public.classroom_memberships(classroom_id, active, user_id);
create index if not exists tutor_classroom_assignments_tutor_idx on public.tutor_classroom_assignments(tutor_id, active, classroom_id);
create index if not exists tutor_classroom_assignments_classroom_idx on public.tutor_classroom_assignments(classroom_id, active, tutor_id);
create index if not exists classrooms_track_status_idx on public.classrooms(track_id, status, created_at desc);
create index if not exists cohorts_track_status_idx on public.cohorts(track_id, status, start_date desc);

alter table public.enrolments
  add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict,
  add column if not exists classroom_id uuid references public.classrooms(id) on delete restrict;

create index if not exists enrolments_classroom_status_idx on public.enrolments(classroom_id, status, user_id);

alter table public.cohorts enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_memberships enable row level security;
alter table public.tutor_classroom_assignments enable row level security;

create or replace function public.is_student_in_classroom(target_classroom_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_account_active(target_user_id)
    and exists (
      select 1 from public.classroom_memberships m
      where m.classroom_id = target_classroom_id
        and m.user_id = target_user_id
        and m.member_role = 'student'
        and m.active = true
        and m.left_at is null
    );
$$;

create or replace function public.is_tutor_for_classroom(target_classroom_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_account_active(target_user_id)
    and exists (
      select 1 from public.tutor_classroom_assignments a
      where a.classroom_id = target_classroom_id
        and a.tutor_id = target_user_id
        and a.active = true
    );
$$;

create or replace function public.can_access_classroom(target_classroom_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_verified_admin_session()
      or public.is_student_in_classroom(target_classroom_id, target_user_id)
      or public.is_tutor_for_classroom(target_classroom_id, target_user_id);
$$;

grant execute on function public.is_student_in_classroom(uuid, uuid) to authenticated;
grant execute on function public.is_tutor_for_classroom(uuid, uuid) to authenticated;
grant execute on function public.can_access_classroom(uuid, uuid) to authenticated;

drop policy if exists "Members read cohorts" on public.cohorts;
create policy "Members read cohorts" on public.cohorts for select
using (public.is_verified_admin_session() or exists (
  select 1 from public.classrooms c where c.cohort_id = cohorts.id and public.can_access_classroom(c.id)
));

drop policy if exists "Members read classrooms" on public.classrooms;
create policy "Members read classrooms" on public.classrooms for select
using (public.can_access_classroom(id));

drop policy if exists "Members read classroom memberships" on public.classroom_memberships;
create policy "Members read classroom memberships" on public.classroom_memberships for select
using (public.can_access_classroom(classroom_id));

drop policy if exists "Tutors read own classroom assignments" on public.tutor_classroom_assignments;
create policy "Tutors read own classroom assignments" on public.tutor_classroom_assignments for select
using (tutor_id = auth.uid() or public.is_verified_admin_session());

create or replace function public.ensure_current_classroom(target_program_id uuid, target_track_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cohort_id uuid;
  target_classroom_id uuid;
  programme_title text;
  track_title text;
  intake_name text := to_char(current_date, 'FMMonth YYYY') || ' Intake';
  intake_code text;
begin
  select p.title, l.level_name into programme_title, track_title
  from public.programs p
  join public.program_levels l on l.program_id = p.id
  where p.id = target_program_id and l.id = target_track_id and p.active and l.active;
  if programme_title is null then raise exception 'An active programme track is required.'; end if;

  select c.id into target_classroom_id
  from public.classrooms c
  join public.cohorts h on h.id = c.cohort_id
  where c.program_id = target_program_id and c.track_id = target_track_id
    and c.status = 'active' and h.status = 'active'
  order by h.start_date desc, c.created_at desc limit 1;
  if target_classroom_id is not null then return target_classroom_id; end if;

  intake_code := 'COH-' || to_char(current_date, 'YYYYMM') || '-' || upper(substr(replace(target_track_id::text, '-', ''), 1, 6));
  insert into public.cohorts (program_id, track_id, name, code, start_date, status)
  values (target_program_id, target_track_id, intake_name, intake_code, current_date, 'active')
  on conflict (track_id, name) do update set status = 'active', updated_at = now()
  returning id into target_cohort_id;

  insert into public.classrooms (program_id, track_id, cohort_id, name, code, status)
  values (
    target_program_id, target_track_id, target_cohort_id,
    programme_title || ' - ' || track_title || ' - ' || intake_name,
    'CLS-' || upper(substr(replace(target_cohort_id::text, '-', ''), 1, 10)),
    'active'
  )
  on conflict (cohort_id, name) do update set status = 'active', updated_at = now()
  returning id into target_classroom_id;
  return target_classroom_id;
end;
$$;

revoke all on function public.ensure_current_classroom(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_current_classroom(uuid, uuid) to service_role;

create or replace function public.sync_enrolment_classroom()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare resolved_classroom_id uuid;
begin
  if new.status = 'active' and new.user_id is not null then
    resolved_classroom_id := coalesce(new.classroom_id, public.ensure_current_classroom(new.program_id, new.program_level_id));
    new.classroom_id := resolved_classroom_id;
    select cohort_id into new.cohort_id from public.classrooms where id = resolved_classroom_id;
  end if;
  return new;
end;
$$;

drop trigger if exists enrolments_resolve_classroom on public.enrolments;
create trigger enrolments_resolve_classroom
before insert or update of user_id, status, program_id, program_level_id, classroom_id on public.enrolments
for each row execute function public.sync_enrolment_classroom();

create or replace function public.sync_enrolment_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.user_id is not null and new.classroom_id is not null then
    update public.classroom_memberships
    set active = false, left_at = coalesce(left_at, now()), updated_at = now()
    where user_id = new.user_id and member_role = 'student' and active = true and classroom_id <> new.classroom_id;

    insert into public.classroom_memberships (classroom_id, user_id, member_role, active, joined_at, left_at)
    values (new.classroom_id, new.user_id, 'student', true, now(), null)
    on conflict (classroom_id, user_id, member_role) do update
    set active = true, left_at = null, joined_at = case when public.classroom_memberships.active then public.classroom_memberships.joined_at else now() end, updated_at = now();
  elsif tg_op = 'UPDATE' and old.user_id is not null and old.classroom_id is not null and new.status <> 'active' then
    update public.classroom_memberships set active = false, left_at = now(), updated_at = now()
    where classroom_id = old.classroom_id and user_id = old.user_id and member_role = 'student' and active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists enrolments_sync_membership on public.enrolments;
create trigger enrolments_sync_membership
after insert or update of user_id, status, classroom_id on public.enrolments
for each row execute function public.sync_enrolment_membership();

update public.enrolments e
set classroom_id = public.ensure_current_classroom(e.program_id, e.program_level_id)
where e.status = 'active' and e.user_id is not null and e.classroom_id is null;

update public.enrolments e
set cohort_id = c.cohort_id
from public.classrooms c
where c.id = e.classroom_id and e.cohort_id is null;

insert into public.classroom_memberships (classroom_id, user_id, member_role, active, joined_at)
select e.classroom_id, e.user_id, 'student', true, coalesce(e.created_at, now())
from public.enrolments e
where e.status = 'active' and e.user_id is not null and e.classroom_id is not null
on conflict (classroom_id, user_id, member_role) do update set active = true, left_at = null, updated_at = now();

insert into public.tutor_classroom_assignments (tutor_id, classroom_id, assignment_role, active, assigned_at, assigned_by)
select distinct a.tutor_id, c.id, 'lead_tutor', true, coalesce(a.created_at, now()), a.assigned_by
from public.tutor_program_assignments a
join public.classrooms c on c.program_id = a.program_id and (a.track_id is null or c.track_id = a.track_id)
where a.active = true and c.status = 'active'
on conflict (tutor_id, classroom_id) do update set active = true, updated_at = now();

insert into public.classroom_memberships (classroom_id, user_id, member_role, active, joined_at, assigned_by)
select a.classroom_id, a.tutor_id, 'tutor', a.active, a.assigned_at, a.assigned_by
from public.tutor_classroom_assignments a
on conflict (classroom_id, user_id, member_role) do update set active = excluded.active, left_at = case when excluded.active then null else now() end, updated_at = now();

create or replace function public.enforce_backend_payment_initialization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.initialization_mode in ('frontend_fallback', 'frontend_direct') then
    raise exception 'Payment initialization must be completed by the secure payment service.';
  elsif tg_op = 'UPDATE'
     and new.initialization_mode in ('frontend_fallback', 'frontend_direct')
     and old.initialization_mode is distinct from new.initialization_mode then
    raise exception 'Payment initialization must be completed by the secure payment service.';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_backend_initialization_only on public.payments;
create trigger payments_backend_initialization_only
before insert or update of initialization_mode on public.payments
for each row execute function public.enforce_backend_payment_initialization();

-- ---------------------------------------------------------------------------
-- Modules, lessons, timetable, assessments, submissions, grades, attendance,
-- and performance snapshots.
-- ---------------------------------------------------------------------------

create table if not exists public.academy_modules (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  title text not null,
  description text not null default '',
  display_order integer not null default 100,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, title)
);

create table if not exists public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.academy_modules(id) on delete restrict,
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  title text not null,
  summary text not null default '',
  content text not null default '',
  display_order integer not null default 100,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, title)
);

create table if not exists public.timetable_periods (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  start_time time not null,
  end_time time not null,
  is_break boolean not null default false,
  display_order integer not null default 100,
  active boolean not null default true,
  check (end_time > start_time)
);

insert into public.timetable_periods (label, start_time, end_time, is_break, display_order)
values
  ('Period 1', '16:00', '17:00', false, 10),
  ('Period 2', '17:00', '18:00', false, 20),
  ('Break', '18:00', '18:30', true, 30),
  ('Period 3', '18:30', '19:30', false, 40),
  ('Period 4', '19:30', '20:30', false, 50),
  ('Period 5', '20:30', '21:00', false, 60)
on conflict (label) do update
set start_time = excluded.start_time, end_time = excluded.end_time,
    is_break = excluded.is_break, display_order = excluded.display_order, active = true;

alter table public.timetable_entries
  add column if not exists classroom_id uuid references public.classrooms(id) on delete restrict,
  add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict,
  add column if not exists track_id uuid references public.program_levels(id) on delete restrict,
  add column if not exists module_id uuid references public.academy_modules(id) on delete set null,
  add column if not exists lesson_id uuid references public.academy_lessons(id) on delete set null,
  add column if not exists tutor_id uuid references auth.users(id) on delete set null,
  add column if not exists description text not null default '',
  add column if not exists timezone text not null default 'Africa/Lagos',
  add column if not exists recurrence_rule text,
  add column if not exists effective_from date not null default current_date,
  add column if not exists effective_until date,
  add column if not exists live_class_session_id uuid references public.live_class_sessions(id) on delete set null,
  add column if not exists published boolean not null default false,
  add column if not exists override_academy_hours boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.timetable_entries
set track_id = program_level_id
where track_id is null and program_level_id is not null;

with resolved as (
  select entry.id as entry_id, classroom.id as classroom_id, classroom.cohort_id, classroom.track_id
  from public.timetable_entries entry
  cross join lateral (
    select c.id, c.cohort_id, c.track_id
    from public.classrooms c
    where c.program_id = entry.program_id
      and (entry.program_level_id is null or c.track_id = entry.program_level_id)
      and c.status = 'active'
    order by c.created_at desc limit 1
  ) classroom
  where entry.classroom_id is null
)
update public.timetable_entries entry
set classroom_id = resolved.classroom_id,
    cohort_id = resolved.cohort_id,
    track_id = coalesce(entry.track_id, resolved.track_id)
from resolved
where entry.id = resolved.entry_id;

create table if not exists public.timetable_exceptions (
  id uuid primary key default gen_random_uuid(),
  timetable_entry_id uuid not null references public.timetable_entries(id) on delete cascade,
  exception_date date not null,
  exception_type text not null check (exception_type in ('cancelled', 'rescheduled', 'room_change')),
  replacement_start_time time,
  replacement_end_time time,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (timetable_entry_id, exception_date),
  check (replacement_end_time is null or replacement_start_time is null or replacement_end_time > replacement_start_time)
);

create index if not exists timetable_classroom_day_idx on public.timetable_entries(classroom_id, day_of_week, start_time, end_time);
create index if not exists timetable_tutor_day_idx on public.timetable_entries(tutor_id, day_of_week, start_time, end_time);
create index if not exists timetable_effective_idx on public.timetable_entries(effective_from, effective_until, published);

create or replace function public.validate_academy_timetable_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.end_time <= new.start_time then raise exception 'End time must be after start time.'; end if;
  if not new.override_academy_hours and (new.start_time < time '16:00' or new.end_time > time '21:00') then
    raise exception 'Classes must remain between 4:00 PM and 9:00 PM.';
  end if;
  if new.effective_until is not null and new.effective_until < new.effective_from then
    raise exception 'The timetable end date must follow the start date.';
  end if;
  if new.classroom_id is not null and exists (
    select 1 from public.timetable_entries e
    where e.id <> coalesce(new.id, gen_random_uuid()) and e.active and new.active
      and e.classroom_id = new.classroom_id and e.day_of_week = new.day_of_week
      and e.start_time < new.end_time and new.start_time < e.end_time
      and daterange(e.effective_from, coalesce(e.effective_until, 'infinity'::date), '[]')
          && daterange(new.effective_from, coalesce(new.effective_until, 'infinity'::date), '[]')
  ) then raise exception 'This classroom already has a class during that time.'; end if;
  if new.tutor_id is not null and exists (
    select 1 from public.timetable_entries e
    where e.id <> coalesce(new.id, gen_random_uuid()) and e.active and new.active
      and e.tutor_id = new.tutor_id and e.day_of_week = new.day_of_week
      and e.start_time < new.end_time and new.start_time < e.end_time
      and daterange(e.effective_from, coalesce(e.effective_until, 'infinity'::date), '[]')
          && daterange(new.effective_from, coalesce(new.effective_until, 'infinity'::date), '[]')
  ) then raise exception 'This Tutor already has a class during that time.'; end if;
  if new.classroom_id is not null then
    select c.program_id, c.track_id, c.cohort_id
      into new.program_id, new.track_id, new.cohort_id
    from public.classrooms c where c.id = new.classroom_id;
    new.program_level_id := new.track_id;
  end if;
  return new;
end;
$$;

drop trigger if exists timetable_validate_academy_entry on public.timetable_entries;
create trigger timetable_validate_academy_entry
before insert or update on public.timetable_entries
for each row execute function public.validate_academy_timetable_entry();

alter table public.assignments
  add column if not exists classroom_id uuid references public.classrooms(id) on delete restrict,
  add column if not exists module_id uuid references public.academy_modules(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists assessment_type text not null default 'assignment',
  add column if not exists weight numeric(5,2) not null default 0,
  add column if not exists opens_at timestamptz,
  add column if not exists late_submission_policy text not null default 'allow_labelled',
  add column if not exists allowed_file_types text[] not null default array['application/pdf','image/jpeg','image/png'],
  add column if not exists maximum_file_size integer not null default 10485760,
  add column if not exists maximum_attempts integer not null default 1,
  add column if not exists status text not null default 'draft',
  add column if not exists published_at timestamptz,
  add column if not exists time_limit_minutes integer,
  add column if not exists randomize_questions boolean not null default false,
  add column if not exists pass_mark numeric(5,2),
  add column if not exists result_release text not null default 'after_grading';

alter table public.assignments drop constraint if exists assignments_assessment_type_check;
alter table public.assignments add constraint assignments_assessment_type_check
  check (assessment_type in ('assignment', 'quiz', 'test', 'practical', 'project', 'class_activity'));
alter table public.assignments drop constraint if exists assignments_status_check;
alter table public.assignments add constraint assignments_status_check
  check (status in ('draft', 'scheduled', 'published', 'closed', 'archived'));
alter table public.assignments drop constraint if exists assignments_late_policy_check;
alter table public.assignments add constraint assignments_late_policy_check
  check (late_submission_policy in ('disallow', 'allow_labelled', 'allow_until_closed'));
alter table public.assignments drop constraint if exists assignments_result_release_check;
alter table public.assignments add constraint assignments_result_release_check
  check (result_release in ('immediate', 'after_close', 'after_grading'));
alter table public.assignments drop constraint if exists assignments_attempts_check;
alter table public.assignments add constraint assignments_attempts_check check (maximum_attempts > 0);

update public.assignments
set status = case when published then 'published' else 'draft' end,
    published_at = case when published then coalesce(published_at, created_at) end
where status = 'draft' or status is null;

with resolved as (
  select assignment.id as assignment_id, classroom.id as classroom_id
  from public.assignments assignment
  cross join lateral (
    select c.id from public.classrooms c
    where c.program_id = assignment.program_id
      and (assignment.program_level_id is null or c.track_id = assignment.program_level_id)
      and c.status = 'active'
    order by c.created_at desc limit 1
  ) classroom
  where assignment.classroom_id is null
)
update public.assignments assignment
set classroom_id = resolved.classroom_id
from resolved
where assignment.id = resolved.assignment_id;

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assignments(id) on delete cascade,
  question_type text not null check (question_type in ('multiple_choice', 'multiple_response', 'true_false', 'short_answer', 'essay', 'code_response', 'file_upload')),
  prompt text not null,
  points numeric(8,2) not null default 1 check (points > 0),
  correct_answer jsonb,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  display_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assignments(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  attempt_number integer not null default 1 check (attempt_number > 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded', 'expired')),
  answers jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  auto_score numeric(8,2),
  final_score numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, user_id, attempt_number)
);

alter table public.assessment_attempts add column if not exists request_id uuid;
create unique index if not exists assessment_attempts_request_uidx
  on public.assessment_attempts(user_id, request_id) where request_id is not null;

alter table public.assignment_submissions
  add column if not exists classroom_id uuid references public.classrooms(id) on delete restrict,
  add column if not exists attempt_number integer not null default 1,
  add column if not exists idempotency_key uuid,
  add column if not exists receipt_number text,
  add column if not exists published_grade_at timestamptz,
  add column if not exists returned_at timestamptz;

alter table public.assignment_submissions drop constraint if exists assignment_submissions_status_check;
alter table public.assignment_submissions add constraint assignment_submissions_status_check
  check (status in ('not_started', 'in_progress', 'draft', 'submitted', 'submitted_late', 'returned_for_correction', 'returned', 'graded', 'excused', 'missing'));
create unique index if not exists assignment_submissions_idempotency_uidx
  on public.assignment_submissions(user_id, idempotency_key) where idempotency_key is not null;
create index if not exists assignment_submissions_student_idx on public.assignment_submissions(user_id, status, submitted_at desc);
create index if not exists assignment_submissions_classroom_idx on public.assignment_submissions(classroom_id, status, submitted_at desc);

update public.assignment_submissions submission
set classroom_id = assignment.classroom_id
from public.assignments assignment
where assignment.id = submission.assignment_id and submission.classroom_id is null;

create table if not exists public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assignment_submissions(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_grades (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assignments(id) on delete restrict,
  submission_id uuid references public.assignment_submissions(id) on delete restrict,
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  score numeric(10,2),
  maximum_score numeric(10,2) not null check (maximum_score > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'returned_for_correction', 'missing', 'excused', 'withheld')),
  rubric jsonb not null default '{}'::jsonb,
  feedback text not null default '',
  graded_by uuid references auth.users(id) on delete set null,
  graded_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, user_id),
  check (score is null or (score >= 0 and score <= maximum_score))
);

create table if not exists public.grade_feedback (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.assessment_grades(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  feedback_text text not null,
  attachment_path text,
  visible_to_student boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.grade_change_logs (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.assessment_grades(id) on delete restrict,
  previous_score numeric(10,2),
  new_score numeric(10,2),
  previous_status text,
  new_status text not null,
  reason text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.grading_schemes (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references public.classrooms(id) on delete restrict,
  name text not null,
  minimum_percentage numeric(5,2) not null check (minimum_percentage between 0 and 100),
  maximum_percentage numeric(5,2) not null check (maximum_percentage between 0 and 100),
  label text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (maximum_percentage >= minimum_percentage)
);

create table if not exists public.grading_weights (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  category text not null check (category in ('assignment', 'quiz', 'test', 'project', 'attendance')),
  weight numeric(5,2) not null check (weight >= 0 and weight <= 100),
  effective_from date not null default current_date,
  effective_until date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, category, effective_from),
  check (effective_until is null or effective_until >= effective_from)
);

insert into public.grading_weights (classroom_id, category, weight)
select c.id, values_row.category, values_row.weight
from public.classrooms c
cross join (values ('assignment', 25::numeric), ('quiz', 15::numeric), ('test', 20::numeric), ('project', 30::numeric), ('attendance', 10::numeric)) as values_row(category, weight)
where c.status = 'active'
on conflict (classroom_id, category, effective_from) do nothing;

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  timetable_entry_id uuid references public.timetable_entries(id) on delete set null,
  live_class_session_id uuid references public.live_class_sessions(id) on delete set null,
  title text not null,
  session_date date not null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  source text not null default 'tutor' check (source in ('tutor', 'live_class', 'admin')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, session_date, title)
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  attendance_session_id uuid not null references public.attendance_sessions(id) on delete restrict,
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('present', 'late', 'absent', 'excused', 'partially_attended')),
  joined_at timestamptz,
  left_at timestamptz,
  marked_by uuid references auth.users(id) on delete set null,
  correction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_session_id, user_id)
);

create table if not exists public.performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  overall_percentage numeric(5,2) not null default 0 check (overall_percentage between 0 and 100),
  assignment_percentage numeric(5,2),
  quiz_percentage numeric(5,2),
  test_percentage numeric(5,2),
  project_percentage numeric(5,2),
  attendance_percentage numeric(5,2),
  completed_assessments integer not null default 0,
  missing_assessments integer not null default 0,
  calculation_breakdown jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (classroom_id, user_id)
);

create table if not exists public.performance_history (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.performance_snapshots(id) on delete restrict,
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  overall_percentage numeric(5,2) not null,
  calculation_breakdown jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists assessments_classroom_status_idx on public.assignments(classroom_id, status, due_at);
create index if not exists assessment_questions_assessment_idx on public.assessment_questions(assessment_id, display_order);
create index if not exists assessment_attempts_student_idx on public.assessment_attempts(user_id, assessment_id, attempt_number desc);
create index if not exists assessment_grades_student_idx on public.assessment_grades(user_id, classroom_id, status, published_at desc);
create index if not exists assessment_grades_classroom_idx on public.assessment_grades(classroom_id, status, updated_at desc);
create index if not exists grade_change_logs_grade_idx on public.grade_change_logs(grade_id, created_at desc);
create index if not exists attendance_sessions_classroom_idx on public.attendance_sessions(classroom_id, session_date desc, status);
create index if not exists attendance_records_student_idx on public.attendance_records(user_id, classroom_id, created_at desc);
create index if not exists performance_snapshots_student_idx on public.performance_snapshots(user_id, classroom_id);
create index if not exists performance_history_student_idx on public.performance_history(user_id, classroom_id, created_at desc);

alter table public.academy_modules enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.timetable_periods enable row level security;
alter table public.timetable_exceptions enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_options enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.submission_files enable row level security;
alter table public.assessment_grades enable row level security;
alter table public.grade_feedback enable row level security;
alter table public.grade_change_logs enable row level security;
alter table public.grading_schemes enable row level security;
alter table public.grading_weights enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.performance_snapshots enable row level security;
alter table public.performance_history enable row level security;

drop policy if exists "Members read published modules" on public.academy_modules;
create policy "Members read published modules" on public.academy_modules for select
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id) or (status = 'published' and public.is_student_in_classroom(classroom_id)));
drop policy if exists "Assigned Tutors manage modules" on public.academy_modules;
create policy "Assigned Tutors manage modules" on public.academy_modules for all
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id))
with check (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id));

drop policy if exists "Members read published lessons" on public.academy_lessons;
create policy "Members read published lessons" on public.academy_lessons for select
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id) or (status = 'published' and public.is_student_in_classroom(classroom_id)));
drop policy if exists "Assigned Tutors manage lessons" on public.academy_lessons;
create policy "Assigned Tutors manage lessons" on public.academy_lessons for all
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id))
with check (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id));

drop policy if exists "Authenticated users read timetable periods" on public.timetable_periods;
create policy "Authenticated users read timetable periods" on public.timetable_periods for select
using (auth.uid() is not null and active = true);

drop policy if exists "Members read timetable exceptions" on public.timetable_exceptions;
create policy "Members read timetable exceptions" on public.timetable_exceptions for select
using (exists (select 1 from public.timetable_entries e where e.id = timetable_entry_id and public.can_access_classroom(e.classroom_id)));

drop policy if exists "Members read assessment questions" on public.assessment_questions;
create policy "Members read assessment questions" on public.assessment_questions for select
using (exists (
  select 1 from public.assignments a where a.id = assessment_id
    and (public.is_verified_admin_session() or public.is_tutor_for_classroom(a.classroom_id) or (a.status = 'published' and public.is_student_in_classroom(a.classroom_id)))
));
drop policy if exists "Assigned Tutors manage assessment questions" on public.assessment_questions;
create policy "Assigned Tutors manage assessment questions" on public.assessment_questions for all
using (exists (select 1 from public.assignments a where a.id = assessment_id and (public.is_verified_admin_session() or public.is_tutor_for_classroom(a.classroom_id))))
with check (exists (select 1 from public.assignments a where a.id = assessment_id and (public.is_verified_admin_session() or public.is_tutor_for_classroom(a.classroom_id))));

drop policy if exists "Members read assessment options" on public.assessment_options;
create policy "Members read assessment options" on public.assessment_options for select
using (exists (
  select 1 from public.assessment_questions q join public.assignments a on a.id = q.assessment_id
  where q.id = question_id and (public.is_verified_admin_session() or public.is_tutor_for_classroom(a.classroom_id) or (a.status = 'published' and public.is_student_in_classroom(a.classroom_id)))
));
drop policy if exists "Assigned Tutors manage assessment options" on public.assessment_options;
create policy "Assigned Tutors manage assessment options" on public.assessment_options for all
using (exists (select 1 from public.assessment_questions q join public.assignments a on a.id = q.assessment_id where q.id = question_id and (public.is_verified_admin_session() or public.is_tutor_for_classroom(a.classroom_id))))
with check (exists (select 1 from public.assessment_questions q join public.assignments a on a.id = q.assessment_id where q.id = question_id and (public.is_verified_admin_session() or public.is_tutor_for_classroom(a.classroom_id))));

drop policy if exists "Students read own assessment attempts" on public.assessment_attempts;
create policy "Students read own assessment attempts" on public.assessment_attempts for select using (user_id = auth.uid());
drop policy if exists "Tutors read classroom assessment attempts" on public.assessment_attempts;
create policy "Tutors read classroom assessment attempts" on public.assessment_attempts for select
using (exists (select 1 from public.assignments a where a.id = assessment_id and (public.is_verified_admin_session() or public.is_tutor_for_classroom(a.classroom_id))));

drop policy if exists "Students read own submission files" on public.submission_files;
create policy "Students read own submission files" on public.submission_files for select
using (uploader_id = auth.uid() or exists (
  select 1 from public.assignment_submissions s join public.assignments a on a.id = s.assignment_id
  where s.id = submission_id and (public.is_verified_admin_session() or public.is_tutor_for_classroom(a.classroom_id))
));
drop policy if exists "Students add own submission files" on public.submission_files;
create policy "Students add own submission files" on public.submission_files for insert
with check (
  uploader_id = auth.uid() and exists (
    select 1 from public.assignment_submissions s
    where s.id = submission_id and s.user_id = auth.uid() and s.status in ('draft', 'in_progress', 'submitted', 'submitted_late', 'returned', 'returned_for_correction')
  )
);
drop policy if exists "Students remove own submission files" on public.submission_files;
create policy "Students remove own submission files" on public.submission_files for delete
using (uploader_id = auth.uid());

drop policy if exists "Students read published grades" on public.assessment_grades;
create policy "Students read published grades" on public.assessment_grades for select
using (user_id = auth.uid() and status = 'published');
drop policy if exists "Tutors read classroom grades" on public.assessment_grades;
create policy "Tutors read classroom grades" on public.assessment_grades for select
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id));

drop policy if exists "Students read visible grade feedback" on public.grade_feedback;
create policy "Students read visible grade feedback" on public.grade_feedback for select
using (visible_to_student and exists (select 1 from public.assessment_grades g where g.id = grade_id and g.user_id = auth.uid() and g.status = 'published'));
drop policy if exists "Tutors read grade feedback" on public.grade_feedback;
create policy "Tutors read grade feedback" on public.grade_feedback for select
using (exists (select 1 from public.assessment_grades g where g.id = grade_id and (public.is_verified_admin_session() or public.is_tutor_for_classroom(g.classroom_id))));

drop policy if exists "Verified admins read grade history" on public.grade_change_logs;
create policy "Verified admins read grade history" on public.grade_change_logs for select using (public.is_verified_admin_session());
drop policy if exists "Assigned Tutors read grade history" on public.grade_change_logs;
create policy "Assigned Tutors read grade history" on public.grade_change_logs for select
using (exists (select 1 from public.assessment_grades g where g.id = grade_id and public.is_tutor_for_classroom(g.classroom_id)));

drop policy if exists "Members read grading schemes" on public.grading_schemes;
create policy "Members read grading schemes" on public.grading_schemes for select
using (classroom_id is null or public.can_access_classroom(classroom_id));
drop policy if exists "Members read grading weights" on public.grading_weights;
create policy "Members read grading weights" on public.grading_weights for select
using (public.can_access_classroom(classroom_id));

drop policy if exists "Members read attendance sessions" on public.attendance_sessions;
create policy "Members read attendance sessions" on public.attendance_sessions for select
using (public.can_access_classroom(classroom_id));
drop policy if exists "Students read own attendance" on public.attendance_records;
create policy "Students read own attendance" on public.attendance_records for select
using (user_id = auth.uid());
drop policy if exists "Tutors read classroom attendance" on public.attendance_records;
create policy "Tutors read classroom attendance" on public.attendance_records for select
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id));

drop policy if exists "Students read own performance" on public.performance_snapshots;
create policy "Students read own performance" on public.performance_snapshots for select using (user_id = auth.uid());
drop policy if exists "Tutors read classroom performance" on public.performance_snapshots;
create policy "Tutors read classroom performance" on public.performance_snapshots for select
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id));
drop policy if exists "Students read own performance history" on public.performance_history;
create policy "Students read own performance history" on public.performance_history for select using (user_id = auth.uid());
drop policy if exists "Tutors read classroom performance history" on public.performance_history;
create policy "Tutors read classroom performance history" on public.performance_history for select
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id));

-- Existing assignment/submission/timetable policies are narrowed to classroom access.
drop policy if exists "Academy members read timetable" on public.timetable_entries;
create policy "Academy members read timetable" on public.timetable_entries for select
using (published and active and classroom_id is not null and public.can_access_classroom(classroom_id));

drop policy if exists "Students read published classroom assessments" on public.assignments;
create policy "Students read published classroom assessments" on public.assignments for select
using (status = 'published' and published and classroom_id is not null and public.is_student_in_classroom(classroom_id));
drop policy if exists "Tutors read classroom assessments" on public.assignments;
create policy "Tutors read classroom assessments" on public.assignments for select
using (classroom_id is not null and (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id)));

drop policy if exists "Students read own classroom submissions" on public.assignment_submissions;
create policy "Students read own classroom submissions" on public.assignment_submissions for select using (user_id = auth.uid());
drop policy if exists "Tutors read classroom submissions" on public.assignment_submissions;
create policy "Tutors read classroom submissions" on public.assignment_submissions for select
using (classroom_id is not null and (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id)));

drop policy if exists "Users can read assignments for active enrolments" on public.assignments;
drop policy if exists "Tutors can read assigned assignments" on public.assignments;
drop policy if exists "Tutors can read own assignments" on public.assignments;
drop policy if exists "Tutors can create assigned assignments" on public.assignments;
drop policy if exists "Tutors can update own assignments" on public.assignments;
drop policy if exists "Tutors can manage assigned assignments" on public.assignments;
drop policy if exists "Tutors can delete own assignments" on public.assignments;
drop policy if exists "Verified admins can manage assignments" on public.assignments;
drop policy if exists "Users can read own assignment submissions" on public.assignment_submissions;
drop policy if exists "Users can create own assignment submissions" on public.assignment_submissions;
drop policy if exists "Users can update own draft assignment submissions" on public.assignment_submissions;
drop policy if exists "Users can read timetable for active enrolments" on public.timetable_entries;
drop policy if exists "Users can read timetable for resolved programme" on public.timetable_entries;
drop policy if exists "Tutors can manage assigned timetable" on public.timetable_entries;
drop policy if exists "Verified admins can manage timetable" on public.timetable_entries;

drop policy if exists "Assigned Tutors manage classroom assessments" on public.assignments;
create policy "Assigned Tutors manage classroom assessments" on public.assignments for all
using (classroom_id is not null and (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id)))
with check (classroom_id is not null and (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id)));

drop policy if exists "Students create own classroom submissions" on public.assignment_submissions;
create policy "Students create own classroom submissions" on public.assignment_submissions for insert
with check (
  user_id = auth.uid() and exists (
    select 1 from public.assignments a
    where a.id = assignment_id and a.classroom_id = classroom_id
      and a.status = 'published' and a.published = true
      and (a.opens_at is null or a.opens_at <= now())
      and public.is_student_in_classroom(a.classroom_id)
  )
);

drop policy if exists "Students update own open classroom submissions" on public.assignment_submissions;
create policy "Students update own open classroom submissions" on public.assignment_submissions for update
using (user_id = auth.uid() and status in ('draft', 'in_progress', 'returned', 'returned_for_correction'))
with check (user_id = auth.uid());

drop policy if exists "Assigned Tutors manage classroom timetable" on public.timetable_entries;
create policy "Assigned Tutors manage classroom timetable" on public.timetable_entries for all
using (classroom_id is not null and (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id)))
with check (classroom_id is not null and (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id)));

drop policy if exists "Assigned Tutors manage attendance sessions" on public.attendance_sessions;
create policy "Assigned Tutors manage attendance sessions" on public.attendance_sessions for all
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id))
with check (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id));

drop policy if exists "Assigned Tutors manage attendance records" on public.attendance_records;
create policy "Assigned Tutors manage attendance records" on public.attendance_records for all
using (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id))
with check (public.is_verified_admin_session() or public.is_tutor_for_classroom(classroom_id));

create or replace function public.calculate_student_performance(target_classroom_id uuid, target_user_id uuid, calculation_reason text default 'Academic record changed')
returns public.performance_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_score numeric;
  quiz_score numeric;
  test_score numeric;
  project_score numeric;
  attendance_score numeric;
  overall_score numeric := 0;
  completed_count integer := 0;
  missing_count integer := 0;
  assignment_weight numeric := 25;
  quiz_weight numeric := 15;
  test_weight numeric := 20;
  project_weight numeric := 30;
  attendance_weight numeric := 10;
  saved_snapshot public.performance_snapshots;
  breakdown jsonb;
begin
  if not exists (select 1 from public.classroom_memberships m where m.classroom_id = target_classroom_id and m.user_id = target_user_id and m.member_role = 'student') then
    raise exception 'The Student does not belong to this classroom.';
  end if;

  select
    max(weight) filter (where category = 'assignment'),
    max(weight) filter (where category = 'quiz'),
    max(weight) filter (where category = 'test'),
    max(weight) filter (where category = 'project'),
    max(weight) filter (where category = 'attendance')
  into assignment_weight, quiz_weight, test_weight, project_weight, attendance_weight
  from public.grading_weights
  where classroom_id = target_classroom_id and effective_from <= current_date
    and (effective_until is null or effective_until >= current_date);

  assignment_weight := coalesce(assignment_weight, 25);
  quiz_weight := coalesce(quiz_weight, 15);
  test_weight := coalesce(test_weight, 20);
  project_weight := coalesce(project_weight, 30);
  attendance_weight := coalesce(attendance_weight, 10);

  if assignment_weight + quiz_weight + test_weight + project_weight + attendance_weight <> 100 then
    raise exception 'Grading weights must total 100 percent.';
  end if;

  select
    avg(100 * g.score / nullif(g.maximum_score, 0)) filter (where a.assessment_type in ('assignment', 'class_activity') and g.status = 'published'),
    avg(100 * g.score / nullif(g.maximum_score, 0)) filter (where a.assessment_type = 'quiz' and g.status = 'published'),
    avg(100 * g.score / nullif(g.maximum_score, 0)) filter (where a.assessment_type = 'test' and g.status = 'published'),
    avg(100 * g.score / nullif(g.maximum_score, 0)) filter (where a.assessment_type in ('project', 'practical') and g.status = 'published'),
    count(*) filter (where g.status = 'published'),
    count(*) filter (where g.status = 'missing')
  into assignment_score, quiz_score, test_score, project_score, completed_count, missing_count
  from public.assessment_grades g
  join public.assignments a on a.id = g.assessment_id
  where g.classroom_id = target_classroom_id and g.user_id = target_user_id
    and g.status in ('published', 'missing', 'excused');

  select avg(case r.status when 'present' then 100 when 'late' then 75 when 'partially_attended' then 50 when 'absent' then 0 else null end)
  into attendance_score
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.attendance_session_id
  where r.classroom_id = target_classroom_id and r.user_id = target_user_id and s.status = 'completed';

  overall_score := round((
    coalesce(assignment_score, 0) * assignment_weight +
    coalesce(quiz_score, 0) * quiz_weight +
    coalesce(test_score, 0) * test_weight +
    coalesce(project_score, 0) * project_weight +
    coalesce(attendance_score, 0) * attendance_weight
  ) / 100, 2);

  breakdown := jsonb_build_object(
    'weights', jsonb_build_object('assignment', assignment_weight, 'quiz', quiz_weight, 'test', test_weight, 'project', project_weight, 'attendance', attendance_weight),
    'scores', jsonb_build_object('assignment', assignment_score, 'quiz', quiz_score, 'test', test_score, 'project', project_score, 'attendance', attendance_score),
    'completedAssessments', completed_count,
    'missingAssessments', missing_count
  );

  insert into public.performance_snapshots (
    classroom_id, user_id, overall_percentage, assignment_percentage, quiz_percentage,
    test_percentage, project_percentage, attendance_percentage, completed_assessments,
    missing_assessments, calculation_breakdown, calculated_at
  ) values (
    target_classroom_id, target_user_id, overall_score, assignment_score, quiz_score,
    test_score, project_score, attendance_score, completed_count, missing_count, breakdown, now()
  )
  on conflict (classroom_id, user_id) do update
  set overall_percentage = excluded.overall_percentage,
      assignment_percentage = excluded.assignment_percentage,
      quiz_percentage = excluded.quiz_percentage,
      test_percentage = excluded.test_percentage,
      project_percentage = excluded.project_percentage,
      attendance_percentage = excluded.attendance_percentage,
      completed_assessments = excluded.completed_assessments,
      missing_assessments = excluded.missing_assessments,
      calculation_breakdown = excluded.calculation_breakdown,
      calculated_at = now()
  returning * into saved_snapshot;

  insert into public.performance_history (snapshot_id, classroom_id, user_id, overall_percentage, calculation_breakdown, reason)
  values (saved_snapshot.id, target_classroom_id, target_user_id, saved_snapshot.overall_percentage, breakdown, left(coalesce(calculation_reason, 'Academic record changed'), 300));

  return saved_snapshot;
end;
$$;

revoke all on function public.calculate_student_performance(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.calculate_student_performance(uuid, uuid, text) to service_role;

create or replace function public.refresh_performance_after_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('published', 'missing', 'excused') or (tg_op = 'UPDATE' and old.status in ('published', 'missing', 'excused')) then
    perform public.calculate_student_performance(new.classroom_id, new.user_id, 'Grade changed');
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_grades_refresh_performance on public.assessment_grades;
create trigger assessment_grades_refresh_performance
after insert or update on public.assessment_grades
for each row execute function public.refresh_performance_after_grade();

create or replace function public.refresh_performance_after_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.calculate_student_performance(new.classroom_id, new.user_id, 'Attendance changed');
  return new;
end;
$$;

drop trigger if exists attendance_records_refresh_performance on public.attendance_records;
create trigger attendance_records_refresh_performance
after insert or update on public.attendance_records
for each row execute function public.refresh_performance_after_attendance();

create or replace function public.get_assessment_questions(target_assessment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  assessment_record public.assignments;
  privileged boolean := false;
  result jsonb;
begin
  select * into assessment_record from public.assignments where id = target_assessment_id;
  if assessment_record.id is null then return '[]'::jsonb; end if;
  privileged := public.is_verified_admin_session() or public.is_tutor_for_classroom(assessment_record.classroom_id);
  if not privileged and not (
    assessment_record.status = 'published'
    and assessment_record.published
    and public.is_student_in_classroom(assessment_record.classroom_id)
  ) then
    raise exception 'You cannot access this assessment.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'questionType', q.question_type,
    'prompt', q.prompt,
    'points', q.points,
    'displayOrder', q.display_order,
    'correctAnswer', case when privileged then q.correct_answer else null end,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'text', o.option_text,
        'displayOrder', o.display_order,
        'isCorrect', case when privileged then o.is_correct else null end
      ) order by o.display_order, o.created_at)
      from public.assessment_options o where o.question_id = q.id
    ), '[]'::jsonb)
  ) order by q.display_order, q.created_at), '[]'::jsonb)
  into result
  from public.assessment_questions q
  where q.assessment_id = target_assessment_id;
  return result;
end;
$$;

grant execute on function public.get_assessment_questions(uuid) to authenticated;

create or replace function public.save_assessment_question(
  target_question_id uuid,
  target_assessment_id uuid,
  next_question_type text,
  next_prompt text,
  next_points numeric,
  next_correct_answer jsonb,
  next_options jsonb
)
returns public.assessment_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  assessment_record public.assignments;
  saved_question public.assessment_questions;
  option_record jsonb;
begin
  select * into assessment_record from public.assignments where id = target_assessment_id;
  if assessment_record.id is null then raise exception 'Assessment not found.'; end if;
  if not (public.is_verified_admin_session() or public.is_tutor_for_classroom(assessment_record.classroom_id)) then
    raise exception 'You cannot edit this assessment.';
  end if;
  if next_question_type not in ('multiple_choice', 'multiple_response', 'true_false', 'short_answer', 'essay', 'code_response', 'file_upload') then
    raise exception 'Select a valid question type.';
  end if;
  if coalesce(btrim(next_prompt), '') = '' or coalesce(next_points, 0) <= 0 then
    raise exception 'A question and positive score are required.';
  end if;

  if target_question_id is null then
    insert into public.assessment_questions (assessment_id, question_type, prompt, points, correct_answer)
    values (target_assessment_id, next_question_type, left(btrim(next_prompt), 10000), next_points, next_correct_answer)
    returning * into saved_question;
  else
    update public.assessment_questions
    set question_type = next_question_type, prompt = left(btrim(next_prompt), 10000), points = next_points,
        correct_answer = next_correct_answer, updated_at = now()
    where id = target_question_id and assessment_id = target_assessment_id
    returning * into saved_question;
    if saved_question.id is null then raise exception 'Question not found.'; end if;
  end if;

  delete from public.assessment_options where question_id = saved_question.id;
  for option_record in select value from jsonb_array_elements(coalesce(next_options, '[]'::jsonb))
  loop
    if coalesce(btrim(option_record ->> 'text'), '') <> '' then
      insert into public.assessment_options (question_id, option_text, is_correct, display_order)
      values (
        saved_question.id,
        left(btrim(option_record ->> 'text'), 2000),
        coalesce((option_record ->> 'isCorrect')::boolean, false),
        coalesce((option_record ->> 'displayOrder')::integer, 100)
      );
    end if;
  end loop;
  return saved_question;
end;
$$;

grant execute on function public.save_assessment_question(uuid, uuid, text, text, numeric, jsonb, jsonb) to authenticated;

create or replace function public.submit_assessment_attempt(
  target_assessment_id uuid,
  submitted_answers jsonb,
  attempt_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assessment_record public.assignments;
  question_record record;
  existing_attempt public.assessment_attempts;
  saved_attempt public.assessment_attempts;
  saved_submission public.assignment_submissions;
  answer jsonb;
  answer_text text;
  correct_choices jsonb;
  submitted_choices jsonb;
  earned_points numeric := 0;
  objective_points numeric := 0;
  subjective_count integer := 0;
  question_count integer := 0;
  attempt_count integer := 0;
  auto_score numeric;
  release_now boolean := false;
begin
  if attempt_request_id is null then raise exception 'A request identifier is required.'; end if;
  if not public.is_account_active(auth.uid()) then raise exception 'Your account is not active.'; end if;
  select * into assessment_record from public.assignments where id = target_assessment_id;
  if assessment_record.id is null or assessment_record.status <> 'published' or not assessment_record.published then
    raise exception 'This assessment is not available.';
  end if;
  if assessment_record.assessment_type not in ('quiz', 'test') then raise exception 'This assessment does not accept online answers.'; end if;
  if not public.is_student_in_classroom(assessment_record.classroom_id) then raise exception 'You cannot submit to this classroom.'; end if;
  if assessment_record.opens_at is not null and assessment_record.opens_at > now() then raise exception 'This assessment is not open yet.'; end if;
  if assessment_record.due_at is not null and assessment_record.due_at < now() and assessment_record.late_submission_policy = 'disallow' then
    raise exception 'The submission period has closed.';
  end if;

  select * into existing_attempt from public.assessment_attempts
  where user_id = auth.uid() and assessment_id = target_assessment_id and request_id = attempt_request_id;
  if existing_attempt.id is not null then
    return jsonb_build_object('attempt', to_jsonb(existing_attempt), 'idempotent', true);
  end if;

  select count(*) into attempt_count from public.assessment_attempts
  where user_id = auth.uid() and assessment_id = target_assessment_id;
  if attempt_count >= assessment_record.maximum_attempts then raise exception 'No assessment attempts remain.'; end if;

  for question_record in
    select q.* from public.assessment_questions q
    where q.assessment_id = target_assessment_id order by q.display_order, q.created_at
  loop
    question_count := question_count + 1;
    answer := coalesce(submitted_answers, '{}'::jsonb) -> question_record.id::text;
    answer_text := lower(btrim(coalesce(answer #>> '{}', '')));
    if question_record.question_type in ('multiple_choice', 'true_false') then
      objective_points := objective_points + question_record.points;
      if exists (
        select 1 from public.assessment_options option_record
        where option_record.question_id = question_record.id
          and option_record.is_correct
          and option_record.id::text = answer_text
      ) or (
        question_record.correct_answer is not null
        and lower(btrim(question_record.correct_answer #>> '{}')) = answer_text
      ) then
        earned_points := earned_points + question_record.points;
      end if;
    elsif question_record.question_type = 'multiple_response' then
      objective_points := objective_points + question_record.points;
      select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into correct_choices
      from (
        select option_record.id::text as value from public.assessment_options option_record
        where option_record.question_id = question_record.id and option_record.is_correct
      ) correct_values;
      select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into submitted_choices
      from jsonb_array_elements_text(case when jsonb_typeof(answer) = 'array' then answer else '[]'::jsonb end) value;
      if correct_choices = submitted_choices then earned_points := earned_points + question_record.points; end if;
    else
      subjective_count := subjective_count + 1;
    end if;
  end loop;
  if question_count = 0 then raise exception 'This assessment has no questions.'; end if;
  if subjective_count = 0 then
    auto_score := round((earned_points / nullif(objective_points, 0)) * assessment_record.maximum_score, 2);
  end if;
  release_now := subjective_count = 0 and assessment_record.result_release = 'immediate';

  insert into public.assessment_attempts (
    assessment_id, user_id, attempt_number, status, answers, submitted_at, auto_score, final_score, request_id
  ) values (
    target_assessment_id, auth.uid(), attempt_count + 1, case when subjective_count = 0 then 'graded' else 'submitted' end,
    coalesce(submitted_answers, '{}'::jsonb), now(), auto_score, auto_score, attempt_request_id
  ) returning * into saved_attempt;

  insert into public.assignment_submissions (
    assignment_id, user_id, classroom_id, submission_text, status, submitted_at,
    attempt_number, idempotency_key, receipt_number, score
  ) values (
    target_assessment_id, auth.uid(), assessment_record.classroom_id, 'Online assessment attempt',
    case when subjective_count = 0 then 'graded' else 'submitted' end, now(), attempt_count + 1, attempt_request_id,
    'SUB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), auto_score
  )
  on conflict (assignment_id, user_id) do update
  set submission_text = excluded.submission_text, status = excluded.status, submitted_at = excluded.submitted_at,
      attempt_number = excluded.attempt_number, idempotency_key = excluded.idempotency_key,
      receipt_number = excluded.receipt_number, score = excluded.score, updated_at = now()
  returning * into saved_submission;

  if subjective_count = 0 then
    insert into public.assessment_grades (
      assessment_id, submission_id, classroom_id, user_id, score, maximum_score,
      status, feedback, graded_at, published_at
    ) values (
      target_assessment_id, saved_submission.id, assessment_record.classroom_id, auth.uid(), auto_score,
      assessment_record.maximum_score, case when release_now then 'published' else 'draft' end,
      'Automatically marked objective assessment.', now(), case when release_now then now() end
    )
    on conflict (assessment_id, user_id) do update
    set submission_id = excluded.submission_id, score = excluded.score, maximum_score = excluded.maximum_score,
        status = excluded.status, feedback = excluded.feedback, graded_at = now(),
        published_at = excluded.published_at, updated_at = now();
  end if;

  return jsonb_build_object(
    'attempt', to_jsonb(saved_attempt),
    'submission', to_jsonb(saved_submission),
    'autoScore', auto_score,
    'maximumScore', assessment_record.maximum_score,
    'resultPublished', release_now,
    'requiresTutorGrading', subjective_count > 0,
    'idempotent', false
  );
end;
$$;

grant execute on function public.submit_assessment_attempt(uuid, jsonb, uuid) to authenticated;

create or replace function public.submit_classroom_assessment(
  target_assessment_id uuid,
  submission_body text,
  request_id uuid
)
returns public.assignment_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  assessment_record public.assignments;
  saved_submission public.assignment_submissions;
  submission_status text;
begin
  if not public.is_account_active(auth.uid()) then raise exception 'Your account is not active.'; end if;
  select * into assessment_record from public.assignments where id = target_assessment_id;
  if assessment_record.id is null or assessment_record.status <> 'published' or not assessment_record.published then
    raise exception 'This assessment is not available.';
  end if;
  if not public.is_student_in_classroom(assessment_record.classroom_id) then raise exception 'You cannot submit to this classroom.'; end if;
  if assessment_record.opens_at is not null and assessment_record.opens_at > now() then raise exception 'This assessment is not open yet.'; end if;
  if assessment_record.due_at is not null and assessment_record.due_at < now() and assessment_record.late_submission_policy = 'disallow' then
    raise exception 'The submission period has closed.';
  end if;
  submission_status := case when assessment_record.due_at is not null and assessment_record.due_at < now() then 'submitted_late' else 'submitted' end;

  insert into public.assignment_submissions (
    assignment_id, user_id, classroom_id, submission_text, status, submitted_at,
    attempt_number, idempotency_key, receipt_number
  ) values (
    assessment_record.id, auth.uid(), assessment_record.classroom_id, left(coalesce(submission_body, ''), 20000),
    submission_status, now(), 1, request_id,
    'SUB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  )
  on conflict (assignment_id, user_id) do update
  set submission_text = excluded.submission_text,
      status = excluded.status,
      submitted_at = excluded.submitted_at,
      idempotency_key = coalesce(public.assignment_submissions.idempotency_key, excluded.idempotency_key),
      receipt_number = coalesce(public.assignment_submissions.receipt_number, excluded.receipt_number),
      updated_at = now()
  where public.assignment_submissions.status in ('draft', 'in_progress', 'returned', 'returned_for_correction')
     or public.assignment_submissions.idempotency_key = excluded.idempotency_key
  returning * into saved_submission;

  if saved_submission.id is null then raise exception 'This submission can no longer be replaced.'; end if;

  insert into public.portal_notifications (user_id, title, message, notification_type, link_path)
  select a.tutor_id, 'New assessment submission', assessment_record.title || ' has a new submission.', 'assessment_submission', '/tutor/assessment/submissions/' || saved_submission.id
  from public.tutor_classroom_assignments a
  where a.classroom_id = assessment_record.classroom_id and a.active;

  return saved_submission;
end;
$$;

grant execute on function public.submit_classroom_assessment(uuid, text, uuid) to authenticated;

create or replace function public.save_assessment_grade(
  target_submission_id uuid,
  target_score numeric,
  target_feedback text,
  target_status text,
  change_reason text
)
returns public.assessment_grades
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_record public.assignment_submissions;
  assessment_record public.assignments;
  previous_grade public.assessment_grades;
  saved_grade public.assessment_grades;
begin
  select * into submission_record from public.assignment_submissions where id = target_submission_id;
  select * into assessment_record from public.assignments where id = submission_record.assignment_id;
  if submission_record.id is null or assessment_record.id is null then raise exception 'Submission not found.'; end if;
  if not (public.is_verified_admin_session() or public.is_tutor_for_classroom(assessment_record.classroom_id)) then raise exception 'You cannot grade this classroom.'; end if;
  if target_status not in ('draft', 'published', 'returned_for_correction', 'missing', 'excused', 'withheld') then raise exception 'Invalid grade status.'; end if;
  if target_score is not null and (target_score < 0 or target_score > assessment_record.maximum_score) then raise exception 'Score must be within the assessment maximum.'; end if;
  if coalesce(btrim(change_reason), '') = '' then raise exception 'A grade-change reason is required.'; end if;

  select * into previous_grade from public.assessment_grades
  where assessment_id = assessment_record.id and user_id = submission_record.user_id;

  insert into public.assessment_grades (
    assessment_id, submission_id, classroom_id, user_id, score, maximum_score,
    status, feedback, graded_by, graded_at, published_at
  ) values (
    assessment_record.id, submission_record.id, assessment_record.classroom_id, submission_record.user_id,
    target_score, assessment_record.maximum_score, target_status, left(coalesce(target_feedback, ''), 10000),
    auth.uid(), now(), case when target_status = 'published' then now() end
  )
  on conflict (assessment_id, user_id) do update
  set submission_id = excluded.submission_id, score = excluded.score, maximum_score = excluded.maximum_score,
      status = excluded.status, feedback = excluded.feedback, graded_by = excluded.graded_by,
      graded_at = now(), published_at = case when excluded.status = 'published' then coalesce(public.assessment_grades.published_at, now()) else null end,
      updated_at = now()
  returning * into saved_grade;

  insert into public.grade_change_logs (grade_id, previous_score, new_score, previous_status, new_status, reason, changed_by)
  values (saved_grade.id, previous_grade.score, saved_grade.score, previous_grade.status, saved_grade.status, left(change_reason, 1000), auth.uid());

  update public.assignment_submissions
  set status = case when target_status = 'returned_for_correction' then 'returned_for_correction' when target_status in ('published', 'draft', 'withheld') then 'graded' else target_status end,
      score = target_score, feedback = target_feedback,
      published_grade_at = case when target_status = 'published' then now() else published_grade_at end,
      returned_at = case when target_status = 'returned_for_correction' then now() else returned_at end,
      updated_at = now()
  where id = submission_record.id;

  if target_status = 'published' then
    insert into public.portal_notifications (user_id, title, message, notification_type, link_path)
    values (submission_record.user_id, 'Grade published', assessment_record.title || ' has been graded.', 'grade_published', '/portal/progress/grades/' || assessment_record.id);
  end if;
  return saved_grade;
end;
$$;

grant execute on function public.save_assessment_grade(uuid, numeric, text, text, text) to authenticated;

create or replace function public.set_classroom_grading_weights(target_classroom_id uuid, weight_values jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare total_weight numeric;
begin
  if not public.is_verified_admin_session() then raise exception 'Admin verification is required.'; end if;
  select sum((value)::numeric) into total_weight from jsonb_each_text(weight_values);
  if total_weight <> 100
     or not (weight_values ?& array['assignment', 'quiz', 'test', 'project', 'attendance']) then
    raise exception 'All five grading weights must total 100 percent.';
  end if;
  update public.grading_weights set effective_until = current_date - 1, updated_at = now()
  where classroom_id = target_classroom_id and effective_until is null and effective_from < current_date;
  delete from public.grading_weights where classroom_id = target_classroom_id and effective_from = current_date;
  insert into public.grading_weights (classroom_id, category, weight, effective_from, created_by)
  select target_classroom_id, key, value::numeric, current_date, auth.uid()
  from jsonb_each_text(weight_values);
  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'classroom_grading_weights_updated', 'classrooms', target_classroom_id, weight_values);
end;
$$;

grant execute on function public.set_classroom_grading_weights(uuid, jsonb) to authenticated;

create or replace function public.admin_assign_student_classroom(target_user_id uuid, target_classroom_id uuid, change_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target_program_id uuid; target_track_id uuid; target_cohort_id uuid;
begin
  if not public.is_verified_admin_session() then raise exception 'Admin verification is required.'; end if;
  if coalesce(btrim(change_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if not exists (select 1 from public.user_roles where user_id = target_user_id and role = 'student') then raise exception 'A Student account is required.'; end if;
  select program_id, track_id, cohort_id into target_program_id, target_track_id, target_cohort_id
  from public.classrooms where id = target_classroom_id and status = 'active';
  if target_program_id is null then raise exception 'An active classroom is required.'; end if;

  update public.classroom_memberships set active = false, left_at = now(), updated_at = now()
  where user_id = target_user_id and member_role = 'student' and active = true and classroom_id <> target_classroom_id;
  insert into public.classroom_memberships (classroom_id, user_id, member_role, active, joined_at, assigned_by)
  values (target_classroom_id, target_user_id, 'student', true, now(), auth.uid())
  on conflict (classroom_id, user_id, member_role) do update set active = true, left_at = null, joined_at = now(), assigned_by = auth.uid(), updated_at = now();

  update public.enrolments
  set classroom_id = target_classroom_id, cohort_id = target_cohort_id, updated_at = now()
  where user_id = target_user_id and program_id = target_program_id and program_level_id = target_track_id and status = 'active';

  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'student_classroom_assigned', 'classrooms', target_classroom_id, jsonb_build_object('student_id', target_user_id, 'reason', left(change_reason, 1000)));
end;
$$;

grant execute on function public.admin_assign_student_classroom(uuid, uuid, text) to authenticated;

create or replace function public.admin_assign_tutor_classroom(target_tutor_id uuid, target_classroom_id uuid, target_role text, assignment_active boolean, change_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_verified_admin_session() then raise exception 'Admin verification is required.'; end if;
  if coalesce(btrim(change_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if target_role not in ('lead_tutor', 'assistant_tutor', 'reviewer') then raise exception 'Invalid Tutor assignment role.'; end if;
  if not exists (select 1 from public.user_roles where user_id = target_tutor_id and role = 'tutor') then raise exception 'A Tutor account is required.'; end if;
  if not exists (select 1 from public.classrooms where id = target_classroom_id) then raise exception 'Classroom not found.'; end if;

  insert into public.tutor_classroom_assignments (tutor_id, classroom_id, assignment_role, active, assigned_at, assigned_by)
  values (target_tutor_id, target_classroom_id, target_role, assignment_active, now(), auth.uid())
  on conflict (tutor_id, classroom_id) do update
  set assignment_role = excluded.assignment_role, active = excluded.active, assigned_by = auth.uid(), updated_at = now();

  insert into public.classroom_memberships (classroom_id, user_id, member_role, active, joined_at, left_at, assigned_by)
  values (target_classroom_id, target_tutor_id, 'tutor', assignment_active, now(), case when assignment_active then null else now() end, auth.uid())
  on conflict (classroom_id, user_id, member_role) do update
  set active = excluded.active, left_at = excluded.left_at, assigned_by = auth.uid(), updated_at = now();

  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'tutor_classroom_assignment_changed', 'classrooms', target_classroom_id,
          jsonb_build_object('tutor_id', target_tutor_id, 'role', target_role, 'active', assignment_active, 'reason', left(change_reason, 1000)));
end;
$$;

grant execute on function public.admin_assign_tutor_classroom(uuid, uuid, text, boolean, text) to authenticated;

create or replace function public.admin_save_cohort(
  target_cohort_id uuid,
  target_program_id uuid,
  target_track_id uuid,
  next_name text,
  next_code text,
  next_start_date date,
  next_end_date date,
  next_status text
)
returns public.cohorts
language plpgsql
security definer
set search_path = public
as $$
declare saved_record public.cohorts;
begin
  if not public.is_verified_admin_session() then raise exception 'Admin verification is required.'; end if;
  if next_status not in ('planned', 'active', 'completed', 'cancelled') then raise exception 'Select a valid cohort status.'; end if;
  if not exists (select 1 from public.program_levels where id = target_track_id and program_id = target_program_id) then
    raise exception 'The programme track is invalid.';
  end if;
  if coalesce(btrim(next_name), '') = '' or coalesce(btrim(next_code), '') = '' or next_start_date is null then
    raise exception 'Cohort name, code and start date are required.';
  end if;
  if target_cohort_id is null then
    insert into public.cohorts (program_id, track_id, name, code, start_date, end_date, status, created_by)
    values (target_program_id, target_track_id, left(btrim(next_name), 180), upper(left(btrim(next_code), 60)), next_start_date, next_end_date, next_status, auth.uid())
    returning * into saved_record;
  else
    update public.cohorts set program_id = target_program_id, track_id = target_track_id,
      name = left(btrim(next_name), 180), code = upper(left(btrim(next_code), 60)),
      start_date = next_start_date, end_date = next_end_date, status = next_status, updated_at = now()
    where id = target_cohort_id returning * into saved_record;
    if saved_record.id is null then raise exception 'Cohort not found.'; end if;
  end if;
  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'cohort_saved', 'cohorts', saved_record.id, jsonb_build_object('status', saved_record.status, 'code', saved_record.code));
  return saved_record;
end;
$$;

grant execute on function public.admin_save_cohort(uuid, uuid, uuid, text, text, date, date, text) to authenticated;

create or replace function public.admin_save_classroom(
  target_classroom_id uuid,
  target_cohort_id uuid,
  next_name text,
  next_code text,
  next_capacity integer,
  next_status text
)
returns public.classrooms
language plpgsql
security definer
set search_path = public
as $$
declare cohort_record public.cohorts; saved_record public.classrooms;
begin
  if not public.is_verified_admin_session() then raise exception 'Admin verification is required.'; end if;
  select * into cohort_record from public.cohorts where id = target_cohort_id;
  if cohort_record.id is null then raise exception 'Cohort not found.'; end if;
  if next_status not in ('planned', 'active', 'completed', 'cancelled') then raise exception 'Select a valid classroom status.'; end if;
  if coalesce(btrim(next_name), '') = '' or coalesce(btrim(next_code), '') = '' then raise exception 'Classroom name and code are required.'; end if;
  if next_capacity is not null and next_capacity < 1 then raise exception 'Classroom capacity must be positive.'; end if;
  if target_classroom_id is null then
    insert into public.classrooms (program_id, track_id, cohort_id, name, code, capacity, status, created_by)
    values (cohort_record.program_id, cohort_record.track_id, cohort_record.id, left(btrim(next_name), 180), upper(left(btrim(next_code), 60)), next_capacity, next_status, auth.uid())
    returning * into saved_record;
  else
    update public.classrooms set program_id = cohort_record.program_id, track_id = cohort_record.track_id,
      cohort_id = cohort_record.id, name = left(btrim(next_name), 180), code = upper(left(btrim(next_code), 60)),
      capacity = next_capacity, status = next_status, updated_at = now()
    where id = target_classroom_id returning * into saved_record;
    if saved_record.id is null then raise exception 'Classroom not found.'; end if;
  end if;
  insert into public.audit_logs (actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'classroom_saved', 'classrooms', saved_record.id, jsonb_build_object('status', saved_record.status, 'code', saved_record.code));
  return saved_record;
end;
$$;

grant execute on function public.admin_save_classroom(uuid, uuid, text, text, integer, text) to authenticated;

create or replace function public.get_my_academic_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare target_classroom_id uuid; result jsonb;
begin
  select m.classroom_id into target_classroom_id
  from public.classroom_memberships m
  where m.user_id = auth.uid() and m.member_role = 'student' and m.active and m.left_at is null
  order by m.joined_at desc limit 1;
  if target_classroom_id is null then
    return jsonb_build_object('classroom', null, 'modules', '[]'::jsonb, 'timetable', '[]'::jsonb, 'assessments', '[]'::jsonb, 'grades', '[]'::jsonb, 'attendance', '[]'::jsonb, 'performance', null);
  end if;

  select jsonb_build_object(
    'classroom', (select to_jsonb(row_data) from (
      select c.id, c.name, c.code, p.title as program_title, l.level_name as track_title,
             h.id as cohort_id, h.name as cohort_name, h.start_date, h.end_date
      from public.classrooms c join public.programs p on p.id = c.program_id
      join public.program_levels l on l.id = c.track_id join public.cohorts h on h.id = c.cohort_id
      where c.id = target_classroom_id
    ) row_data),
    'modules', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.display_order) from (
      select id, title, description, display_order from public.academy_modules
      where classroom_id = target_classroom_id and status = 'published'
    ) row_data), '[]'::jsonb),
    'timetable', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.day_of_week, row_data.start_time) from (
      select t.id, t.title, t.description, t.day_of_week, t.start_time, t.end_time, t.delivery_method,
             t.timezone, t.meeting_url, m.title as module_title, l.title as lesson_title
      from public.timetable_entries t left join public.academy_modules m on m.id = t.module_id
      left join public.academy_lessons l on l.id = t.lesson_id
      where t.classroom_id = target_classroom_id and t.active and t.published
    ) row_data), '[]'::jsonb),
    'assessments', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.due_at nulls last) from (
      select a.id, a.title, a.instructions, a.assessment_type, a.maximum_score, a.opens_at, a.due_at,
             a.maximum_attempts, a.status, s.id as submission_id, s.status as submission_status,
             s.submitted_at, s.receipt_number
      from public.assignments a left join public.assignment_submissions s on s.assignment_id = a.id and s.user_id = auth.uid()
      where a.classroom_id = target_classroom_id and a.status = 'published' and a.published
    ) row_data), '[]'::jsonb),
    'grades', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.published_at desc) from (
      select g.id, g.assessment_id, a.title, a.assessment_type, g.score, g.maximum_score,
             round(100 * g.score / nullif(g.maximum_score, 0), 2) as percentage,
             g.feedback, g.published_at
      from public.assessment_grades g join public.assignments a on a.id = g.assessment_id
      where g.classroom_id = target_classroom_id and g.user_id = auth.uid() and g.status = 'published'
    ) row_data), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.session_date desc) from (
      select r.id, s.title, s.session_date, r.status, r.joined_at, r.left_at
      from public.attendance_records r join public.attendance_sessions s on s.id = r.attendance_session_id
      where r.classroom_id = target_classroom_id and r.user_id = auth.uid()
    ) row_data), '[]'::jsonb),
    'performance', (select to_jsonb(snapshot) from public.performance_snapshots snapshot where snapshot.classroom_id = target_classroom_id and snapshot.user_id = auth.uid()),
    'performanceHistory', coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.created_at) from (
      select overall_percentage, created_at from public.performance_history
      where classroom_id = target_classroom_id and user_id = auth.uid() order by created_at desc limit 12
    ) row_data), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

grant execute on function public.get_my_academic_dashboard() to authenticated;

create or replace function public.get_my_tutor_classrooms()
returns table (
  classroom_id uuid, classroom_name text, classroom_code text, program_id uuid, program_title text,
  track_id uuid, track_title text, cohort_id uuid, cohort_name text, assignment_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.code, c.program_id, p.title, c.track_id, l.level_name,
         c.cohort_id, h.name, a.assignment_role
  from public.tutor_classroom_assignments a
  join public.classrooms c on c.id = a.classroom_id and c.status = 'active'
  join public.programs p on p.id = c.program_id
  join public.program_levels l on l.id = c.track_id
  join public.cohorts h on h.id = c.cohort_id
  where a.tutor_id = auth.uid() and a.active and public.is_account_active(auth.uid())
  order by h.start_date desc, p.title, l.level_name;
$$;

grant execute on function public.get_my_tutor_classrooms() to authenticated;

create or replace function public.get_classroom_student_performance(target_classroom_id uuid)
returns table (
  user_id uuid, portal_id text, full_name text, account_status text,
  overall_percentage numeric, attendance_percentage numeric, completed_assessments integer, missing_assessments integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.portal_id, p.full_name, p.account_status, s.overall_percentage,
         s.attendance_percentage, coalesce(s.completed_assessments, 0), coalesce(s.missing_assessments, 0)
  from public.classroom_memberships m join public.profiles p on p.id = m.user_id
  left join public.performance_snapshots s on s.classroom_id = m.classroom_id and s.user_id = m.user_id
  where m.classroom_id = target_classroom_id and m.member_role = 'student' and m.active
    and (public.is_verified_admin_session() or public.is_tutor_for_classroom(target_classroom_id))
  order by p.full_name;
$$;

grant execute on function public.get_classroom_student_performance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Classroom-scoped chat and live-class access.
-- ---------------------------------------------------------------------------

alter table public.program_chat_rooms
  add column if not exists classroom_id uuid references public.classrooms(id) on delete restrict,
  add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;

alter table public.program_chat_rooms drop constraint if exists program_chat_rooms_program_id_key;
drop index if exists public.program_chat_rooms_program_id_key;
create unique index if not exists program_chat_rooms_classroom_uidx
  on public.program_chat_rooms(classroom_id) where classroom_id is not null;
create unique index if not exists program_chat_rooms_legacy_program_uidx
  on public.program_chat_rooms(program_id) where classroom_id is null;

insert into public.program_chat_rooms (program_id, track_id, cohort_id, classroom_id, room_type, title, active)
select c.program_id, c.track_id, c.cohort_id, c.id, 'programme_track', c.name, c.status = 'active'
from public.classrooms c
on conflict (classroom_id) where classroom_id is not null do update
set title = excluded.title, active = excluded.active, track_id = excluded.track_id, cohort_id = excluded.cohort_id, updated_at = now();

create or replace function public.is_eligible_for_program_chat(target_room_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_chat_rooms room
    join public.profiles profile on profile.id = target_user_id and profile.account_status = 'active'
    join public.user_roles role_record on role_record.user_id = target_user_id
    where room.id = target_room_id and room.active
      and (
        (role_record.role = 'admin' and target_user_id = auth.uid() and public.is_verified_admin_session())
        or (room.classroom_id is not null and role_record.role = 'tutor' and public.is_tutor_for_classroom(room.classroom_id, target_user_id))
        or (room.classroom_id is not null and role_record.role = 'student' and public.is_student_in_classroom(room.classroom_id, target_user_id))
        or (room.classroom_id is null and role_record.role = 'tutor' and public.is_tutor_for_program(room.program_id, room.track_id))
        or (room.classroom_id is null and role_record.role = 'student' and public.has_active_student_program(room.program_id, room.track_id))
      )
  );
$$;

revoke all on function public.is_eligible_for_program_chat(uuid, uuid) from public;

insert into public.program_chat_members (room_id, user_id, role, joined_at, active, left_at)
select room.id, assignment.tutor_id, 'tutor', assignment.assigned_at, true, null
from public.tutor_classroom_assignments assignment
join public.program_chat_rooms room on room.classroom_id = assignment.classroom_id
where assignment.active
on conflict (room_id, user_id) do update set active = true, left_at = null, role = 'tutor', updated_at = now();

alter table public.live_class_sessions
  add column if not exists classroom_id uuid references public.classrooms(id) on delete restrict,
  add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;

with resolved as (
  select session.id as session_id, classroom.id as classroom_id, classroom.cohort_id
  from public.live_class_sessions session
  cross join lateral (
    select c.id, c.cohort_id from public.classrooms c
    where c.program_id = session.program_id and (session.track_id is null or c.track_id = session.track_id)
    order by (c.status = 'active') desc, c.created_at desc limit 1
  ) classroom
  where session.classroom_id is null
)
update public.live_class_sessions session
set classroom_id = resolved.classroom_id, cohort_id = resolved.cohort_id
from resolved
where session.id = resolved.session_id;

create index if not exists live_class_sessions_classroom_idx on public.live_class_sessions(classroom_id, scheduled_start desc, status);

create or replace function public.sync_live_attendance_to_academy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare source_session public.live_class_sessions; attendance_session_id uuid;
begin
  select * into source_session from public.live_class_sessions where id = new.class_session_id;
  if source_session.classroom_id is null or not public.is_student_in_classroom(source_session.classroom_id, new.user_id) then return new; end if;
  insert into public.attendance_sessions (
    classroom_id, live_class_session_id, title, session_date, scheduled_start, scheduled_end, status, source, created_by
  ) values (
    source_session.classroom_id, source_session.id, source_session.title,
    (source_session.scheduled_start at time zone source_session.timezone)::date,
    source_session.scheduled_start, source_session.scheduled_end,
    case when source_session.status = 'completed' then 'completed' when source_session.status = 'cancelled' then 'cancelled' else 'scheduled' end,
    'live_class', source_session.created_by
  )
  on conflict (classroom_id, session_date, title) do update
  set live_class_session_id = excluded.live_class_session_id, scheduled_start = excluded.scheduled_start,
      scheduled_end = excluded.scheduled_end, status = excluded.status, updated_at = now()
  returning id into attendance_session_id;

  insert into public.attendance_records (
    attendance_session_id, classroom_id, user_id, status, joined_at, left_at, marked_by
  ) values (
    attendance_session_id, source_session.classroom_id, new.user_id,
    case when new.attendance_status = 'missed' then 'absent'
         when new.left_at is not null and new.left_at < source_session.scheduled_end - interval '15 minutes' then 'partially_attended'
         when new.joined_at > source_session.scheduled_start + interval '10 minutes' then 'late'
         else 'present' end,
    new.joined_at, new.left_at, source_session.tutor_id
  )
  on conflict (attendance_session_id, user_id) do update
  set status = excluded.status, joined_at = excluded.joined_at, left_at = excluded.left_at, updated_at = now();
  return new;
end;
$$;

drop trigger if exists live_class_attendance_sync_academy on public.live_class_attendance;
create trigger live_class_attendance_sync_academy
after insert or update on public.live_class_attendance
for each row execute function public.sync_live_attendance_to_academy();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-files', 'assignment-files', false, 10485760, array['application/pdf','image/jpeg','image/png','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Students upload own assignment files" on storage.objects;
create policy "Students upload own assignment files" on storage.objects for insert to authenticated
with check (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Students read own assignment files" on storage.objects;
create policy "Students read own assignment files" on storage.objects for select to authenticated
using (bucket_id = 'assignment-files' and (
  (storage.foldername(name))[1] = auth.uid()::text
  or exists (
    select 1 from public.submission_files f
    join public.assignment_submissions s on s.id = f.submission_id
    where f.storage_path = name and (public.is_verified_admin_session() or public.is_tutor_for_classroom(s.classroom_id))
  )
));
drop policy if exists "Students replace own assignment files" on storage.objects;
create policy "Students replace own assignment files" on storage.objects for update to authenticated
using (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Students remove own assignment files" on storage.objects;
create policy "Students remove own assignment files" on storage.objects for delete to authenticated
using (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Shared updated-at triggers.
drop trigger if exists cohorts_set_updated_at on public.cohorts;
create trigger cohorts_set_updated_at before update on public.cohorts for each row execute function public.set_updated_at();
drop trigger if exists classrooms_set_updated_at on public.classrooms;
create trigger classrooms_set_updated_at before update on public.classrooms for each row execute function public.set_updated_at();
drop trigger if exists classroom_memberships_set_updated_at on public.classroom_memberships;
create trigger classroom_memberships_set_updated_at before update on public.classroom_memberships for each row execute function public.set_updated_at();
drop trigger if exists tutor_classroom_assignments_set_updated_at on public.tutor_classroom_assignments;
create trigger tutor_classroom_assignments_set_updated_at before update on public.tutor_classroom_assignments for each row execute function public.set_updated_at();
drop trigger if exists academy_modules_set_updated_at on public.academy_modules;
create trigger academy_modules_set_updated_at before update on public.academy_modules for each row execute function public.set_updated_at();
drop trigger if exists academy_lessons_set_updated_at on public.academy_lessons;
create trigger academy_lessons_set_updated_at before update on public.academy_lessons for each row execute function public.set_updated_at();
drop trigger if exists assessment_questions_set_updated_at on public.assessment_questions;
create trigger assessment_questions_set_updated_at before update on public.assessment_questions for each row execute function public.set_updated_at();
drop trigger if exists assessment_attempts_set_updated_at on public.assessment_attempts;
create trigger assessment_attempts_set_updated_at before update on public.assessment_attempts for each row execute function public.set_updated_at();
drop trigger if exists assessment_grades_set_updated_at on public.assessment_grades;
create trigger assessment_grades_set_updated_at before update on public.assessment_grades for each row execute function public.set_updated_at();
drop trigger if exists grading_weights_set_updated_at on public.grading_weights;
create trigger grading_weights_set_updated_at before update on public.grading_weights for each row execute function public.set_updated_at();
drop trigger if exists attendance_sessions_set_updated_at on public.attendance_sessions;
create trigger attendance_sessions_set_updated_at before update on public.attendance_sessions for each row execute function public.set_updated_at();
drop trigger if exists attendance_records_set_updated_at on public.attendance_records;
create trigger attendance_records_set_updated_at before update on public.attendance_records for each row execute function public.set_updated_at();
drop trigger if exists payment_fulfilments_set_updated_at on public.payment_fulfilments;
create trigger payment_fulfilments_set_updated_at before update on public.payment_fulfilments for each row execute function public.set_updated_at();

-- API privileges remain RLS-bound. Mutating financial projections stays server-only.
grant select on public.cohorts, public.classrooms, public.classroom_memberships, public.tutor_classroom_assignments,
  public.academy_modules, public.academy_lessons, public.timetable_periods, public.timetable_exceptions,
  public.assessment_attempts, public.submission_files,
  public.assessment_grades, public.grade_feedback, public.grade_change_logs, public.grading_schemes,
  public.grading_weights, public.attendance_sessions, public.attendance_records,
  public.performance_snapshots, public.performance_history, public.payment_transactions,
  public.payment_fulfilments, public.payment_reconciliation_runs to authenticated;
grant insert, update on public.academy_modules, public.academy_lessons, public.timetable_entries,
  public.assignments, public.assignment_submissions, public.attendance_sessions, public.attendance_records to authenticated;
grant insert, delete on public.submission_files to authenticated;
revoke select on public.assessment_questions, public.assessment_options from authenticated;

notify pgrst, 'reload schema';
