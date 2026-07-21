create extension if not exists "pgcrypto";

alter table public.profiles add column if not exists education_level text not null default '';
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists profile_completion integer not null default 0 check (profile_completion between 0 and 100);

update public.profiles
set profile_completion = least(
  100,
  (
    (case when nullif(full_name, '') is not null then 1 else 0 end) +
    (case when nullif(phone, '') is not null then 1 else 0 end) +
    (case when date_of_birth is not null then 1 else 0 end) +
    (case when nullif(education_level, '') is not null then 1 else 0 end) +
    (case when nullif(address, '') is not null then 1 else 0 end) +
    (case when nullif(avatar_path, '') is not null then 1 else 0 end)
  ) * 100 / 6
);

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create table if not exists public.student_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email_notifications boolean not null default true,
  portal_reminders boolean not null default true,
  session_security_warnings boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.student_preferences enable row level security;

drop policy if exists "Users can read own student preferences" on public.student_preferences;
create policy "Users can read own student preferences"
  on public.student_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own student preferences" on public.student_preferences;
create policy "Users can create own student preferences"
  on public.student_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own student preferences" on public.student_preferences;
create policy "Users can update own student preferences"
  on public.student_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own student preferences" on public.student_preferences;
create policy "Users can delete own student preferences"
  on public.student_preferences for delete
  to authenticated
  using ((select auth.uid()) = user_id);

alter table public.portal_page_content add column if not exists primary_action_label text;
alter table public.portal_page_content add column if not exists primary_action_path text;
alter table public.portal_page_content add column if not exists published boolean not null default true;

update public.portal_page_content
set published = status = 'published'
where published is distinct from (status = 'published');

drop policy if exists "Authenticated users can read published portal page content" on public.portal_page_content;
create policy "Authenticated users can read published portal page content"
  on public.portal_page_content for select
  to authenticated
  using (published = true and status = 'published');

insert into public.portal_page_content (page_slug, title, description, helper_text, empty_title, empty_message, primary_action_label, primary_action_path, status, published, sort_order)
values
  ('dashboard', 'Student Dashboard', 'View your Zentel Insight learning activity, upcoming classes, current programmes, announcements, assignments and account information in one place.', '', 'Your learning space is ready', 'Your enrolled programmes, class schedule and learning activities will appear here as they are assigned to your account.', 'Edit Profile', '/portal/profile', 'published', true, 10),
  ('profile', 'My Profile', 'Review and update the personal information connected to your Zentel Insight student account.', '', 'Complete your learner profile', 'Add your current contact and education information so Zentel Insight can provide accurate class and account support.', 'Save Profile', '/portal/profile', 'published', true, 20),
  ('my-courses', 'My Courses', 'View the programmes and learning tracks currently connected to your Zentel Insight account.', '', 'No active programme yet', 'When an enrolment has been confirmed and linked to your account, it will appear here.', 'Browse Programs', '/programs', 'published', true, 30),
  ('timetable', 'Class Timetable', 'View your published weekly class schedule, class times, programme details and available meeting information.', '', 'No class has been assigned yet', 'Your timetable will appear here after a programme enrolment and class schedule have been assigned to your account.', null, null, 'published', true, 40),
  ('announcements', 'Announcements', 'Read important academic information, class notices, platform updates and messages from Zentel Insight.', '', 'No announcements available', 'New information from Zentel Insight will appear here when it is published.', null, null, 'published', true, 50),
  ('assignments', 'Assignments', 'View learning tasks, instructions, submission deadlines and feedback connected to your active programme.', '', 'No assignments available', 'Published assignments for your programme will appear here.', null, null, 'published', true, 60),
  ('resources', 'Learning Resources', 'Access approved documents, templates, class links and learning materials connected to your programme.', '', 'No resources available', 'Learning materials will appear here when they are published for your programme.', null, null, 'published', true, 70),
  ('payments', 'Payment Records', 'View trusted payment records and enrolment transactions connected to your Zentel Insight student account.', '', 'No payment records available', 'Verified payment records linked to your student account will appear here.', null, null, 'published', true, 80),
  ('certificates', 'Certificates', 'View certificates issued after eligible Zentel Insight programmes have been completed and approved.', '', 'No certificates issued yet', 'Eligible certificates will appear here after programme completion and approval.', null, null, 'published', true, 90),
  ('notifications', 'Notifications', 'View account updates, class reminders, assignment notices and other information intended for you.', '', 'You have no notifications', 'New account and learning notifications will appear here.', null, null, 'published', true, 100),
  ('articles', 'Learning Articles', 'Read practical articles designed to improve your digital skills, study habits and professional development.', '', 'No articles published yet', 'New learning articles from Zentel Insight will appear here.', null, null, 'published', true, 105),
  ('support', 'Student Support', 'Ask for help with your account, classes, timetable, learning materials or other Zentel Insight services.', '', 'No support tickets', 'Support requests you create will appear here with their current status.', 'Create Ticket', '/portal/support', 'published', true, 110),
  ('settings', 'Account Settings', 'Manage your Portal preferences, security options, notifications and active session.', '', 'Settings are ready', 'Use the available controls to manage your Portal experience.', 'Save Preferences', '/portal/settings', 'published', true, 120)
