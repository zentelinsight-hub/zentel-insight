alter table public.payments drop constraint if exists payments_brand_check;
alter table public.payments
  add constraint payments_brand_check
  check (brand in ('zentel', 'zentel_insight', 'studyhub'));

alter table public.enrolments alter column user_id drop not null;
alter table public.enrolments drop constraint if exists enrolments_status_check;
alter table public.enrolments
  add constraint enrolments_status_check
  check (status in ('pending','active','paid_unlinked','completed','cancelled'));

drop policy if exists "Users can read own enrolments" on public.enrolments;
create policy "Users can read own enrolments"
  on public.enrolments for select
  using (auth.uid() = user_id);
