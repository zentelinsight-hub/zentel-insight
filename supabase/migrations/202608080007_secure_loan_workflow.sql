create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.loan_applications (
  id uuid primary key,
  application_number text not null unique default ('ZL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  student_user_id uuid not null references auth.users(id) on delete restrict,
  full_name text not null,
  email text not null,
  phone text not null,
  date_of_birth date not null,
  identification_type text not null check (identification_type in ('national_id', 'drivers_licence', 'international_passport', 'voters_card')),
  requested_amount numeric(14,2) not null check (requested_amount > 0),
  approved_amount numeric(14,2) check (approved_amount is null or approved_amount > 0),
  purpose text not null,
  supporting_information text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'pending_review', 'approved', 'declined', 'active', 'overdue', 'repaid')),
  kyc_status text not null default 'pending_review' check (kyc_status in ('pending_review', 'reviewed', 'purged')),
  disbursement_status text not null default 'not_ready' check (disbursement_status in ('not_ready', 'bank_details_submitted', 'disbursed')),
  decline_reason text,
  cooldown_until timestamptz,
  due_date date,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loan_applications_student_idx on public.loan_applications(student_user_id, submitted_at desc);
create index if not exists loan_applications_status_idx on public.loan_applications(status, submitted_at desc);

create table if not exists private.loan_kyc_keys (
  singleton boolean primary key default true check (singleton),
  encryption_key text not null,
  created_at timestamptz not null default now()
);

insert into private.loan_kyc_keys(singleton, encryption_key)
values (true, encode(gen_random_bytes(32), 'hex'))
on conflict (singleton) do nothing;

create table if not exists private.loan_kyc_records (
  application_id uuid primary key references public.loan_applications(id) on delete cascade,
  nin_cipher bytea not null,
  bvn_cipher bytea not null,
  passport_photo_path text not null,
  identification_path text not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.loan_bank_accounts (
  application_id uuid primary key references public.loan_applications(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_number_cipher bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete restrict,
  student_user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_reference text not null unique,
  note text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'rejected')),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loan_repayments_application_idx on public.loan_repayments(application_id, created_at desc);

create table if not exists public.loan_account_suspensions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.loan_applications(id) on delete restrict,
  student_user_id uuid not null references auth.users(id) on delete restrict,
  previous_status text not null,
  applied boolean not null default false,
  active boolean not null default true,
  applied_at timestamptz not null default now(),
  removed_at timestamptz
);

alter table public.loan_applications enable row level security;
alter table public.loan_repayments enable row level security;
alter table public.loan_account_suspensions enable row level security;

drop policy if exists "Students read own loan applications" on public.loan_applications;
create policy "Students read own loan applications" on public.loan_applications for select to authenticated
  using (student_user_id = auth.uid());
drop policy if exists "Verified admins read loan applications" on public.loan_applications;
create policy "Verified admins read loan applications" on public.loan_applications for select to authenticated
  using (public.is_verified_admin_session());

drop policy if exists "Students read own loan repayments" on public.loan_repayments;
create policy "Students read own loan repayments" on public.loan_repayments for select to authenticated
  using (student_user_id = auth.uid());
drop policy if exists "Verified admins read loan repayments" on public.loan_repayments;
create policy "Verified admins read loan repayments" on public.loan_repayments for select to authenticated
  using (public.is_verified_admin_session());

drop policy if exists "Verified admins read loan suspensions" on public.loan_account_suspensions;
create policy "Verified admins read loan suspensions" on public.loan_account_suspensions for select to authenticated
  using (public.is_verified_admin_session());

revoke insert, update, delete on public.loan_applications, public.loan_repayments, public.loan_account_suspensions from anon, authenticated;
grant select on public.loan_applications, public.loan_repayments to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('loan-kyc', 'loan-kyc', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Students upload own loan KYC" on storage.objects;
create policy "Students upload own loan KYC" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'loan-kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
      where p.id = auth.uid() and p.account_status = 'active' and r.role = 'student'
    )
  );

create or replace function private.loan_encryption_key()
returns text language sql stable security definer set search_path = private
as $$ select encryption_key from private.loan_kyc_keys where singleton = true $$;
revoke all on function private.loan_encryption_key() from public, anon, authenticated;

