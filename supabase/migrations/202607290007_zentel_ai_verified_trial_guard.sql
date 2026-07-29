create or replace function public.require_verified_ai_trial_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from auth.users
    where id = new.user_id
      and email_confirmed_at is not null
  ) then
    raise exception 'A verified Student email is required to activate the Zentel AI trial.';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_trial_claims_require_verified_user on public.ai_trial_claims;
create trigger ai_trial_claims_require_verified_user
  before insert on public.ai_trial_claims
  for each row execute procedure public.require_verified_ai_trial_user();

revoke all on function public.require_verified_ai_trial_user() from public;

notify pgrst, 'reload schema';
