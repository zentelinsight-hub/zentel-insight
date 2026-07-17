create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  date_of_birth date,
  phone text not null default '',
  address text not null default '',
  email text not null default '',
  profile_completed boolean not null default false,
  profile_edit_used boolean not null default false,
  profile_edit_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile once"
  on public.profiles for update
  using (auth.uid() = id and profile_edit_used = false)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    date_of_birth,
    phone,
    address,
    email,
    profile_completed
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'address', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', '') <> ''
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  short_description text not null default '',
  long_description text not null default '',
  category text not null default 'digital-skills',
  icon_name text not null default 'book-open',
  image_path text,
  active boolean not null default true,
  featured boolean not null default false,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_levels (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  level_name text not null,
  price_kobo integer not null check (price_kobo >= 0),
  duration_text text not null default '',
  level_description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, level_name)
);

alter table public.programs enable row level security;
alter table public.program_levels enable row level security;

create policy "Active programs are public"
  on public.programs for select
  using (active = true);

create policy "Active program levels are public"
  on public.program_levels for select
  using (active = true);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  brand text not null check (brand in ('zentel', 'studyhub')),
  product_type text not null,
  product_id uuid,
  product_key text,
  product_name text not null,
  selected_level text,
  selected_subjects jsonb not null default '[]'::jsonb,
  selected_class text,
  number_of_months integer check (number_of_months is null or number_of_months > 0),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  expected_amount_kobo integer not null check (expected_amount_kobo > 0),
  paid_amount_kobo integer check (paid_amount_kobo is null or paid_amount_kobo >= 0),
  currency text not null default 'NGN',
  status text not null default 'initiated' check (status in ('initiated','pending','success','failed','cancelled','abandoned','reversed')),
  paystack_transaction_id text,
  payment_channel text,
  gateway_response text,
  verification_source text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_reference_idx on public.payments(reference);

alter table public.payments enable row level security;

create policy "Users can read own Zentel payments"
  on public.payments for select
  using (auth.uid() = user_id and brand = 'zentel');

create table if not exists public.enrolments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id),
  program_level_id uuid not null references public.program_levels(id),
  payment_id uuid unique references public.payments(id),
  status text not null default 'pending' check (status in ('pending','active','completed','cancelled')),
  enrolled_date date,
  start_date date,
  completion_date date,
  progress_percentage integer not null default 0 check (progress_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, program_level_id, payment_id)
);

alter table public.enrolments enable row level security;

create policy "Users can read own enrolments"
  on public.enrolments for select
  using (auth.uid() = user_id);

create table if not exists public.studyhub_subjects (
  id uuid primary key default gen_random_uuid(),
  class_group text not null check (class_group in ('JSS','SSS')),
  name text not null,
  active boolean not null default true,
  display_order integer not null default 100,
  unique(class_group, name)
);

alter table public.studyhub_subjects enable row level security;

create policy "Active StudyHub subjects are public"
  on public.studyhub_subjects for select
  using (active = true);

create table if not exists public.studyhub_registrations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid unique references public.payments(id),
  student_name text not null,
  parent_name text not null,
  parent_email text not null,
  parent_phone text not null,
  class_group text not null check (class_group in ('JSS','SSS')),
  selected_subjects jsonb not null default '[]'::jsonb,
  number_of_months integer not null check (number_of_months > 0),
  status text not null default 'pending' check (status in ('pending','active','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studyhub_registrations enable row level security;

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_requests enable row level security;

create policy "Users can create support requests"
  on public.support_requests for insert
  with check (auth.uid() = user_id or user_id is null);

create policy "Users can read own support requests"
  on public.support_requests for select
  using (auth.uid() = user_id);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs(id) on delete cascade,
  title text not null,
  summary text not null default '',
  body text not null default '',
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  active boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create policy "Active announcements are readable by authenticated users"
  on public.announcements for select
  using (auth.role() = 'authenticated' and active = true);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  title text not null,
  resource_type text not null check (resource_type in ('document','link','video','assignment','download')),
  url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resources enable row level security;

create policy "Users can read resources for active enrolments"
  on public.resources for select
  using (
    auth.role() = 'authenticated'
    and active = true
    and exists (
      select 1 from public.enrolments e
      where e.user_id = auth.uid()
        and e.program_id = resources.program_id
        and e.status = 'active'
    )
  );

create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs(id) on delete cascade,
  program_level_id uuid references public.program_levels(id) on delete cascade,
  title text not null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  delivery_method text not null default '',
  meeting_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.timetable_entries enable row level security;

create policy "Users can read timetable for active enrolments"
  on public.timetable_entries for select
  using (
    auth.role() = 'authenticated'
    and active = true
    and exists (
      select 1 from public.enrolments e
      where e.user_id = auth.uid()
        and e.program_id = timetable_entries.program_id
        and e.status = 'active'
    )
  );

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger programs_set_updated_at before update on public.programs
  for each row execute procedure public.set_updated_at();
create trigger program_levels_set_updated_at before update on public.program_levels
  for each row execute procedure public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute procedure public.set_updated_at();
create trigger enrolments_set_updated_at before update on public.enrolments
  for each row execute procedure public.set_updated_at();
create trigger studyhub_registrations_set_updated_at before update on public.studyhub_registrations
  for each row execute procedure public.set_updated_at();
create trigger support_requests_set_updated_at before update on public.support_requests
  for each row execute procedure public.set_updated_at();
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute procedure public.set_updated_at();
create trigger resources_set_updated_at before update on public.resources
  for each row execute procedure public.set_updated_at();
create trigger timetable_entries_set_updated_at before update on public.timetable_entries
  for each row execute procedure public.set_updated_at();
