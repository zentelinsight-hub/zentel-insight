-- Give every active programme tier an academy cohort/classroom and expose one
-- transactional admin operation for creating additional chat cohorts.

create or replace function public.admin_save_cohort_with_classroom(
  target_program_id uuid,
  target_track_id uuid,
  next_name text,
  next_code text,
  next_start_date date,
  next_end_date date default null,
  next_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_cohort public.cohorts;
  saved_classroom public.classrooms;
  classroom_code text;
begin
  if not public.is_verified_admin_session() then
    raise exception 'Admin verification is required.';
  end if;

  saved_cohort := public.admin_save_cohort(
    null,
    target_program_id,
    target_track_id,
    next_name,
    next_code,
    next_start_date,
    next_end_date,
    next_status
  );

  classroom_code := left(upper(btrim(next_code)), 52) || '-CLASS';
  saved_classroom := public.admin_save_classroom(
    null,
    saved_cohort.id,
    saved_cohort.name || ' Classroom',
    classroom_code,
    null,
    next_status
  );

  return jsonb_build_object('cohort', to_jsonb(saved_cohort), 'classroom', to_jsonb(saved_classroom));
end;
$$;

revoke all on function public.admin_save_cohort_with_classroom(uuid, uuid, text, text, date, date, text) from public, anon;
grant execute on function public.admin_save_cohort_with_classroom(uuid, uuid, text, text, date, date, text) to authenticated;

do $$
declare
  tier record;
begin
  for tier in
    select level.id, level.program_id
    from public.program_levels level
    join public.programs program on program.id = level.program_id
    where level.active and program.active
  loop
    perform public.ensure_current_classroom(tier.program_id, tier.id);
  end loop;
end;
$$;

create or replace function public.ensure_programme_tier_classroom()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active and exists (select 1 from public.programs where id = new.program_id and active) then
    perform public.ensure_current_classroom(new.program_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists program_levels_ensure_classroom on public.program_levels;
create trigger program_levels_ensure_classroom
after insert or update of active on public.program_levels
for each row execute function public.ensure_programme_tier_classroom();
