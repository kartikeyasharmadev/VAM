-- Match visit creation to the same branch-level role checks used by visit RLS.
-- Workspace admins/receptionists and platform admins retain access through
-- has_location_role; branch-assigned admins/receptionists are limited to their
-- assigned location.
create or replace function public.create_visit(
  p_organization_id uuid,
  p_location_id uuid,
  p_visitor_name text,
  p_visitor_email text,
  p_host_name text,
  p_purpose text,
  p_expected_at timestamptz
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_visitor_id uuid;
  v_visit_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if not (select public.has_location_role(
    p_organization_id,
    p_location_id,
    array['admin','receptionist']::text[]
  )) then
    raise exception 'Front desk access is required for this branch';
  end if;
  if length(trim(p_visitor_name)) not between 1 and 120 then raise exception 'Visitor name is required'; end if;
  if length(trim(p_host_name)) not between 1 and 120 then raise exception 'Host name is required'; end if;
  if p_expected_at is null then raise exception 'Arrival time is required'; end if;
  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id and l.organization_id = p_organization_id
  ) then
    raise exception 'Choose a branch in this workspace';
  end if;

  insert into public.visitors(organization_id, full_name, email, created_by)
  values (p_organization_id, trim(p_visitor_name), nullif(trim(p_visitor_email), ''), v_user_id)
  returning id into v_visitor_id;

  insert into public.visits(organization_id, visitor_id, location_id, host_name, purpose, status, expected_at, created_by)
  values (
    p_organization_id,
    v_visitor_id,
    p_location_id,
    trim(p_host_name),
    coalesce(nullif(trim(p_purpose), ''), 'Other'),
    'expected',
    p_expected_at,
    v_user_id
  )
  returning id into v_visit_id;

  return v_visit_id;
end;
$$;

revoke all on function public.create_visit(uuid, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.create_visit(uuid, uuid, text, text, text, text, timestamptz) to authenticated;