create or replace function public.student_submit_loan_application(
  application_id uuid,
  applicant_full_name text,
  applicant_email text,
  applicant_phone text,
  applicant_date_of_birth date,
  applicant_nin text,
  applicant_bvn text,
  applicant_identification_type text,
  passport_photo_path text,
  identification_path text,
  requested_amount numeric,
  loan_purpose text,
  supporting_information text default ''
)
returns public.loan_applications
language plpgsql security definer set search_path = public, private
as $$
declare
  uid uuid := auth.uid();
  result public.loan_applications;
begin
  if uid is null or not exists (
    select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
    where p.id = uid and p.account_status = 'active' and r.role = 'student'
  ) then raise exception 'Active Student access is required.'; end if;
  if application_id is null then raise exception 'A valid application identifier is required.'; end if;
  if exists (select 1 from public.loan_applications where student_user_id = uid and status in ('submitted','pending_review','approved','active','overdue')) then
    raise exception 'You already have an open loan application.';
  end if;
  if exists (select 1 from public.loan_applications where student_user_id = uid and status = 'declined' and cooldown_until > now()) then
    raise exception 'Loan reapplication is not available until the current cooldown ends.';
  end if;
  if btrim(coalesce(applicant_full_name,'')) = '' or btrim(coalesce(applicant_email,'')) = '' or btrim(coalesce(applicant_phone,'')) = '' then
    raise exception 'Complete your personal details.';
  end if;
  if applicant_date_of_birth is null or applicant_date_of_birth > current_date - interval '18 years' then raise exception 'Applicants must be at least 18 years old.'; end if;
  if coalesce(applicant_nin,'') !~ '^[0-9]{11}$' then raise exception 'Enter a valid 11-digit NIN.'; end if;
  if coalesce(applicant_bvn,'') !~ '^[0-9]{11}$' then raise exception 'Enter a valid 11-digit BVN.'; end if;
  if applicant_identification_type not in ('national_id','drivers_licence','international_passport','voters_card') then raise exception 'Choose an accepted identification type.'; end if;
  if requested_amount is null or requested_amount <= 0 then raise exception 'Enter a valid requested amount.'; end if;
  if char_length(btrim(coalesce(loan_purpose,''))) < 10 then raise exception 'Explain the purpose of the loan.'; end if;
  if passport_photo_path not like uid::text || '/' || application_id::text || '/%' or identification_path not like uid::text || '/' || application_id::text || '/%' then
    raise exception 'KYC file paths are invalid.';
  end if;

  insert into public.loan_applications(
    id, student_user_id, full_name, email, phone, date_of_birth, identification_type,
    requested_amount, purpose, supporting_information
  ) values (
    application_id, uid, left(btrim(applicant_full_name),160), lower(left(btrim(applicant_email),255)), left(btrim(applicant_phone),40),
    applicant_date_of_birth, applicant_identification_type, requested_amount, left(btrim(loan_purpose),1500), left(btrim(coalesce(supporting_information,'')),3000)
  ) returning * into result;

  insert into private.loan_kyc_records(application_id, nin_cipher, bvn_cipher, passport_photo_path, identification_path)
  values (
    application_id,
    pgp_sym_encrypt(applicant_nin, private.loan_encryption_key(), 'cipher-algo=aes256'),
    pgp_sym_encrypt(applicant_bvn, private.loan_encryption_key(), 'cipher-algo=aes256'),
    passport_photo_path,
    identification_path
  );

  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (uid, 'loan_application_submitted', 'loan_applications', application_id, jsonb_build_object('requested_amount', requested_amount));
  return result;
end;
$$;

create or replace function public.student_save_loan_bank_details(
  application_id uuid, bank_name text, account_name text, account_number text
)
returns public.loan_applications
language plpgsql security definer set search_path = public, private
as $$
declare result public.loan_applications;
begin
  if not exists (select 1 from public.loan_applications where id = application_id and student_user_id = auth.uid() and status in ('approved','active')) then
    raise exception 'Approved loan access is required.';
  end if;
  if btrim(coalesce(bank_name,'')) = '' or btrim(coalesce(account_name,'')) = '' or coalesce(account_number,'') !~ '^[0-9]{10}$' then
    raise exception 'Enter valid bank details.';
  end if;
  insert into private.loan_bank_accounts(application_id, bank_name, account_name, account_number_cipher)
  values (application_id, left(btrim(bank_name),120), left(btrim(account_name),160), pgp_sym_encrypt(account_number, private.loan_encryption_key(), 'cipher-algo=aes256'))
  on conflict (application_id) do update set bank_name = excluded.bank_name, account_name = excluded.account_name,
    account_number_cipher = excluded.account_number_cipher, updated_at = now();
  update public.loan_applications set disbursement_status = 'bank_details_submitted', updated_at = now()
  where id = application_id returning * into result;
  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'loan_bank_details_submitted', 'loan_applications', application_id, '{}'::jsonb);
  return result;
