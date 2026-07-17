create extension if not exists "pgcrypto";

alter table public.profiles add column if not exists education_level text not null default '';
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists profile_completion integer not null default 0 check (profile_completion between 0 and 100);

update public.profiles
set profile_completion = case
  when profile_completed then 100
  else least(
    100,
    (
      (case when nullif(full_name, '') is not null then 1 else 0 end) +
      (case when nullif(email, '') is not null then 1 else 0 end) +
      (case when nullif(phone, '') is not null then 1 else 0 end) +
      (case when date_of_birth is not null then 1 else 0 end) +
      (case when nullif(education_level, '') is not null then 1 else 0 end) +
      (case when nullif(address, '') is not null then 1 else 0 end)
    ) * 100 / 6
  )
end
where profile_completion = 0;

drop policy if exists "Users can update own profile once" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  completion integer;
begin
  completion := (
    (case when nullif(new.raw_user_meta_data ->> 'full_name', '') is not null then 1 else 0 end) +
    (case when nullif(new.email, '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'phone', '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'date_of_birth', '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'education_level', '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'address', '') is not null then 1 else 0 end)
  ) * 100 / 6;

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    date_of_birth,
    education_level,
    address,
    profile_completed,
    profile_completion
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    coalesce(new.raw_user_meta_data ->> 'education_level', ''),
    coalesce(new.raw_user_meta_data ->> 'address', ''),
    completion >= 80,
    completion
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    phone = coalesce(nullif(public.profiles.phone, ''), excluded.phone),
    date_of_birth = coalesce(public.profiles.date_of_birth, excluded.date_of_birth),
    education_level = coalesce(nullif(public.profiles.education_level, ''), excluded.education_level),
    address = coalesce(nullif(public.profiles.address, ''), excluded.address),
    profile_completion = greatest(public.profiles.profile_completion, excluded.profile_completion),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.portal_page_content (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null unique,
  title text not null,
  description text not null,
  helper_text text not null default '',
  empty_title text not null,
  empty_message text not null,
  status text not null default 'published' check (status in ('draft', 'published')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portal_page_content enable row level security;

drop policy if exists "Authenticated users can read published portal page content" on public.portal_page_content;
create policy "Authenticated users can read published portal page content"
  on public.portal_page_content for select
  using (auth.role() = 'authenticated' and status = 'published');

insert into public.portal_page_content (page_slug, title, description, helper_text, empty_title, empty_message, sort_order)
values
  ('dashboard', 'Student Dashboard', 'Review your Zentel Insight learning activity, account status and recent updates.', 'Dashboard cards are calculated from your Supabase student records.', 'Your learning activity is being prepared', 'After enrolment and publication, your classes, resources, announcements and account records are shown in this dashboard.', 10),
  ('profile', 'Student Profile', 'Manage the personal details connected to your Zentel Insight student account.', 'Only your signed-in account can read and update this profile.', 'Profile information is unavailable', 'Refresh the page or contact support if your profile details do not load.', 20),
  ('my-courses', 'My Courses', 'View the programmes and tracks linked to your verified student account.', 'Courses are loaded from enrolment records attached to your account.', 'No active courses yet', 'Your enrolled Zentel Insight courses are listed after a verified enrolment record is linked to your account.', 30),
  ('timetable', 'Class Timetable', 'View your scheduled Zentel Insight classes, dates, times and approved meeting information.', 'Timetable entries are restricted to active enrolments.', 'No classes have been scheduled yet', 'Your published timetable is shown after your course schedule is available.', 40),
  ('announcements', 'Announcements', 'Read official Zentel Insight notices published for your student account and courses.', 'General notices and course notices are loaded from Supabase.', 'No announcements yet', 'Official student notices are listed after they are published.', 50),
  ('assignments', 'Assignments', 'Track published assignments for the programmes attached to your account.', 'Submissions and scores are private to your account.', 'No assignments have been published', 'Assignments for your active courses are shown after your instructor publishes them.', 60),
  ('resources', 'Learning Resources', 'Access approved resources for your enrolled Zentel Insight programmes.', 'Private resources require an active enrolment.', 'No resources are available yet', 'Course resources linked to your active enrolments are shown after they are published.', 70),
  ('payments', 'Payments', 'Review trusted payment records linked to your student account.', 'Frontend Paystack callbacks are not used as portal payment authority.', 'No payment records are available yet', 'Verified payment and enrolment records linked to your account are shown after they are available.', 80),
  ('certificates', 'Certificates', 'View certificates issued to your Zentel Insight student account.', 'Certificates are created only from trusted records.', 'No certificates have been issued', 'Certificates are shown only after they are officially issued for completed learning.', 90),
  ('notifications', 'Notifications', 'See private account notifications and student portal updates.', 'Unread updates are scoped to your account.', 'No notifications', 'Personal portal notifications are listed when there are updates for your account.', 100),
  ('support', 'Support Tickets', 'Contact Zentel Insight support and track your student support requests.', 'Support tickets are visible only to the learner who created them.', 'No support tickets', 'Support requests you create from the portal are listed with their current status.', 110),
  ('settings', 'Account Settings', 'Manage account access, password recovery, theme preference and session options.', 'Settings actions save only after Supabase confirms the request.', 'Settings are ready', 'Use the available account actions to manage your student portal access.', 120)
on conflict (page_slug) do update
set
  title = excluded.title,
  description = excluded.description,
  helper_text = excluded.helper_text,
  empty_title = excluded.empty_title,
  empty_message = excluded.empty_message,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.timetable_entries add column if not exists description text not null default '';
alter table public.timetable_entries add column if not exists class_date date;
alter table public.timetable_entries add column if not exists timezone text not null default 'Africa/Lagos';
alter table public.timetable_entries add column if not exists meeting_provider text not null default '';
alter table public.timetable_entries add column if not exists instructor_name text not null default '';
alter table public.timetable_entries add column if not exists published boolean not null default false;

drop policy if exists "Users can read timetable for active enrolments" on public.timetable_entries;
create policy "Users can read timetable for active enrolments"
  on public.timetable_entries for select
  using (
    auth.role() = 'authenticated'
    and active = true
    and published = true
    and exists (
      select 1 from public.enrolments e
      where e.user_id = auth.uid()
        and e.program_id = timetable_entries.program_id
        and e.status = 'active'
        and (
          timetable_entries.program_level_id is null
          or e.program_level_id = timetable_entries.program_level_id
        )
    )
  );

alter table public.resources add column if not exists program_level_id uuid references public.program_levels(id) on delete cascade;
alter table public.resources add column if not exists module_title text not null default '';
alter table public.resources add column if not exists description text not null default '';
alter table public.resources add column if not exists external_url text;
alter table public.resources add column if not exists storage_path text;
alter table public.resources add column if not exists published boolean not null default false;
alter table public.resources add column if not exists sort_order integer not null default 100;

update public.resources
set external_url = url
where external_url is null and nullif(url, '') is not null;

drop policy if exists "Users can read resources for active enrolments" on public.resources;
create policy "Users can read resources for active enrolments"
  on public.resources for select
  using (
    auth.role() = 'authenticated'
    and active = true
    and published = true
    and exists (
      select 1 from public.enrolments e
      where e.user_id = auth.uid()
        and e.program_id = resources.program_id
        and e.status = 'active'
        and (
          resources.program_level_id is null
          or e.program_level_id = resources.program_level_id
        )
    )
  );

alter table public.announcements add column if not exists published boolean not null default true;

drop policy if exists "Active announcements are readable by authenticated users" on public.announcements;
create policy "Active announcements are readable by authorized authenticated users"
  on public.announcements for select
  using (
    auth.role() = 'authenticated'
    and active = true
    and published = true
    and (
      program_id is null
      or exists (
        select 1 from public.enrolments e
        where e.user_id = auth.uid()
          and e.program_id = announcements.program_id
          and e.status in ('active', 'completed')
      )
    )
  );

insert into public.announcements (program_id, title, summary, body, priority, active, published, published_at)
select
  null,
  'Welcome to the Zentel Insight Student Portal',
  'A short guide to your private learner workspace.',
  'Use this portal to review verified enrolments, published schedules, course resources, official announcements, assignments, payment records, certificates, notifications and support tickets as they become available for your account.',
  'normal',
  true,
  true,
  now()
where not exists (
  select 1 from public.announcements
  where title = 'Welcome to the Zentel Insight Student Portal'
    and program_id is null
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  program_level_id uuid references public.program_levels(id) on delete cascade,
  title text not null,
  instructions text not null default '',
  due_at timestamptz,
  maximum_score integer not null default 100 check (maximum_score > 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_text text not null default '',
  file_path text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'graded', 'returned')),
  submitted_at timestamptz,
  score numeric,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, user_id)
);

alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;

drop policy if exists "Users can read assignments for active enrolments" on public.assignments;
create policy "Users can read assignments for active enrolments"
  on public.assignments for select
  using (
    auth.role() = 'authenticated'
    and published = true
    and exists (
      select 1 from public.enrolments e
      where e.user_id = auth.uid()
        and e.program_id = assignments.program_id
        and e.status = 'active'
        and (
          assignments.program_level_id is null
          or e.program_level_id = assignments.program_level_id
        )
    )
  );

drop policy if exists "Users can read own assignment submissions" on public.assignment_submissions;
create policy "Users can read own assignment submissions"
  on public.assignment_submissions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own assignment submissions" on public.assignment_submissions;
create policy "Users can create own assignment submissions"
  on public.assignment_submissions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own draft assignment submissions" on public.assignment_submissions;
create policy "Users can update own draft assignment submissions"
  on public.assignment_submissions for update
  using (auth.uid() = user_id and status in ('draft', 'returned'))
  with check (auth.uid() = user_id);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  enrolment_id uuid references public.enrolments(id) on delete set null,
  certificate_number text unique,
  title text not null,
  issued_at timestamptz,
  file_path text,
  status text not null default 'pending' check (status in ('pending', 'issued', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.certificates enable row level security;

drop policy if exists "Users can read own certificates" on public.certificates;
create policy "Users can read own certificates"
  on public.certificates for select
  using (auth.uid() = user_id);

create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'general',
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.portal_notifications enable row level security;

drop policy if exists "Users can read own portal notifications" on public.portal_notifications;
create policy "Users can read own portal notifications"
  on public.portal_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own portal notifications" on public.portal_notifications;
create policy "Users can update own portal notifications"
  on public.portal_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  category text not null default 'general',
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;

drop policy if exists "Users can read own support tickets" on public.support_tickets;
create policy "Users can read own support tickets"
  on public.support_tickets for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own support tickets" on public.support_tickets;
create policy "Users can create own support tickets"
  on public.support_tickets for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own open support tickets" on public.support_tickets;

drop policy if exists "Users can read own Zentel payments" on public.payments;
drop policy if exists "Users can read own payments" on public.payments;
create policy "Users can read own payments"
  on public.payments for select
  using (auth.uid() = user_id);

create index if not exists profiles_email_idx on public.profiles(email);
create index if not exists enrolments_user_status_idx on public.enrolments(user_id, status);
create index if not exists timetable_entries_program_published_idx on public.timetable_entries(program_id, published, class_date);
create index if not exists resources_program_published_idx on public.resources(program_id, published, sort_order);
create index if not exists assignments_program_published_idx on public.assignments(program_id, published, due_at);
create index if not exists assignment_submissions_user_idx on public.assignment_submissions(user_id);
create index if not exists certificates_user_idx on public.certificates(user_id);
create index if not exists portal_notifications_user_idx on public.portal_notifications(user_id, read_at);
create index if not exists support_tickets_user_idx on public.support_tickets(user_id, status);

drop trigger if exists portal_page_content_set_updated_at on public.portal_page_content;
create trigger portal_page_content_set_updated_at before update on public.portal_page_content
  for each row execute procedure public.set_updated_at();

drop trigger if exists assignments_set_updated_at on public.assignments;
create trigger assignments_set_updated_at before update on public.assignments
  for each row execute procedure public.set_updated_at();

drop trigger if exists assignment_submissions_set_updated_at on public.assignment_submissions;
create trigger assignment_submissions_set_updated_at before update on public.assignment_submissions
  for each row execute procedure public.set_updated_at();

drop trigger if exists certificates_set_updated_at on public.certificates;
create trigger certificates_set_updated_at before update on public.certificates
  for each row execute procedure public.set_updated_at();

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at before update on public.support_tickets
  for each row execute procedure public.set_updated_at();
