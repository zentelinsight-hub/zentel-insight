create extension if not exists "pgcrypto";

create table if not exists public.student_program_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  track_id uuid references public.program_levels(id) on delete set null,
  selection_source text not null default 'self_selected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_program_preferences_selection_source_check
    check (selection_source in ('self_selected'))
);

alter table public.student_program_preferences enable row level security;

drop policy if exists "Users can read own programme preference" on public.student_program_preferences;
create policy "Users can read own programme preference"
  on public.student_program_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own programme preference" on public.student_program_preferences;
create policy "Users can create own programme preference"
  on public.student_program_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own programme preference" on public.student_program_preferences;
create policy "Users can update own programme preference"
  on public.student_program_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists student_program_preferences_user_id_idx
  on public.student_program_preferences(user_id);

create index if not exists student_program_preferences_program_id_idx
  on public.student_program_preferences(program_id);

drop trigger if exists student_program_preferences_set_updated_at on public.student_program_preferences;
create trigger student_program_preferences_set_updated_at before update on public.student_program_preferences
  for each row execute procedure public.set_updated_at();

alter table public.timetable_entries add column if not exists track_id uuid references public.program_levels(id) on delete set null;
alter table public.timetable_entries add column if not exists delivery_mode text not null default 'online';
alter table public.timetable_entries add column if not exists meeting_provider text;
alter table public.timetable_entries add column if not exists tutor_name text;
alter table public.timetable_entries add column if not exists timezone text not null default 'Africa/Lagos';
alter table public.timetable_entries add column if not exists published boolean not null default true;

alter table public.timetable_entries alter column meeting_provider drop not null;
alter table public.timetable_entries alter column meeting_provider drop default;
alter table public.timetable_entries alter column meeting_url drop not null;
alter table public.timetable_entries alter column tutor_name drop not null;

update public.timetable_entries
set track_id = program_level_id
where track_id is null
  and program_level_id is not null;

with approved_slots(program_slug, class_title, day_of_week, start_time, end_time) as (
  values
    ('graphic-design', 'Graphic Design', 1, '17:00'::time, '18:30'::time),
    ('web-design-and-development', 'Web Design and Development', 1, '19:00'::time, '20:30'::time),
    ('data-analysis', 'Data Analysis', 2, '17:00'::time, '18:30'::time),
    ('ui-ux-design', 'UI/UX Design', 2, '19:00'::time, '20:30'::time),
    ('video-editing', 'Video Editing', 3, '17:00'::time, '18:30'::time),
    ('digital-marketing', 'Digital Marketing', 3, '19:00'::time, '20:30'::time),
    ('python-programming', 'Python Programming', 4, '17:00'::time, '18:30'::time),
    ('software-development', 'Software Development', 4, '19:00'::time, '20:30'::time),
    ('mobile-app-development', 'Mobile App Development', 5, '17:00'::time, '18:30'::time),
    ('cybersecurity-basics', 'Cybersecurity', 5, '19:00'::time, '20:30'::time),
    ('business-management', 'Business Management', 6, '09:00'::time, '10:30'::time),
    ('virtual-assistance', 'Virtual Assistance', 6, '11:00'::time, '12:30'::time),
    ('content-creation', 'Content Creation', 6, '14:00'::time, '15:30'::time),
    ('affiliate-marketing', 'Affiliate Marketing', 6, '16:00'::time, '17:30'::time),
    ('cv-professional-portfolio-development', 'CV and Professional Portfolio Development', 0, '15:00'::time, '16:30'::time)
)
update public.timetable_entries existing
set
  title = approved_slots.class_title,
  timezone = 'Africa/Lagos',
  delivery_method = 'online',
  delivery_mode = 'online',
  active = true,
  published = true,
  description = case
    when existing.description = 'Weekly online class for ' || programs.title || '.'
      then ''
    else existing.description
  end,
  meeting_provider = nullif(existing.meeting_provider, ''),
  meeting_url = nullif(existing.meeting_url, ''),
  tutor_name = nullif(existing.tutor_name, ''),
  updated_at = now()
