-- Allow workspace admins (or platform admins) to add an already registered,
-- email-confirmed account without exposing Supabase's service-role key.
create or replace function public.add_org_member_by_email(
  p_organization_id uuid,
  p_email text,
  p_role text default 'member'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin())
     and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  if p_role not in ('admin','receptionist','member') then raise exception 'Invalid workspace role'; end if;
  select u.id into v_user_id from auth.users u
  where lower(u.email) = lower(trim(p_email)) and u.email_confirmed_at is not null;
  if v_user_id is null then raise exception 'No confirmed EntryFlow account exists for this email yet'; end if;
  insert into public.organization_members(organization_id, user_id, role)
  values (p_organization_id, v_user_id, p_role);
  return v_user_id;
end;
$$;
revoke all on function public.add_org_member_by_email(uuid, text, text) from public, anon;
grant execute on function public.add_org_member_by_email(uuid, text, text) to authenticated;

-- Make branch assignment explicit when creating a visit.
drop function public.create_visit(uuid, text, text, text, text, timestamptz);
create function public.create_visit(
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
  if not (select public.has_org_role(p_organization_id, array['admin','receptionist']::text[])) then
    raise exception 'Front desk access is required';
  end if;
  if length(trim(p_visitor_name)) not between 1 and 120 then raise exception 'Visitor name is required'; end if;
  if length(trim(p_host_name)) not between 1 and 120 then raise exception 'Host name is required'; end if;
  if p_expected_at is null then raise exception 'Arrival time is required'; end if;
  if not exists (select 1 from public.locations l where l.id = p_location_id and l.organization_id = p_organization_id) then
    raise exception 'Choose a branch in this workspace';
  end if;

  insert into public.visitors(organization_id, full_name, email, created_by)
  values (p_organization_id, trim(p_visitor_name), nullif(trim(p_visitor_email), ''), v_user_id)
  returning id into v_visitor_id;
  insert into public.visits(organization_id, visitor_id, location_id, host_name, purpose, status, expected_at, created_by)
  values (p_organization_id, v_visitor_id, p_location_id, trim(p_host_name), coalesce(nullif(trim(p_purpose), ''), 'Other'), 'expected', p_expected_at, v_user_id)
  returning id into v_visit_id;
  return v_visit_id;
end;
$$;
revoke all on function public.create_visit(uuid, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.create_visit(uuid, uuid, text, text, text, text, timestamptz) to authenticated;
