-- Workspace creation now requires a selected paid tier. Payment collection is
-- deferred; pending_payment workspaces have immediate access under their tier.
alter table public.organization_billing
  alter column plan_key set default 'starter',
  alter column status set default 'pending_payment';

alter table public.organization_billing
  drop constraint if exists organization_billing_plan_key_check;
alter table public.organization_billing
  drop constraint if exists organization_billing_status_check;

update public.organization_billing
set plan_key = 'starter', status = case when status = 'free' then 'pending_payment' else status end
where plan_key = 'free';

alter table public.organization_billing
  add constraint organization_billing_plan_key_check check (plan_key in ('starter','team','business'));

alter table public.organization_billing
  add constraint organization_billing_status_check
  check (status in ('free','pending_payment','incomplete','trialing','active','past_due','canceled','unpaid','paused'));

create or replace function public.create_organization_with_plan(
  p_name text,
  p_slug text,
  p_industry text,
  p_plan_key text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_organization_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if length(trim(p_name)) not between 2 and 120 then raise exception 'Workspace name must be 2 to 120 characters'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Use a URL slug with lowercase letters, numbers, and hyphens'; end if;
  if p_plan_key is null or p_plan_key not in ('starter','team','business') then raise exception 'Choose a paid plan'; end if;

  insert into public.organizations(name, slug, industry)
  values (trim(p_name), p_slug, coalesce(nullif(trim(p_industry), ''), 'general'))
  returning id into v_organization_id;

  if not (select public.is_platform_admin()) then
    insert into public.organization_members(organization_id, user_id, role)
    values (v_organization_id, v_user_id, 'admin');
  end if;

  insert into public.organization_billing(organization_id, plan_key, status)
  values (v_organization_id, p_plan_key, 'pending_payment');

  insert into public.locations(organization_id, name)
  values (v_organization_id, 'Main location');

  return v_organization_id;
end;
$$;
revoke all on function public.create_organization_with_plan(text,text,text,text) from public, anon;
grant execute on function public.create_organization_with_plan(text,text,text,text) to authenticated;
revoke execute on function public.create_organization(text,text,text) from authenticated;

create or replace function public.set_workspace_plan(p_organization_id uuid, p_plan_key text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin()) then raise exception 'Platform Super Admin access is required'; end if;
  if p_plan_key is null or p_plan_key not in ('starter','team','business') then raise exception 'Choose a valid plan'; end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then raise exception 'Workspace not found'; end if;

  insert into public.organization_billing as current_billing (organization_id, plan_key, status)
  values (p_organization_id, p_plan_key, 'pending_payment')
  on conflict (organization_id) do update
    set plan_key = excluded.plan_key,
        status = case when current_billing.stripe_subscription_id is null then 'pending_payment' else current_billing.status end,
        updated_at = now();
end;
$$;
revoke all on function public.set_workspace_plan(uuid,text) from public, anon;
grant execute on function public.set_workspace_plan(uuid,text) to authenticated;

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
  v_plan text := 'starter';
  v_count integer;
  v_limit integer;
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin()) and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  if p_role not in ('admin','receptionist','member') then raise exception 'Invalid workspace role'; end if;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text)::bigint);
  select b.plan_key into v_plan from public.organization_billing b
  where b.organization_id = p_organization_id and b.status in ('pending_payment','active','trialing');
  select count(*) into v_count from public.organization_members m where m.organization_id = p_organization_id;
  v_limit := case v_plan when 'team' then 20 when 'business' then 2147483647 else 3 end;
  if v_count >= v_limit then raise exception 'Your selected plan has reached its team member limit'; end if;
  select u.id into v_user_id from auth.users u
  where lower(u.email) = lower(trim(p_email)) and u.email_confirmed_at is not null;
  if v_user_id is null then raise exception 'No confirmed EntryFlow account exists for this email yet'; end if;
  insert into public.organization_members(organization_id, user_id, role)
  values (p_organization_id, v_user_id, p_role);
  return v_user_id;
end;
$$;
revoke all on function public.add_org_member_by_email(uuid,text,text) from public, anon;
grant execute on function public.add_org_member_by_email(uuid,text,text) to authenticated;

create or replace function public.create_workspace_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text default 'member'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text := lower(trim(p_email));
  v_plan text := 'starter';
  v_limit integer;
  v_used integer;
  v_invitation_id uuid;
