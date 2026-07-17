do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can insert own missing profile'
  ) then
    create policy "Users can insert own missing profile"
      on public.profiles for insert
      with check (auth.uid() = id);
  end if;
end;
$$;

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
  on conflict (id) do update
  set
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    date_of_birth = coalesce(public.profiles.date_of_birth, excluded.date_of_birth),
    phone = coalesce(nullif(public.profiles.phone, ''), excluded.phone),
    address = coalesce(nullif(public.profiles.address, ''), excluded.address),
    email = coalesce(nullif(public.profiles.email, ''), excluded.email),
    profile_completed = public.profiles.profile_completed or excluded.profile_completed,
    updated_at = now();
  return new;
end;
$$;
