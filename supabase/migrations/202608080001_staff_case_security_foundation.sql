-- Staff support is capability-scoped and case-scoped. Staff never receives broad table access.

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'staff', 'tutor', 'student'));

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active', 'inactive', 'suspended', 'restricted'));

alter table public.profiles drop constraint if exists profiles_portal_id_format_check;
alter table public.profiles add constraint profiles_portal_id_format_check
  check (portal_id is null or portal_id ~ '^ZI[STF]-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');

create or replace function public.generate_account_portal_id(account_role text)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  prefix text;
  random_bytes bytea;
  token text;
  candidate text;
begin
  prefix := case account_role
    when 'student' then 'ZIS-'
    when 'tutor' then 'ZIT-'
    when 'staff' then 'ZIF-'
    else null
  end;
  if prefix is null then raise exception 'Portal IDs are unavailable for this account role.'; end if;

  for attempt in 1..50 loop
    random_bytes := gen_random_bytes(8);
    token := '';
    for byte_index in 0..7 loop
      token := token || substr(alphabet, (get_byte(random_bytes, byte_index) % length(alphabet)) + 1, 1);
    end loop;
    candidate := prefix || substr(token, 1, 4) || '-' || substr(token, 5, 4);
    if not exists (select 1 from public.profiles where portal_id = candidate) then return candidate; end if;
  end loop;
  raise exception 'A unique Portal ID could not be generated.';
end;
$$;

revoke all on function public.generate_account_portal_id(text) from public;

create or replace function public.assign_profile_portal_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare account_role text;
begin
  if tg_op = 'UPDATE' and old.portal_id is not null and new.portal_id is distinct from old.portal_id then
    raise exception 'Portal IDs are permanent and cannot be changed.';
  end if;
  if new.portal_id is not null then new.portal_id := upper(btrim(new.portal_id)); return new; end if;

  select role into account_role from public.user_roles where user_id = new.id;
  if account_role is null then
    select case
      when lower(coalesce(u.email, '')) = 'zentelinsight@gmail.com' then 'admin'
      when coalesce(u.raw_app_meta_data ->> 'zentel_role', '') in ('staff', 'tutor')
        and coalesce(u.raw_app_meta_data ->> 'zentel_provisioned_by', '') = 'admin'
        then u.raw_app_meta_data ->> 'zentel_role'
      else 'student'
    end into account_role
    from auth.users u where u.id = new.id;
  end if;
  if account_role in ('student', 'tutor', 'staff') then
    new.portal_id := public.generate_account_portal_id(account_role);
  end if;
  return new;
end;
$$;

create or replace function public.assign_portal_id_after_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('student', 'tutor', 'staff') then
    update public.profiles
    set portal_id = public.generate_account_portal_id(new.role), updated_at = now()
    where id = new.user_id and portal_id is null;
  end if;
  return new;
end;
$$;

create or replace function public.require_portal_id_for_learner_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('student', 'tutor', 'staff') and not exists (
    select 1 from public.profiles where id = new.user_id and portal_id is not null
  ) then raise exception 'Student, Tutor and Staff accounts require a permanent Portal ID.';
  end if;
  return new;
end;
$$;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  job_title text not null default 'Support Staff',
  department text not null default 'Learner Support',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_capabilities (
  staff_user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  capability text not null check (capability in (
    'account_search', 'view_basic_profile', 'view_programme_assignment',
    'view_payment_status', 'view_loan_status', 'correct_contact_information',
    'send_support_notification', 'resolve_support_case', 'create_admin_escalation'
  )),
  enabled boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (staff_user_id, capability)
);

