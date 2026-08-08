-- Extend verified Admin controls to Staff without weakening the Admin account guard.

create or replace function public.admin_set_account_status(target_user_id uuid, next_status text, status_reason text default null)
returns public.profiles language plpgsql security definer set search_path = public
as $$
declare clean_status text := lower(btrim(coalesce(next_status, ''))); target_role text; updated_profile public.profiles;
begin
  if not public.is_verified_admin_session() then raise exception 'Admin security verification is required.'; end if;
  if clean_status not in ('active', 'inactive') then raise exception 'Account status must be active or inactive.'; end if;
  select coalesce((select role from public.user_roles where user_id = target_user_id), 'student') into target_role;
  if target_role = 'admin' then raise exception 'The Admin account cannot be deactivated from the website.'; end if;
  if target_role not in ('student', 'tutor', 'staff') then raise exception 'This account role cannot be changed here.'; end if;
  update public.profiles set account_status = clean_status,
    status_reason = case when clean_status = 'active' then coalesce(nullif(btrim(coalesce($3, '')), ''), 'Activated by Admin after account review') else nullif(btrim(coalesce($3, '')), '') end,
    failed_login_attempts = case when clean_status = 'active' then 0 else failed_login_attempts end,
    last_failed_login_at = case when clean_status = 'active' then null else last_failed_login_at end,
    suspended_at = case when clean_status = 'active' then null else suspended_at end, updated_at = now()
  where id = target_user_id returning * into updated_profile;
  if updated_profile.id is null then raise exception 'Account profile was not found.'; end if;
  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'account_status_changed', 'profiles', target_user_id, jsonb_build_object('role', target_role, 'status', clean_status));
  return updated_profile;
end; $$;

create or replace function public.admin_decide_staff_request(target_request_id uuid, next_status text, response_text text)
returns public.staff_requests language plpgsql security definer set search_path = public
as $$ declare saved public.staff_requests; begin
  if not public.is_verified_admin_session() then raise exception 'Admin security verification is required.'; end if;
  if next_status not in ('approved', 'rejected', 'answered') then raise exception 'Choose an approved request decision.'; end if;
  if char_length(btrim(coalesce(response_text, ''))) < 3 then raise exception 'Enter an Admin response.'; end if;
  update public.staff_requests set status = next_status, admin_response = btrim(response_text), decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where id = target_request_id and status = 'pending' returning * into saved;
  if saved.id is null then raise exception 'This pending Staff request was not found.'; end if;
  insert into public.staff_case_events(case_id, actor_user_id, event_type, permitted_area, metadata)
  values (saved.case_id, auth.uid(), 'admin_request_' || next_status, 'escalations', jsonb_build_object('request_id', saved.id));
  insert into public.portal_notifications(user_id, title, message, notification_type, link_path)
  values (saved.staff_user_id, 'Admin responded to your request', btrim(response_text), 'staff_request_decision', '/staff/requests');
  return saved;
end; $$;

create or replace function public.admin_set_tutor_live_class_enabled(target_tutor_id uuid, enabled boolean)
returns boolean language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_verified_admin_session() then raise exception 'Admin security verification is required.'; end if;
  update public.tutor_profiles set live_class_enabled = enabled, updated_at = now() where user_id = target_tutor_id;
  if not found then raise exception 'Tutor profile was not found.'; end if;
  insert into public.audit_logs(actor_user_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'tutor_live_class_privilege_changed', 'tutor_profiles', target_tutor_id, jsonb_build_object('enabled', enabled));
  return true;
end; $$;

revoke all on function public.admin_decide_staff_request(uuid,text,text), public.admin_set_tutor_live_class_enabled(uuid,boolean) from public;
grant execute on function public.admin_decide_staff_request(uuid,text,text), public.admin_set_tutor_live_class_enabled(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