on conflict (page_slug) do update
set
  title = excluded.title,
  description = excluded.description,
  helper_text = excluded.helper_text,
  empty_title = excluded.empty_title,
  empty_message = excluded.empty_message,
  primary_action_label = excluded.primary_action_label,
  primary_action_path = excluded.primary_action_path,
  status = excluded.status,
  published = excluded.published,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.enrolments drop constraint if exists enrolments_status_check;
alter table public.enrolments add constraint enrolments_status_check
  check (status in ('pending', 'paid_unlinked', 'active', 'paused', 'completed', 'cancelled'));

alter table public.timetable_entries add column if not exists delivery_mode text not null default 'online';
alter table public.timetable_entries add column if not exists meeting_provider text;
alter table public.timetable_entries add column if not exists tutor_name text;
alter table public.timetable_entries add column if not exists effective_from date not null default current_date;
alter table public.timetable_entries add column if not exists effective_until date;
alter table public.timetable_entries add column if not exists published boolean not null default true;
alter table public.timetable_entries add column if not exists timezone text not null default 'Africa/Lagos';
alter table public.timetable_entries add column if not exists description text not null default '';

do $$
declare
  missing text;
begin
  with required(slug) as (
    values
      ('graphic-design'),
      ('web-design-and-development'),
      ('data-analysis'),
      ('ui-ux-design'),
      ('video-editing'),
      ('digital-marketing'),
      ('python-programming'),
      ('software-development'),
      ('mobile-app-development'),
      ('cybersecurity-basics'),
      ('business-management'),
      ('virtual-assistance'),
      ('content-creation'),
      ('affiliate-marketing'),
      ('cv-professional-portfolio-development')
  )
  select string_agg(required.slug, ', ')
  into missing
  from required
  left join public.programs on programs.slug = required.slug
  where programs.id is null;

  if missing is not null then
    raise notice 'Missing approved timetable programmes: %', missing;
  end if;
end $$;

with approved_slots(program_slug, day_of_week, start_time, end_time) as (
  values
    ('graphic-design', 1, '17:00'::time, '18:30'::time),
    ('web-design-and-development', 1, '19:00'::time, '20:30'::time),
    ('data-analysis', 2, '17:00'::time, '18:30'::time),
    ('ui-ux-design', 2, '19:00'::time, '20:30'::time),
    ('video-editing', 3, '17:00'::time, '18:30'::time),
    ('digital-marketing', 3, '19:00'::time, '20:30'::time),
    ('python-programming', 4, '17:00'::time, '18:30'::time),
    ('software-development', 4, '19:00'::time, '20:30'::time),
    ('mobile-app-development', 5, '17:00'::time, '18:30'::time),
    ('cybersecurity-basics', 5, '19:00'::time, '20:30'::time),
    ('business-management', 6, '09:00'::time, '10:30'::time),
    ('virtual-assistance', 6, '11:00'::time, '12:30'::time),
    ('content-creation', 6, '14:00'::time, '15:30'::time),
    ('affiliate-marketing', 6, '16:00'::time, '17:30'::time),
    ('cv-professional-portfolio-development', 0, '15:00'::time, '16:30'::time)
)
insert into public.timetable_entries (
  program_id,
  program_level_id,
  title,
  description,
  day_of_week,
  start_time,
  end_time,
  timezone,
  delivery_method,
  delivery_mode,
  meeting_provider,
  meeting_url,
  tutor_name,
  active,
  published,
  effective_from
)
select
  programs.id,
  null,
  programs.title,
  'Weekly online class for ' || programs.title || '.',
  approved_slots.day_of_week,
  approved_slots.start_time,
  approved_slots.end_time,
  'Africa/Lagos',
  'online',
  'online',
  '',
  null,
  null,
  true,
  true,
  current_date
