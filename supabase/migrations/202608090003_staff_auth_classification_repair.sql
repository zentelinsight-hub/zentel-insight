-- Auth-created Staff accounts must be classified as Staff immediately. This
-- keeps the initial profile, role and permanent Portal ID in agreement.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  completion integer;
  trusted_role text := 'student';
  trusted_status text := 'inactive';
  trusted_reason text := 'New account pending Admin activation';
  trusted_title text := null;
begin
  if coalesce(new.raw_app_meta_data ->> 'zentel_role', '') in ('staff', 'tutor')
    and coalesce(new.raw_app_meta_data ->> 'zentel_provisioned_by', '') = 'admin' then
    trusted_role := new.raw_app_meta_data ->> 'zentel_role';
    trusted_status := 'inactive';
    trusted_reason := case trusted_role
      when 'staff' then 'New Staff account pending Admin activation'
      else 'New tutor account pending Admin activation'
    end;
    trusted_title := case
      when trusted_role = 'tutor' and new.raw_user_meta_data ->> 'title' in ('Mr', 'Mrs')
        then new.raw_user_meta_data ->> 'title'
      when trusted_role = 'tutor' then 'Mr'
      else null
    end;
  elsif lower(coalesce(new.email, '')) = 'zentelinsight@gmail.com' then
    trusted_role := 'admin';
    trusted_status := 'active';
    trusted_reason := 'Admin account exemption';
  end if;

  completion := (
    (case when nullif(new.raw_user_meta_data ->> 'full_name', '') is not null then 1 else 0 end) +
    (case when nullif(new.email, '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'phone', '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'date_of_birth', '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'education_level', '') is not null then 1 else 0 end) +
    (case when nullif(new.raw_user_meta_data ->> 'address', '') is not null then 1 else 0 end)
  ) * 100 / 6;

  insert into public.profiles (
    id, email, full_name, phone, title, date_of_birth, education_level,
    address, profile_completed, profile_completion, account_status,
    status_changed_at, status_reason
  ) values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    trusted_title,
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    coalesce(new.raw_user_meta_data ->> 'education_level', ''),
    coalesce(new.raw_user_meta_data ->> 'address', ''),
    completion >= 80,
    completion,
    trusted_status,
    now(),
    trusted_reason
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      phone = coalesce(nullif(public.profiles.phone, ''), excluded.phone),
      title = coalesce(public.profiles.title, excluded.title),
      date_of_birth = coalesce(public.profiles.date_of_birth, excluded.date_of_birth),
      education_level = coalesce(nullif(public.profiles.education_level, ''), excluded.education_level),
      address = coalesce(nullif(public.profiles.address, ''), excluded.address),
      profile_completion = greatest(public.profiles.profile_completion, excluded.profile_completion),
      updated_at = now();

  insert into public.user_roles (user_id, role)
  values (new.id, trusted_role)
  on conflict (user_id) do update
  set role = case
        when public.user_roles.role = 'admin' then 'admin'
        when excluded.role in ('admin', 'staff', 'tutor') then excluded.role
        else public.user_roles.role
      end,
      updated_at = now();

  return new;
end;
$$;

notify pgrst, 'reload schema';