begin
  if v_actor is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin()) and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  if p_role not in ('admin','receptionist','member') then raise exception 'Invalid workspace role'; end if;
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address'; end if;
  if exists (
    select 1 from auth.users u join public.organization_members m on m.user_id = u.id
    where m.organization_id = p_organization_id and lower(u.email) = v_email
  ) then raise exception 'This person is already a workspace member'; end if;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text)::bigint);
  select b.plan_key into v_plan from public.organization_billing b
    where b.organization_id = p_organization_id and b.status in ('pending_payment','active','trialing');
  v_limit := case v_plan when 'team' then 20 when 'business' then 2147483647 else 3 end;
  select count(*) into v_used from public.organization_members m where m.organization_id = p_organization_id;
  v_used := v_used + (select count(*) from public.workspace_invitations i where i.organization_id = p_organization_id and i.accepted_at is null and i.expires_at > now() and i.email <> v_email);
  if v_used >= v_limit then raise exception 'Your selected plan has reached its team member limit'; end if;
  select i.id into v_invitation_id from public.workspace_invitations i
    where i.organization_id = p_organization_id and i.email = v_email and i.accepted_at is null for update;
  if v_invitation_id is null then
    insert into public.workspace_invitations (organization_id, email, role, invited_by)
      values (p_organization_id, v_email, p_role, v_actor) returning id into v_invitation_id;
  else
    update public.workspace_invitations set role = p_role, invited_by = v_actor, created_at = now(), expires_at = now() + interval '7 days'
      where id = v_invitation_id;
  end if;
  return v_invitation_id;
end;
$$;
revoke all on function public.create_workspace_invitation(uuid,text,text) from public, anon;
grant execute on function public.create_workspace_invitation(uuid,text,text) to authenticated;

create or replace function public.enforce_branch_plan_limit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_plan text := 'starter';
  v_count integer;
  v_limit integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.organization_id::text)::bigint);
  select b.plan_key into v_plan from public.organization_billing b
  where b.organization_id = new.organization_id and b.status in ('pending_payment','active','trialing');
  select count(*) into v_count from public.locations l where l.organization_id = new.organization_id;
  v_limit := case v_plan when 'team' then 5 when 'business' then 2147483647 else 1 end;
  if v_count >= v_limit then raise exception 'Your selected plan has reached its branch limit'; end if;
  return new;
end;
$$;

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
  v_plan text := 'starter';
  v_count integer;
  v_status text;
  v_has_branch_assignments boolean;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_org_member(p_organization_id)) and not (select public.is_platform_admin()) then
    raise exception 'Workspace membership is required';
  end if;
  if length(trim(p_visitor_name)) not between 1 and 120 then raise exception 'Visitor name is required'; end if;
  if length(trim(p_host_name)) not between 1 and 120 then raise exception 'Host name is required'; end if;
  if p_expected_at is null then raise exception 'Arrival time is required'; end if;
  if not exists (select 1 from public.locations l where l.id=p_location_id and l.organization_id=p_organization_id) then
    raise exception 'Choose a branch in this workspace';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text)::bigint);
  select exists (
    select 1 from public.location_members lm where lm.organization_id=p_organization_id and lm.user_id=v_user_id
  ) into v_has_branch_assignments;
  if v_has_branch_assignments
    and not (select public.has_org_role(p_organization_id,array['admin','receptionist']::text[]))
    and not exists (
      select 1 from public.location_members lm
      where lm.organization_id=p_organization_id and lm.location_id=p_location_id and lm.user_id=v_user_id
    ) and not (select public.is_platform_admin()) then
    raise exception 'You are not assigned to this branch';
  end if;
  if (select public.has_location_role(p_organization_id,p_location_id,array['admin','receptionist']::text[])) then
    v_status := 'expected';
  else
    v_status := 'pending';
  end if;
  select b.plan_key into v_plan from public.organization_billing b
  where b.organization_id=p_organization_id and b.status in ('pending_payment','active','trialing');
  if v_plan = 'starter' then
    select count(*) into v_count from public.visits v where v.organization_id=p_organization_id
      and v.created_at >= date_trunc('month',now()) and v.created_at < date_trunc('month',now()) + interval '1 month';
    if v_count >= 100 then raise exception 'Starter plan monthly visit limit reached'; end if;
  end if;
  insert into public.visitors(organization_id,full_name,email,created_by)
  values (p_organization_id,trim(p_visitor_name),nullif(trim(p_visitor_email),''),v_user_id) returning id into v_visitor_id;
  insert into public.visits(organization_id,visitor_id,location_id,host_name,purpose,status,expected_at,created_by)
  values (p_organization_id,v_visitor_id,p_location_id,trim(p_host_name),coalesce(nullif(trim(p_purpose),''),'Other'),v_status,p_expected_at,v_user_id)
  returning id into v_visit_id;
  return v_visit_id;
end;
$$;
revoke all on function public.create_visit(uuid,uuid,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.create_visit(uuid,uuid,text,text,text,text,timestamptz) to authenticated;