from approved_slots
join public.programs on programs.slug = approved_slots.program_slug
where not exists (
  select 1
  from public.timetable_entries existing
  where existing.program_id = programs.id
    and existing.program_level_id is null
    and existing.day_of_week = approved_slots.day_of_week
    and existing.start_time = approved_slots.start_time
    and existing.class_date is null
);

drop policy if exists "Users can read timetable for active enrolments" on public.timetable_entries;
create policy "Users can read timetable for active enrolments"
  on public.timetable_entries for select
  to authenticated
  using (
    active = true
    and published = true
    and exists (
      select 1 from public.enrolments e
      where e.user_id = (select auth.uid())
        and e.program_id = timetable_entries.program_id
        and e.status = 'active'
        and (
          timetable_entries.program_level_id is null
          or e.program_level_id = timetable_entries.program_level_id
        )
    )
  );

alter table public.announcements add column if not exists category text not null default 'General';
alter table public.announcements add column if not exists audience_type text not null default 'all_students';
alter table public.announcements add column if not exists program_level_id uuid references public.program_levels(id) on delete cascade;
alter table public.announcements add column if not exists published boolean not null default true;
alter table public.announcements add column if not exists expires_at timestamptz;

drop policy if exists "Active announcements are readable by authorized authenticated users" on public.announcements;
create policy "Active announcements are readable by authorized authenticated users"
  on public.announcements for select
  to authenticated
  using (
    active = true
    and published = true
    and (expires_at is null or expires_at > now())
    and (
      program_id is null
      or exists (
        select 1 from public.enrolments e
        where e.user_id = (select auth.uid())
          and e.program_id = announcements.program_id
          and e.status in ('active', 'completed')
          and (
            announcements.program_level_id is null
            or e.program_level_id = announcements.program_level_id
          )
      )
    )
  );

insert into public.announcements (program_id, title, summary, body, priority, category, audience_type, active, published, published_at)
values
  (null, 'Welcome to the Zentel Insight Student Portal', 'Your private learner workspace is ready.', 'Your Student Portal brings your programme information, timetable, announcements, assignments, learning resources and account details together in one secure location. Keep your profile information current and check the Portal regularly for published updates.', 'normal', 'General', 'all_students', true, true, now()),
  (null, 'Keep Your Profile Information Updated', 'Review the details connected to your account.', 'Please review your phone number, education level and address from the Profile page. Accurate information helps Zentel Insight provide class and account support when needed.', 'normal', 'Account', 'all_students', true, true, now()),
  (null, 'Class Links and Timetable Updates', 'Class joining links appear only after approval.', 'Published class times will appear on your Timetable page. A Join Class button will appear only when an approved online meeting link has been added to your class schedule.', 'normal', 'Classes', 'all_students', true, true, now()),
  (null, 'Protect Your Student Account', 'Keep your account access private.', 'Do not share your password or verification links. Always sign out when using a shared device and contact Zentel Insight if you notice unexpected activity on your account.', 'normal', 'Security', 'all_students', true, true, now())
on conflict do nothing;

alter table public.resources add column if not exists program_level_id uuid references public.program_levels(id) on delete cascade;
alter table public.resources add column if not exists module_title text not null default '';
alter table public.resources add column if not exists description text not null default '';
alter table public.resources add column if not exists external_url text;
alter table public.resources add column if not exists storage_path text;
alter table public.resources add column if not exists published boolean not null default true;
alter table public.resources add column if not exists sort_order integer not null default 100;

insert into public.resources (program_id, title, resource_type, url, active, module_title, description, external_url, published, sort_order)
select
  programs.id,
  'Programme Overview',
  'link',
  '/programs/' || programs.slug,
  true,
  'Orientation',
  'Review the official programme overview, learning track information and enrolment details.',
  '/programs/' || programs.slug,
  true,
  10
