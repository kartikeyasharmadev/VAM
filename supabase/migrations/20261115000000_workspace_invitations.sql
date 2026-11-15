-- Workspace invitations reserve a plan seat and become memberships only after
-- the invited person confirms their email address.
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','receptionist','member')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  constraint workspace_invitations_email_normalized check (email = lower(trim(email)))
);
create unique index workspace_invitations_one_pending
  on public.workspace_invitations (organization_id, email) where accepted_at is null;
alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from public, anon, authenticated;

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
  v_plan text := 'free';
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
    where b.organization_id = p_organization_id and b.status in ('active','trialing');
  v_limit := case v_plan when 'team' then 20 when 'business' then 2147483647 else 3 end;
  select count(*) into v_used from public.organization_members m where m.organization_id = p_organization_id;
  v_used := v_used + (select count(*) from public.workspace_invitations i where i.organization_id = p_organization_id and i.accepted_at is null and i.expires_at > now() and i.email <> v_email);
  if v_used >= v_limit then raise exception 'Your current plan has reached its team member limit'; end if;

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
revoke all on function public.create_workspace_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_workspace_invitation(uuid, text, text) to authenticated;

create or replace function public.list_workspace_invitations(p_organization_id uuid)
returns table (id uuid, email text, role text, created_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin()) and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  return query select i.id, i.email, i.role, i.created_at from public.workspace_invitations i
    where i.organization_id = p_organization_id and i.accepted_at is null and i.expires_at > now() order by i.created_at desc;
end;
$$;
revoke all on function public.list_workspace_invitations(uuid) from public, anon;
grant execute on function public.list_workspace_invitations(uuid) to authenticated;

create or replace function public.cancel_workspace_invitation(p_organization_id uuid, p_invitation_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin()) and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  delete from public.workspace_invitations where id = p_invitation_id and organization_id = p_organization_id and accepted_at is null;
end;
$$;
revoke all on function public.cancel_workspace_invitation(uuid, uuid) from public, anon;
grant execute on function public.cancel_workspace_invitation(uuid, uuid) to authenticated;

create or replace function public.accept_workspace_invitations()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_plan text;
  v_limit integer;
  v_used integer;
  v_invitation record;
  v_accepted integer := 0;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user_id and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Confirm your email before accepting workspace invitations'; end if;
  for v_invitation in select i.id, i.organization_id, i.role from public.workspace_invitations i
    where i.email = v_email and i.accepted_at is null and i.expires_at > now() for update
  loop
    perform pg_advisory_xact_lock(hashtext(v_invitation.organization_id::text)::bigint);
    select b.plan_key into v_plan from public.organization_billing b
      where b.organization_id = v_invitation.organization_id and b.status in ('active','trialing');
    v_limit := case v_plan when 'team' then 20 when 'business' then 2147483647 else 3 end;
    select count(*) into v_used from public.organization_members m where m.organization_id = v_invitation.organization_id;
    if v_used >= v_limit then raise exception 'Workspace plan capacity was reached before this invitation was accepted'; end if;
    insert into public.organization_members (organization_id, user_id, role)
      values (v_invitation.organization_id, v_user_id, v_invitation.role)
      on conflict (organization_id, user_id) do nothing;
    update public.workspace_invitations set accepted_at = now() where id = v_invitation.id;
    v_accepted := v_accepted + 1;
  end loop;
  return v_accepted;
end;
$$;
revoke all on function public.accept_workspace_invitations() from public, anon;
grant execute on function public.accept_workspace_invitations() to authenticated;
