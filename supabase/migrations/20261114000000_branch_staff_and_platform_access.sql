-- Staff can be assigned to a subset of branches. Workspace admins and platform
-- super admins retain workspace-wide access; assigned staff stay branch-scoped.
create table public.location_members (
  organization_id uuid not null,
  location_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('admin','receptionist','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, location_id, user_id),
  foreign key (organization_id, location_id) references public.locations(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_members(organization_id, user_id) on delete cascade
);
create index location_members_user_idx on public.location_members(user_id, organization_id, location_id);
alter table public.location_members enable row level security;
grant select, insert, update, delete on public.location_members to authenticated;

create or replace function public.has_location_role(p_organization_id uuid, p_location_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.is_platform_admin())
    or (select public.has_org_role(p_organization_id, p_roles))
    or exists (
      select 1 from public.location_members lm
      where lm.organization_id = p_organization_id and lm.location_id = p_location_id
        and lm.user_id = (select auth.uid()) and lm.role = any(p_roles)
    );
$$;
revoke all on function public.has_location_role(uuid, uuid, text[]) from public, anon;
grant execute on function public.has_location_role(uuid, uuid, text[]) to authenticated;

create or replace function public.can_access_location(p_organization_id uuid, p_location_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.is_platform_admin())
    or (select public.has_org_role(p_organization_id, array['admin','receptionist']::text[]))
    or exists (
      select 1 from public.location_members lm
      where lm.organization_id = p_organization_id and lm.location_id = p_location_id
        and lm.user_id = (select auth.uid())
    );
$$;
revoke all on function public.can_access_location(uuid, uuid) from public, anon;
grant execute on function public.can_access_location(uuid, uuid) to authenticated;

create or replace function public.can_access_visitor(p_organization_id uuid, p_visitor_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.is_platform_admin())
    or (select public.has_org_role(p_organization_id, array['admin']::text[]))
    or exists (
      select 1 from public.visits v
      where v.organization_id = p_organization_id and v.visitor_id = p_visitor_id
        and (select public.has_location_role(v.organization_id, v.location_id, array['admin','receptionist']::text[]))
    );
$$;
revoke all on function public.can_access_visitor(uuid, uuid) from public, anon;
grant execute on function public.can_access_visitor(uuid, uuid) to authenticated;

create or replace function public.set_location_member_role(
  p_organization_id uuid,
  p_location_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin()) and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  if p_role not in ('admin','receptionist','member') then raise exception 'Invalid branch role'; end if;
  if not exists (select 1 from public.locations l where l.organization_id=p_organization_id and l.id=p_location_id) then
    raise exception 'Branch does not belong to this workspace';
  end if;
  if not exists (select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=p_user_id) then
    raise exception 'Add this person to the workspace first';
  end if;
  insert into public.location_members(organization_id,location_id,user_id,role)
  values (p_organization_id,p_location_id,p_user_id,p_role)
  on conflict (organization_id,location_id,user_id) do update set role=excluded.role;
end;
$$;
revoke all on function public.set_location_member_role(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.set_location_member_role(uuid, uuid, uuid, text) to authenticated;

create or replace function public.remove_location_member(p_organization_id uuid, p_location_id uuid, p_user_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin()) and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  delete from public.location_members lm
  where lm.organization_id=p_organization_id and lm.location_id=p_location_id and lm.user_id=p_user_id;
end;
$$;
revoke all on function public.remove_location_member(uuid, uuid, uuid) from public, anon;
grant execute on function public.remove_location_member(uuid, uuid, uuid) to authenticated;

-- Platform super admins can administer every workspace record, including visitor data.
create policy "platform admins can manage workspace records" on public.organizations
  for all to authenticated using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
grant insert, update, delete on public.organizations to authenticated;
create policy "platform admins can manage all memberships" on public.organization_members
  for all to authenticated using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy "platform admins can manage all locations" on public.locations
  for all to authenticated using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy "workspace admins can manage branch assignments" on public.location_members
  for all to authenticated using (
    (select public.is_platform_admin()) or (select public.has_org_role(organization_id,array['admin']::text[]))
  ) with check (
    (select public.is_platform_admin()) or (select public.has_org_role(organization_id,array['admin']::text[]))
  );
create policy "branch members can see their assignments" on public.location_members
  for select to authenticated using (user_id=(select auth.uid()));
create policy "workspace admins can read all assignments" on public.location_members
  for select to authenticated using (
    (select public.is_platform_admin()) or (select public.has_org_role(organization_id,array['admin']::text[]))
  );

drop policy if exists "members can read locations" on public.locations;
create policy "users can read their workspace branches" on public.locations
  for select to authenticated using ((select public.can_access_location(organization_id,id)));

drop policy if exists "front desk can read visitor details" on public.visitors;
drop policy if exists "front desk can add visitors" on public.visitors;
drop policy if exists "front desk can update visitor details" on public.visitors;
drop policy if exists "admins can delete visitor details" on public.visitors;
create policy "users can read visitors in their assigned branches" on public.visitors
  for select to authenticated using ((select public.can_access_visitor(organization_id,id)));
create policy "workspace admins can add visitor rows" on public.visitors
  for insert to authenticated with check (
    created_by=(select auth.uid()) and (
      (select public.is_platform_admin()) or (select public.has_org_role(organization_id,array['admin']::text[]))
    )
  );
create policy "users can update visitors in their assigned branches" on public.visitors
  for update to authenticated using ((select public.can_access_visitor(organization_id,id)))
  with check ((select public.can_access_visitor(organization_id,id)));
create policy "admins can delete visitor rows" on public.visitors
  for delete to authenticated using (
    (select public.is_platform_admin()) or (select public.has_org_role(organization_id,array['admin']::text[]))
  );

drop policy if exists "staff can read visits for their workspace" on public.visits;
drop policy if exists "front desk can create visits" on public.visits;
drop policy if exists "front desk can update visits" on public.visits;
drop policy if exists "admins can delete visits" on public.visits;
create policy "users can read visits in assigned branches" on public.visits
  for select to authenticated using ((select public.has_location_role(organization_id,location_id,array['admin','receptionist']::text[])));
create policy "front desk can create visits in assigned branches" on public.visits
  for insert to authenticated with check (
    created_by=(select auth.uid())
    and (select public.has_location_role(organization_id,location_id,array['admin','receptionist']::text[]))
  );
create policy "front desk can update visits in assigned branches" on public.visits
  for update to authenticated using ((select public.has_location_role(organization_id,location_id,array['admin','receptionist']::text[])))
  with check ((select public.has_location_role(organization_id,location_id,array['admin','receptionist']::text[])));
create policy "admins can delete visits in assigned branches" on public.visits
  for delete to authenticated using ((select public.has_location_role(organization_id,location_id,array['admin']::text[])));

create policy "platform admins can read any billing record" on public.organization_billing
  for select to authenticated using ((select public.is_platform_admin()));

-- A platform administrator or workspace admin can access all branches; branch
-- receptionists/admins can create visits only in their assigned branch.
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
  v_plan text := 'free';
  v_count integer;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if not (select public.has_location_role(p_organization_id,p_location_id,array['admin','receptionist']::text[])) then
    raise exception 'Front desk access is required for this branch';
  end if;
  if length(trim(p_visitor_name)) not between 1 and 120 then raise exception 'Visitor name is required'; end if;
  if length(trim(p_host_name)) not between 1 and 120 then raise exception 'Host name is required'; end if;
  if p_expected_at is null then raise exception 'Arrival time is required'; end if;
  if not exists (select 1 from public.locations l where l.id=p_location_id and l.organization_id=p_organization_id) then
    raise exception 'Choose a branch in this workspace';
  end if;
  select b.plan_key into v_plan from public.organization_billing b
  where b.organization_id=p_organization_id and b.status in ('active','trialing');
  if v_plan='free' then
    select count(*) into v_count from public.visits v where v.organization_id=p_organization_id
      and v.created_at>=date_trunc('month',now()) and v.created_at<date_trunc('month',now())+interval '1 month';
    if v_count>=100 then raise exception 'Free plan monthly visit limit reached'; end if;
  end if;
  insert into public.visitors(organization_id,full_name,email,created_by)
  values (p_organization_id,trim(p_visitor_name),nullif(trim(p_visitor_email),''),v_user_id) returning id into v_visitor_id;
  insert into public.visits(organization_id,visitor_id,location_id,host_name,purpose,status,expected_at,created_by)
  values (p_organization_id,v_visitor_id,p_location_id,trim(p_host_name),coalesce(nullif(trim(p_purpose),''),'Other'),'expected',p_expected_at,v_user_id)
  returning id into v_visit_id;
  return v_visit_id;
end;
$$;
revoke all on function public.create_visit(uuid,uuid,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.create_visit(uuid,uuid,text,text,text,text,timestamptz) to authenticated;