from approved_slots
join public.programs on programs.slug = approved_slots.program_slug
where existing.program_id = programs.id
  and existing.day_of_week = approved_slots.day_of_week
  and existing.start_time = approved_slots.start_time
  and existing.class_date is null
  and coalesce(existing.program_level_id, existing.track_id) is null;

with approved_slots(program_slug, class_title, day_of_week, start_time, end_time) as (
  values
    ('graphic-design', 'Graphic Design', 1, '17:00'::time, '18:30'::time),
    ('web-design-and-development', 'Web Design and Development', 1, '19:00'::time, '20:30'::time),
    ('data-analysis', 'Data Analysis', 2, '17:00'::time, '18:30'::time),
    ('ui-ux-design', 'UI/UX Design', 2, '19:00'::time, '20:30'::time),
    ('video-editing', 'Video Editing', 3, '17:00'::time, '18:30'::time),
    ('digital-marketing', 'Digital Marketing', 3, '19:00'::time, '20:30'::time),
    ('python-programming', 'Python Programming', 4, '17:00'::time, '18:30'::time),
    ('software-development', 'Software Development', 4, '19:00'::time, '20:30'::time),
    ('mobile-app-development', 'Mobile App Development', 5, '17:00'::time, '18:30'::time),
    ('cybersecurity-basics', 'Cybersecurity', 5, '19:00'::time, '20:30'::time),
    ('business-management', 'Business Management', 6, '09:00'::time, '10:30'::time),
    ('virtual-assistance', 'Virtual Assistance', 6, '11:00'::time, '12:30'::time),
    ('content-creation', 'Content Creation', 6, '14:00'::time, '15:30'::time),
    ('affiliate-marketing', 'Affiliate Marketing', 6, '16:00'::time, '17:30'::time),
    ('cv-professional-portfolio-development', 'CV and Professional Portfolio Development', 0, '15:00'::time, '16:30'::time)
)
insert into public.timetable_entries (
  program_id,
  program_level_id,
  track_id,
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
  published
)
select
  programs.id,
  null,
  null,
  approved_slots.class_title,
  '',
  approved_slots.day_of_week,
  approved_slots.start_time,
  approved_slots.end_time,
  'Africa/Lagos',
  'online',
  'online',
  null,
  null,
  null,
  true,
  true
from approved_slots
join public.programs on programs.slug = approved_slots.program_slug
where not exists (
  select 1
  from public.timetable_entries existing
  where existing.program_id = programs.id
    and existing.day_of_week = approved_slots.day_of_week
    and existing.start_time = approved_slots.start_time
    and existing.class_date is null
    and coalesce(existing.program_level_id, existing.track_id) is null
);

drop policy if exists "Users can read timetable for active enrolments" on public.timetable_entries;
drop policy if exists "Users can read timetable for resolved programme" on public.timetable_entries;
create policy "Users can read timetable for resolved programme"
  on public.timetable_entries for select
  to authenticated
  using (
    active = true
    and published = true
    and (
      exists (
        select 1
        from public.enrolments e
        where e.user_id = (select auth.uid())
          and e.program_id = timetable_entries.program_id
          and e.status = 'active'
          and (
            coalesce(timetable_entries.track_id, timetable_entries.program_level_id) is null
            or e.program_level_id = coalesce(timetable_entries.track_id, timetable_entries.program_level_id)
          )
      )
      or (
        not exists (
          select 1
          from public.enrolments active_e
          where active_e.user_id = (select auth.uid())
            and active_e.status = 'active'
        )
        and exists (
          select 1
          from public.student_program_preferences spp
          where spp.user_id = (select auth.uid())
            and spp.program_id = timetable_entries.program_id
            and (
              coalesce(timetable_entries.track_id, timetable_entries.program_level_id) is null
              or (
                spp.track_id is not null
                and spp.track_id = coalesce(timetable_entries.track_id, timetable_entries.program_level_id)
              )
            )
        )
      )
    )
  );

create index if not exists timetable_entries_program_day_start_idx
  on public.timetable_entries(program_id, day_of_week, start_time)
  where active = true and published = true;