create table if not exists public.staff_support_cases (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null unique default ('ZSC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  subject_user_id uuid not null references public.profiles(id) on delete restrict,
  owner_staff_id uuid references public.staff_profiles(user_id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'escalated', 'resolved', 'closed', 'released', 'transferred')),
  issue text not null check (char_length(btrim(issue)) between 4 and 500),
  reason text not null check (char_length(btrim(reason)) between 4 and 1000),
  assigned_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_one_active_case_idx
  on public.staff_support_cases(owner_staff_id)
  where owner_staff_id is not null and status in ('open', 'in_progress', 'escalated');
create index if not exists staff_cases_subject_idx on public.staff_support_cases(subject_user_id, created_at desc);
create index if not exists staff_cases_owner_idx on public.staff_support_cases(owner_staff_id, updated_at desc);

create table if not exists public.staff_case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.staff_support_cases(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  note text not null check (char_length(btrim(note)) between 2 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.staff_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.staff_support_cases(id) on delete cascade,
  staff_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  issue text not null check (char_length(btrim(issue)) between 4 and 500),
  requested_action text not null check (char_length(btrim(requested_action)) between 4 and 500),
  reason text not null check (char_length(btrim(reason)) between 4 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'answered', 'cancelled')),
  admin_response text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.staff_support_cases(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  permitted_area text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_search_events (
  id bigint generated always as identity primary key,
  staff_user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  query_hash text not null,
  result_count integer not null default 0,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_search_candidates (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  target_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

alter table public.staff_profiles enable row level security;
alter table public.staff_capabilities enable row level security;
alter table public.staff_support_cases enable row level security;
alter table public.staff_case_notes enable row level security;
alter table public.staff_requests enable row level security;
alter table public.staff_case_events enable row level security;
alter table public.staff_search_events enable row level security;
alter table public.staff_search_candidates enable row level security;
alter table public.security_events enable row level security;

create or replace function public.is_active_staff(target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
    where r.user_id = target_user_id and r.role = 'staff' and p.account_status = 'active'
  );
$$;

create or replace function public.staff_has_capability(required_capability text, target_staff_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_active_staff(target_staff_id) and exists (
    select 1 from public.staff_capabilities c
    where c.staff_user_id = target_staff_id and c.capability = required_capability and c.enabled
  );
$$;

create or replace function public.staff_owns_active_case(target_case_id uuid, required_capability text default null)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_active_staff(auth.uid())
    and (required_capability is null or public.staff_has_capability(required_capability, auth.uid()))
    and exists (
      select 1 from public.staff_support_cases c
      where c.id = target_case_id and c.owner_staff_id = auth.uid()
        and c.status in ('open', 'in_progress', 'escalated')
    );
$$;

revoke all on function public.is_active_staff(uuid) from public;
revoke all on function public.staff_has_capability(text, uuid) from public;
revoke all on function public.staff_owns_active_case(uuid, text) from public;
grant execute on function public.is_active_staff(uuid), public.staff_has_capability(text, uuid), public.staff_owns_active_case(uuid, text) to authenticated;

create or replace function public.enforce_staff_profile_self_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() = old.id
    and exists (select 1 from public.user_roles where user_id = old.id and role = 'staff')
    and not public.is_verified_admin_session()
    and coalesce(current_setting('zentel.staff_security_maintenance', true), '') <> 'on'
    and (to_jsonb(new) - array['avatar_path','updated_at']::text[]) is distinct from (to_jsonb(old) - array['avatar_path','updated_at']::text[])
  then
    raise exception 'Staff may update only their profile picture.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_staff_self_update on public.profiles;
create trigger profiles_enforce_staff_self_update
  before update on public.profiles
  for each row execute function public.enforce_staff_profile_self_update();

create policy "Staff read own staff profile" on public.staff_profiles for select to authenticated using (user_id = auth.uid());
create policy "Verified admins manage staff profiles" on public.staff_profiles for all to authenticated using (public.is_verified_admin_session()) with check (public.is_verified_admin_session());
create policy "Staff read own capabilities" on public.staff_capabilities for select to authenticated using (staff_user_id = auth.uid());
create policy "Verified admins manage staff capabilities" on public.staff_capabilities for all to authenticated using (public.is_verified_admin_session()) with check (public.is_verified_admin_session());
create policy "Staff read owned cases" on public.staff_support_cases for select to authenticated using (owner_staff_id = auth.uid() and public.is_active_staff());
create policy "Verified admins manage staff cases" on public.staff_support_cases for all to authenticated using (public.is_verified_admin_session()) with check (public.is_verified_admin_session());
create policy "Staff read notes for owned cases" on public.staff_case_notes for select to authenticated using (public.staff_owns_active_case(case_id));
create policy "Verified admins manage case notes" on public.staff_case_notes for all to authenticated using (public.is_verified_admin_session()) with check (public.is_verified_admin_session());
create policy "Staff read own requests" on public.staff_requests for select to authenticated using (staff_user_id = auth.uid() and public.is_active_staff());
create policy "Verified admins manage staff requests" on public.staff_requests for all to authenticated using (public.is_verified_admin_session()) with check (public.is_verified_admin_session());
create policy "Staff read owned case events" on public.staff_case_events for select to authenticated using (exists (select 1 from public.staff_support_cases c where c.id = case_id and c.owner_staff_id = auth.uid()) and public.is_active_staff());
create policy "Verified admins read case events" on public.staff_case_events for select to authenticated using (public.is_verified_admin_session());
create policy "Staff read own search events" on public.staff_search_events for select to authenticated using (staff_user_id = auth.uid() and public.is_active_staff());
create policy "Verified admins read Staff searches" on public.staff_search_events for select to authenticated using (public.is_verified_admin_session());
create policy "Verified admins read security events" on public.security_events for select to authenticated using (public.is_verified_admin_session());
create policy "Verified admins update security events" on public.security_events for update to authenticated using (public.is_verified_admin_session()) with check (public.is_verified_admin_session());

create or replace function public.staff_mask_email(value text)
returns text language sql immutable set search_path = public
as $$
  select case when position('@' in coalesce(value, '')) > 1
    then left(split_part(value, '@', 1), 1) || '***@' || split_part(value, '@', 2)
    else '' end;
$$;

create or replace function public.staff_mask_phone(value text)
returns text language sql immutable set search_path = public
as $$ select case when length(regexp_replace(coalesce(value, ''), '\\D', '', 'g')) >= 4 then '***' || right(regexp_replace(value, '\\D', '', 'g'), 4) else '' end; $$;

create or replace function public.staff_search_accounts(search_text text)
returns table (
  candidate_token uuid,
  display_name text,
  masked_email text,
  masked_phone text,
  role_name text,
  account_status text,
  programme_name text,
  security_restricted boolean
)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  clean_query text := lower(btrim(coalesce(search_text, '')));
  recent_count integer;
  match_count integer;
begin
  if not public.staff_has_capability('account_search') then raise exception 'Staff account search is not permitted.'; end if;
  if char_length(clean_query) < 3 then raise exception 'Enter at least three characters.'; end if;

  insert into public.staff_search_events(staff_user_id, query_hash)
  values (auth.uid(), encode(digest(clean_query, 'sha256'), 'hex'));

  select count(*)::integer into recent_count from public.staff_search_events
  where staff_user_id = auth.uid() and created_at >= now() - interval '2 minutes';
  if recent_count >= 20 then
    update public.staff_search_events set blocked = true where id = (select max(id) from public.staff_search_events where staff_user_id = auth.uid());
    perform set_config('zentel.staff_security_maintenance', 'on', true);
    update public.profiles set account_status = 'restricted', status_reason = 'Automated Staff search security review', updated_at = now() where id = auth.uid();
    insert into public.security_events(actor_user_id, target_user_id, event_type, severity, metadata)
    values (auth.uid(), auth.uid(), 'staff_search_rate_threshold', 'high', jsonb_build_object('window_seconds', 120, 'search_count', recent_count));
    insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
    values (auth.uid(), 'staff_search_access_restricted', 'profiles', auth.uid(), jsonb_build_object('window_seconds', 120));
    return query select null::uuid, ''::text, ''::text, ''::text, ''::text, 'restricted'::text, ''::text, true;
    return;
  end if;

  if clean_query ~* '^zi[stf]-' or clean_query ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$' then
    insert into public.security_events(actor_user_id, event_type, severity, metadata)
    values (auth.uid(), 'staff_identifier_search_blocked', 'medium', jsonb_build_object('identifier_type', 'blocked'));
    return;
  end if;

  if exists (
    select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
    where r.role in ('admin', 'staff') and (lower(p.email) = clean_query or lower(p.full_name) = clean_query)
  ) then
    insert into public.security_events(actor_user_id, event_type, severity, metadata)
    values (auth.uid(), 'staff_privileged_account_search_blocked', 'high', jsonb_build_object('target_role', 'privileged'));
    return;
  end if;

  delete from public.staff_search_candidates where expires_at < now();
  insert into public.staff_search_candidates(staff_user_id, subject_user_id)
  select auth.uid(), p.id
  from public.profiles p join public.user_roles r on r.user_id = p.id
  where r.role in ('student', 'tutor')
    and (lower(p.full_name) like '%' || clean_query || '%' or lower(p.email) = clean_query or regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') = regexp_replace(clean_query, '\\D', '', 'g'))
  order by lower(p.full_name), p.created_at desc
  limit 10;

  select count(*)::integer into match_count from public.staff_search_candidates
  where staff_user_id = auth.uid() and created_at >= now() - interval '2 seconds';
  update public.staff_search_events set result_count = match_count
  where id = (select max(id) from public.staff_search_events where staff_user_id = auth.uid());

  return query
  select c.id, p.full_name, public.staff_mask_email(p.email), public.staff_mask_phone(p.phone), r.role,
    p.account_status,
    case when public.staff_has_capability('view_programme_assignment') then coalesce(program.title, '') else '' end,
    false
  from public.staff_search_candidates c
  join public.profiles p on p.id = c.subject_user_id
  join public.user_roles r on r.user_id = p.id and r.role in ('student', 'tutor')
  left join lateral (
    select pr.title from public.enrolments e join public.programs pr on pr.id = e.program_id
    where e.user_id = p.id and e.status = 'active' order by e.updated_at desc limit 1
  ) program on r.role = 'student'
  where c.staff_user_id = auth.uid() and c.expires_at > now() and c.created_at >= now() - interval '2 seconds'
  order by lower(p.full_name);
end;
$$;

create or replace function public.staff_claim_case(candidate_token uuid, case_issue text, case_reason text)
returns table (case_id uuid, case_reference text)
language plpgsql security definer set search_path = public
as $$
declare target_user uuid; saved public.staff_support_cases;
begin
  if not public.staff_has_capability('view_basic_profile') then raise exception 'Staff case access is not permitted.'; end if;
  if exists (select 1 from public.staff_support_cases where owner_staff_id = auth.uid() and status in ('open','in_progress','escalated')) then
    raise exception 'Close, escalate, transfer or release the current case before taking another case.';
  end if;
  select subject_user_id into target_user from public.staff_search_candidates
  where id = candidate_token and staff_user_id = auth.uid() and expires_at > now();
  if target_user is null then raise exception 'This search result has expired. Search again.'; end if;
  if not exists (select 1 from public.user_roles where user_id = target_user and role in ('student','tutor')) then raise exception 'This account cannot be handled by Staff.'; end if;

  insert into public.staff_support_cases(subject_user_id, owner_staff_id, status, issue, reason, assigned_by)
  values (target_user, auth.uid(), 'open', btrim(case_issue), btrim(case_reason), auth.uid()) returning * into saved;
  insert into public.staff_case_events(case_id, actor_user_id, event_type, permitted_area)
  values (saved.id, auth.uid(), 'case_claimed', 'basic_profile');
  delete from public.staff_search_candidates where staff_user_id = auth.uid();
  return query select saved.id, saved.case_reference;
end;
$$;

create or replace function public.staff_get_active_case()
returns table (
  case_id uuid, case_reference text, case_status text, issue text, reason text,
  display_name text, masked_email text, masked_phone text, role_name text,
  account_status text, programme_name text, created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_active_staff() then raise exception 'Active Staff access is required.'; end if;
  return query
  select c.id, c.case_reference, c.status, c.issue, c.reason, p.full_name,
    public.staff_mask_email(p.email), public.staff_mask_phone(p.phone), r.role, p.account_status,
    case when public.staff_has_capability('view_programme_assignment') then coalesce(program.title, '') else '' end,
    c.created_at
  from public.staff_support_cases c
  join public.profiles p on p.id = c.subject_user_id
  join public.user_roles r on r.user_id = p.id and r.role in ('student','tutor')
  left join lateral (
    select pr.title from public.enrolments e join public.programs pr on pr.id = e.program_id
    where e.user_id = p.id and e.status = 'active' order by e.updated_at desc limit 1
  ) program on r.role = 'student'
  where c.owner_staff_id = auth.uid() and c.status in ('open','in_progress','escalated')
  order by c.updated_at desc limit 1;
end;
$$;

create or replace function public.staff_add_case_note(target_case_id uuid, note_text text)
returns uuid language plpgsql security definer set search_path = public
as $$ declare saved_id uuid; begin
  if not public.staff_owns_active_case(target_case_id) then raise exception 'This case is not assigned to you.'; end if;
  insert into public.staff_case_notes(case_id, author_user_id, note) values (target_case_id, auth.uid(), btrim(note_text)) returning id into saved_id;
  insert into public.staff_case_events(case_id, actor_user_id, event_type, permitted_area) values (target_case_id, auth.uid(), 'internal_note_added', 'case_notes');
  return saved_id;
end; $$;

create or replace function public.staff_close_case(target_case_id uuid, resolution_note text)
returns boolean language plpgsql security definer set search_path = public
as $$ begin
  if not public.staff_owns_active_case(target_case_id, 'resolve_support_case') then raise exception 'You cannot resolve this case.'; end if;
  update public.staff_support_cases set status = 'resolved', closed_at = now(), updated_at = now() where id = target_case_id;
  insert into public.staff_case_notes(case_id, author_user_id, note) values (target_case_id, auth.uid(), btrim(resolution_note));
  insert into public.staff_case_events(case_id, actor_user_id, event_type, permitted_area) values (target_case_id, auth.uid(), 'case_resolved', 'case');
  return true;
end; $$;

create or replace function public.staff_create_escalation(target_case_id uuid, escalation_issue text, requested_action text, escalation_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$ declare saved_id uuid; begin
  if not public.staff_owns_active_case(target_case_id, 'create_admin_escalation') then raise exception 'You cannot escalate this case.'; end if;
  insert into public.staff_requests(case_id, staff_user_id, issue, requested_action, reason)
  values (target_case_id, auth.uid(), btrim(escalation_issue), btrim(requested_action), btrim(escalation_reason)) returning id into saved_id;
  update public.staff_support_cases set status = 'escalated', updated_at = now() where id = target_case_id;
  insert into public.staff_case_events(case_id, actor_user_id, event_type, permitted_area) values (target_case_id, auth.uid(), 'admin_escalation_created', 'escalations');
  return saved_id;
end; $$;

create or replace function public.admin_set_staff_capability(target_staff_id uuid, target_capability text, capability_enabled boolean)
returns public.staff_capabilities language plpgsql security definer set search_path = public
as $$ declare saved public.staff_capabilities; begin
  if not public.is_verified_admin_session() then raise exception 'Admin security verification is required.'; end if;
  if not exists (select 1 from public.user_roles where user_id = target_staff_id and role = 'staff') then raise exception 'A Staff account is required.'; end if;
  insert into public.staff_capabilities(staff_user_id, capability, enabled, granted_by, granted_at)
  values (target_staff_id, target_capability, capability_enabled, auth.uid(), case when capability_enabled then now() else null end)
  on conflict (staff_user_id, capability) do update set enabled = excluded.enabled, granted_by = auth.uid(), granted_at = excluded.granted_at, updated_at = now()
  returning * into saved;
  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'staff_capability_changed', 'staff_capabilities', target_staff_id, jsonb_build_object('capability', target_capability, 'enabled', capability_enabled));
  return saved;
end; $$;

create or replace function public.admin_transfer_staff_case(target_case_id uuid, next_staff_id uuid, transfer_reason text)
returns public.staff_support_cases language plpgsql security definer set search_path = public
as $$ declare saved public.staff_support_cases; begin
  if not public.is_verified_admin_session() then raise exception 'Admin security verification is required.'; end if;
  if next_staff_id is not null and not public.is_active_staff(next_staff_id) then raise exception 'Choose an active Staff account.'; end if;
  if next_staff_id is not null and exists (select 1 from public.staff_support_cases where owner_staff_id = next_staff_id and status in ('open','in_progress','escalated') and id <> target_case_id) then raise exception 'The selected Staff member already owns an active case.'; end if;
  update public.staff_support_cases set owner_staff_id = next_staff_id, status = case when next_staff_id is null then 'released' else 'in_progress' end, assigned_by = auth.uid(), updated_at = now()
  where id = target_case_id returning * into saved;
  if saved.id is null then raise exception 'Case not found.'; end if;
  insert into public.staff_case_events(case_id, actor_user_id, event_type, permitted_area, metadata)
  values (target_case_id, auth.uid(), case when next_staff_id is null then 'case_released' else 'case_transferred' end, 'ownership', jsonb_build_object('reason', left(btrim(transfer_reason), 1000)));
  return saved;
end; $$;

revoke all on function public.staff_search_accounts(text), public.staff_claim_case(uuid,text,text), public.staff_get_active_case(), public.staff_add_case_note(uuid,text), public.staff_close_case(uuid,text), public.staff_create_escalation(uuid,text,text,text), public.admin_set_staff_capability(uuid,text,boolean), public.admin_transfer_staff_case(uuid,uuid,text) from public;
grant execute on function public.staff_search_accounts(text), public.staff_claim_case(uuid,text,text), public.staff_get_active_case(), public.staff_add_case_note(uuid,text), public.staff_close_case(uuid,text), public.staff_create_escalation(uuid,text,text,text), public.admin_set_staff_capability(uuid,text,boolean), public.admin_transfer_staff_case(uuid,uuid,text) to authenticated;

drop trigger if exists staff_profiles_set_updated_at on public.staff_profiles;
create trigger staff_profiles_set_updated_at before update on public.staff_profiles for each row execute function public.set_updated_at();
drop trigger if exists staff_capabilities_set_updated_at on public.staff_capabilities;
create trigger staff_capabilities_set_updated_at before update on public.staff_capabilities for each row execute function public.set_updated_at();
drop trigger if exists staff_cases_set_updated_at on public.staff_support_cases;
create trigger staff_cases_set_updated_at before update on public.staff_support_cases for each row execute function public.set_updated_at();
drop trigger if exists staff_requests_set_updated_at on public.staff_requests;
create trigger staff_requests_set_updated_at before update on public.staff_requests for each row execute function public.set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.staff_support_cases;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.staff_requests;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.security_events;
exception when duplicate_object then null;
end $$;

grant select on public.staff_profiles, public.staff_capabilities, public.staff_support_cases, public.staff_case_notes, public.staff_requests, public.staff_case_events, public.staff_search_events, public.security_events to authenticated;
notify pgrst, 'reload schema';
