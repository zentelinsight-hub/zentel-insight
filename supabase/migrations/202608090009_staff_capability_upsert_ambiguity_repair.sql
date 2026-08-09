-- The deployed Phase 5 function reached capability provisioning after the
-- Portal-ID repair and exposed a PL/pgSQL parameter/column ambiguity. Reference
-- the existing composite primary key by constraint name so the upsert is exact.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(procedure_record.oid)
  into function_definition
  from pg_proc procedure_record
  join pg_namespace namespace_record
    on namespace_record.oid = procedure_record.pronamespace
  where namespace_record.nspname = 'public'
    and procedure_record.proname = 'provision_staff_account'
    and pg_get_function_identity_arguments(procedure_record.oid) =
      'staff_user_id uuid, admin_user_id uuid, staff_full_name text, staff_email text, staff_phone text, staff_job_title text, staff_department text';

  if function_definition is null then
    raise exception 'The Staff provisioning function was not found.';
  end if;

  function_definition := replace(
    function_definition,
    'on conflict (staff_user_id, capability) do update set',
    'on conflict on constraint staff_capabilities_pkey do update set'
  );
  execute function_definition;
end;
$$;

revoke all on function public.provision_staff_account(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_staff_account(uuid, uuid, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