end;
$$;

create or replace function public.student_submit_loan_repayment(
  application_id uuid, repayment_amount numeric, repayment_reference text, repayment_note text default ''
)
returns public.loan_repayments
language plpgsql security definer set search_path = public
as $$
declare result public.loan_repayments;
begin
  if not exists (select 1 from public.loan_applications where id = application_id and student_user_id = auth.uid() and status in ('active','overdue')) then
    raise exception 'An active loan is required.';
  end if;
  if repayment_amount is null or repayment_amount <= 0 or btrim(coalesce(repayment_reference,'')) = '' then raise exception 'Enter valid repayment information.'; end if;
  insert into public.loan_repayments(application_id, student_user_id, amount, payment_reference, note)
  values (application_id, auth.uid(), repayment_amount, left(btrim(repayment_reference),120), left(btrim(coalesce(repayment_note,'')),1000))
  returning * into result;
  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'loan_repayment_submitted', 'loan_repayments', result.id, jsonb_build_object('application_id', application_id, 'amount', repayment_amount));
  return result;
end;
$$;

create or replace function public.service_get_loan_kyc(target_application_id uuid)
returns table(nin text, bvn text, passport_photo_path text, identification_path text)
language plpgsql security definer set search_path = public, private
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service access is required.'; end if;
  return query select
    pgp_sym_decrypt(k.nin_cipher, private.loan_encryption_key()),
    pgp_sym_decrypt(k.bvn_cipher, private.loan_encryption_key()),
    k.passport_photo_path,
    k.identification_path
  from private.loan_kyc_records k where k.application_id = target_application_id;
end;
$$;

create or replace function public.service_finalize_loan_decision(
  target_application_id uuid,
  decision text,
  decision_approved_amount numeric,
  decision_due_date date,
  decision_reason text,
  actor_user_id uuid
)
returns public.loan_applications
language plpgsql security definer set search_path = public, private
as $$
declare result public.loan_applications;
begin
  if auth.role() <> 'service_role' then raise exception 'Service access is required.'; end if;
  if decision not in ('approved','declined') then raise exception 'Choose approve or decline.'; end if;
  if decision = 'approved' and (decision_approved_amount is null or decision_approved_amount <= 0 or decision_due_date is null or decision_due_date <= current_date) then
    raise exception 'Approved amount and a future due date are required.';
  end if;
  if decision = 'declined' and btrim(coalesce(decision_reason,'')) = '' then raise exception 'A decline reason is required.'; end if;

  delete from private.loan_kyc_records where application_id = target_application_id;
  update public.loan_applications set
    status = decision,
    kyc_status = 'purged',
    approved_amount = case when decision = 'approved' then decision_approved_amount else null end,
    due_date = case when decision = 'approved' then decision_due_date else null end,
    decline_reason = case when decision = 'declined' then left(btrim(decision_reason),1000) else null end,
    cooldown_until = case when decision = 'declined' then now() + interval '60 days' else null end,
    reviewed_by = actor_user_id,
    reviewed_at = now(),
    updated_at = now()
  where id = target_application_id and status in ('submitted','pending_review')
  returning * into result;
  if result.id is null then raise exception 'This loan application is no longer awaiting a decision.'; end if;
  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (actor_user_id, 'loan_' || decision, 'loan_applications', target_application_id,
    jsonb_build_object('approved_amount', decision_approved_amount, 'due_date', decision_due_date, 'kyc_purged', true));
  return result;
end;
$$;