from public.programs
where programs.active = true
  and not exists (
    select 1 from public.resources existing
    where existing.program_id = programs.id
      and existing.title = 'Programme Overview'
  );

drop policy if exists "Users can read resources for active enrolments" on public.resources;
create policy "Users can read resources for active enrolments"
  on public.resources for select
  to authenticated
  using (
    active = true
    and published = true
    and exists (
      select 1 from public.enrolments e
      where e.user_id = (select auth.uid())
        and e.program_id = resources.program_id
        and e.status = 'active'
        and (
          resources.program_level_id is null
          or e.program_level_id = resources.program_level_id
        )
    )
  );

create table if not exists public.portal_articles (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs(id) on delete cascade,
  program_level_id uuid references public.program_levels(id) on delete cascade,
  title text not null,
  summary text not null default '',
  body text not null default '',
  category text not null default 'Learning',
  external_url text,
  active boolean not null default true,
  published boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portal_articles enable row level security;

drop policy if exists "Users can read accessible published portal articles" on public.portal_articles;
create policy "Users can read accessible published portal articles"
  on public.portal_articles for select
  to authenticated
  using (
    active = true
    and published = true
    and (expires_at is null or expires_at > now())
    and (
      program_id is null
      or exists (
        select 1 from public.enrolments e
        where e.user_id = (select auth.uid())
          and e.program_id = portal_articles.program_id
          and e.status in ('active', 'completed')
          and (
            portal_articles.program_level_id is null
            or e.program_level_id = portal_articles.program_level_id
          )
      )
    )
  );

insert into public.portal_articles (title, summary, body, category, active, published, published_at)
values
  ('How to Get the Best From Your Online Classes', 'Simple habits for preparing before class, staying focused during live sessions and reviewing after each lesson.', 'Prepare your device, internet connection and learning materials before each class. During the session, keep notes and mark questions clearly. After class, review your notes and open any published resources connected to your programme.', 'Study Skills', true, true, now()),
  ('Building a Consistent Practice Routine', 'A practical way to turn your Zentel Insight programme into steady weekly progress.', 'Choose a realistic practice window after every class, keep your project files organized and track small wins each week. Consistency matters more than long irregular study sessions.', 'Learning Habits', true, true, now()),
  ('Protecting Your Digital Learning Account', 'Security reminders for learners using online classes, payments and student portals.', 'Use a private password, avoid sharing verification links and sign out on shared devices. Contact Zentel Insight support if you notice unexpected activity in your account.', 'Security', true, true, now())
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  public = false,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Users can read own profile avatars" on storage.objects;
create policy "Users can read own profile avatars"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can upload own profile avatars" on storage.objects;
create policy "Users can upload own profile avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can update own profile avatars" on storage.objects;
create policy "Users can update own profile avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can delete own profile avatars" on storage.objects;
create policy "Users can delete own profile avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can read own payments" on public.payments;
create policy "Users can read own payments"
  on public.payments for select
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists profiles_id_idx on public.profiles(id);
create index if not exists student_preferences_user_id_idx on public.student_preferences(user_id);
create index if not exists enrolments_user_id_idx on public.enrolments(user_id);
create index if not exists enrolments_program_id_idx on public.enrolments(program_id);
create index if not exists timetable_entries_program_id_idx on public.timetable_entries(program_id);
create index if not exists announcements_program_id_idx on public.announcements(program_id);
create index if not exists resources_program_id_idx on public.resources(program_id);
create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists certificates_user_id_idx on public.certificates(user_id);
create index if not exists portal_notifications_user_id_idx on public.portal_notifications(user_id);
create index if not exists support_tickets_user_id_idx on public.support_tickets(user_id);
create index if not exists portal_articles_program_id_idx on public.portal_articles(program_id);
create index if not exists portal_articles_published_idx on public.portal_articles(published, active, published_at);

drop trigger if exists student_preferences_set_updated_at on public.student_preferences;
create trigger student_preferences_set_updated_at before update on public.student_preferences
  for each row execute procedure public.set_updated_at();

drop trigger if exists portal_articles_set_updated_at on public.portal_articles;
create trigger portal_articles_set_updated_at before update on public.portal_articles
  for each row execute procedure public.set_updated_at();
