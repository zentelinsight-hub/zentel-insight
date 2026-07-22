create or replace function public.clear_current_admin_verification()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if auth.uid() is null then
    return false;
  end if;

  delete from public.admin_session_verifications
  where user_id = auth.uid()
    and session_id = public.current_session_id();

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

grant execute on function public.clear_current_admin_verification() to authenticated;