create or replace function public.service_update_loan_state(
  target_application_id uuid,
  action text,
  target_repayment_id uuid,
  actor_user_id uuid
)
returns public.loan_applications
language plpgsql security definer set search_path = public
as $$
declare result public.loan_applications; outstanding numeric; previous_account_status text; suspension_reason text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service access is required.'; end if;
  select * into result from public.loan_applications where id = target_application_id for update;
  if result.id is null then raise exception 'Loan application was not found.'; end if;

  if action = 'disbursed' then
    if result.status <> 'approved' or result.disbursement_status <> 'bank_details_submitted' then raise exception 'Protected bank details are required before disbursement.'; end if;
    update public.loan_applications set status = 'active', disbursement_status = 'disbursed', updated_at = now() where id = target_application_id returning * into result;
  elsif action = 'mark_overdue' then
    select result.approved_amount - coalesce(sum(amount) filter (where status = 'confirmed'),0) into outstanding from public.loan_repayments where application_id = target_application_id;
    if result.status <> 'active' or result.due_date >= current_date or outstanding <= 0 then raise exception 'This loan is not eligible for overdue enforcement.'; end if;
    update public.loan_applications set status = 'overdue', updated_at = now() where id = target_application_id returning * into result;
    select account_status into previous_account_status from public.profiles where id = result.student_user_id for update;
    suspension_reason := 'Loan overdue: ' || result.application_number;
    insert into public.loan_account_suspensions(application_id, student_user_id, previous_status, applied)
    values (target_application_id, result.student_user_id, previous_account_status, previous_account_status = 'active')
    on conflict (application_id) do nothing;
    if previous_account_status = 'active' then
      update public.profiles set account_status = 'suspended', status_reason = suspension_reason, suspended_at = now(), updated_at = now() where id = result.student_user_id;
    end if;
  elsif action in ('confirm_repayment','reject_repayment') then
    if target_repayment_id is null then raise exception 'Choose a repayment.'; end if;
    update public.loan_repayments set status = case when action = 'confirm_repayment' then 'confirmed' else 'rejected' end,
      confirmed_by = actor_user_id, confirmed_at = now(), updated_at = now()
    where id = target_repayment_id and application_id = target_application_id and status = 'submitted';
    if not found then raise exception 'This repayment is no longer awaiting confirmation.'; end if;
    if action = 'confirm_repayment' then
      select result.approved_amount - coalesce(sum(amount) filter (where status = 'confirmed'),0) into outstanding from public.loan_repayments where application_id = target_application_id;
      if outstanding <= 0 then
        update public.loan_applications set status = 'repaid', updated_at = now() where id = target_application_id returning * into result;
        update public.loan_account_suspensions set active = false, removed_at = now() where application_id = target_application_id and active;
        update public.profiles p set account_status = s.previous_status, status_reason = 'Loan repayment confirmed', suspended_at = null, updated_at = now()
        from public.loan_account_suspensions s
        where s.application_id = target_application_id and s.student_user_id = p.id and s.applied
          and p.account_status = 'suspended' and p.status_reason = 'Loan overdue: ' || result.application_number;
      end if;
    end if;
  else raise exception 'Unsupported loan action.';
  end if;

  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (actor_user_id, 'loan_' || action, 'loan_applications', target_application_id, jsonb_build_object('repayment_id', target_repayment_id));
  return result;
end;
$$;

revoke all on function public.student_submit_loan_application(uuid,text,text,text,date,text,text,text,text,text,numeric,text,text) from public;
revoke all on function public.student_save_loan_bank_details(uuid,text,text,text) from public;
revoke all on function public.student_submit_loan_repayment(uuid,numeric,text,text) from public;
grant execute on function public.student_submit_loan_application(uuid,text,text,text,date,text,text,text,text,text,numeric,text,text) to authenticated;
grant execute on function public.student_save_loan_bank_details(uuid,text,text,text) to authenticated;
grant execute on function public.student_submit_loan_repayment(uuid,numeric,text,text) to authenticated;

revoke all on function public.service_get_loan_kyc(uuid) from public, anon, authenticated;
revoke all on function public.service_finalize_loan_decision(uuid,text,numeric,date,text,uuid) from public, anon, authenticated;
revoke all on function public.service_update_loan_state(uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.service_get_loan_kyc(uuid) to service_role;
grant execute on function public.service_finalize_loan_decision(uuid,text,numeric,date,text,uuid) to service_role;
grant execute on function public.service_update_loan_state(uuid,text,uuid,uuid) to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loan_applications') then
    alter publication supabase_realtime add table public.loan_applications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loan_repayments') then
    alter publication supabase_realtime add table public.loan_repayments;
  end if;
end $$;

notify pgrst, 'reload schema';
