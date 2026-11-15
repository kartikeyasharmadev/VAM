-- Subscription state is organization-scoped and only changed by verified Stripe webhooks.
create table public.organization_billing (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_key text not null default 'free' check (plan_key in ('free','team','business')),
  status text not null default 'free' check (status in ('free','incomplete','trialing','active','past_due','canceled','unpaid','paused')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.organization_billing enable row level security;
create policy "workspace admins can read billing" on public.organization_billing
  for select to authenticated using ((select public.has_org_role(organization_id, array['admin']::text[])));
grant select on public.organization_billing to authenticated;
revoke insert, update, delete on public.organization_billing from anon, authenticated;

-- Free supports one branch, 3 users, and 100 visits in each calendar month.
-- Team supports 5 branches and 20 users. Business has no product limits.
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
  v_plan text := 'free';
  v_count integer;
  v_limit integer;
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin()) and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  if p_role not in ('admin','receptionist','member') then raise exception 'Invalid workspace role'; end if;
  select b.plan_key into v_plan from public.organization_billing b
  where b.organization_id = p_organization_id and b.status in ('active','trialing');
  select count(*) into v_count from public.organization_members m where m.organization_id = p_organization_id;
  v_limit := case v_plan when 'team' then 20 when 'business' then 2147483647 else 3 end;
  if v_count >= v_limit then raise exception 'Your current plan has reached its team member limit'; end if;
  select u.id into v_user_id from auth.users u
  where lower(u.email) = lower(trim(p_email)) and u.email_confirmed_at is not null;
  if v_user_id is null then raise exception 'No confirmed EntryFlow account exists for this email yet'; end if;
  insert into public.organization_members(organization_id, user_id, role) values (p_organization_id, v_user_id, p_role);
  return v_user_id;
end;
$$;
revoke all on function public.add_org_member_by_email(uuid, text, text) from public, anon;
grant execute on function public.add_org_member_by_email(uuid, text, text) to authenticated;

create or replace function public.enforce_branch_plan_limit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_plan text := 'free';
  v_count integer;
  v_limit integer;
begin
  select b.plan_key into v_plan from public.organization_billing b
  where b.organization_id = new.organization_id and b.status in ('active','trialing');
  select count(*) into v_count from public.locations l where l.organization_id = new.organization_id;
  v_limit := case v_plan when 'team' then 5 when 'business' then 2147483647 else 1 end;
  if v_count >= v_limit then raise exception 'Your current plan has reached its branch limit'; end if;
  return new;
end;
$$;
create trigger locations_plan_limit before insert on public.locations
  for each row execute function public.enforce_branch_plan_limit();

-- Keep the explicit branch assignment added by the previous migration and enforce free-tier usage.
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
  if not (select public.has_org_role(p_organization_id, array['admin','receptionist']::text[])) then raise exception 'Front desk access is required'; end if;
  if length(trim(p_visitor_name)) not between 1 and 120 then raise exception 'Visitor name is required'; end if;
  if length(trim(p_host_name)) not between 1 and 120 then raise exception 'Host name is required'; end if;
  if p_expected_at is null then raise exception 'Arrival time is required'; end if;
  if not exists (select 1 from public.locations l where l.id = p_location_id and l.organization_id = p_organization_id) then
    raise exception 'Choose a branch in this workspace';
  end if;
  select b.plan_key into v_plan from public.organization_billing b
  where b.organization_id = p_organization_id and b.status in ('active','trialing');
  if v_plan = 'free' then
    select count(*) into v_count from public.visits v
    where v.organization_id = p_organization_id
      and v.created_at >= date_trunc('month', now())
      and v.created_at < date_trunc('month', now()) + interval '1 month';
    if v_count >= 100 then raise exception 'Free plan monthly visit limit reached'; end if;
  end if;
  insert into public.visitors(organization_id, full_name, email, created_by)
    values (p_organization_id, trim(p_visitor_name), nullif(trim(p_visitor_email), ''), v_user_id) returning id into v_visitor_id;
  insert into public.visits(organization_id, visitor_id, location_id, host_name, purpose, status, expected_at, created_by)
    values (p_organization_id, v_visitor_id, p_location_id, trim(p_host_name), coalesce(nullif(trim(p_purpose), ''), 'Other'), 'expected', p_expected_at, v_user_id)
    returning id into v_visit_id;
  return v_visit_id;
end;
$$;
revoke all on function public.create_visit(uuid, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.create_visit(uuid, uuid, text, text, text, text, timestamptz) to authenticated;
