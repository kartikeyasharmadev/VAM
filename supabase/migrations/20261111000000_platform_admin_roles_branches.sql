-- Platform admins are provisioned manually by the Supabase project owner.
-- This table has no client policies, so users cannot grant themselves access.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins p where p.user_id = (select auth.uid()));
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Return only the current workspace's staff directory to its admins.
create or replace function public.get_org_member_directory(p_organization_id uuid)
returns table(user_id uuid, email text, role text, created_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not (select public.is_platform_admin()) and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
    order by m.created_at;
end;
$$;
revoke all on function public.get_org_member_directory(uuid) from public, anon;
grant execute on function public.get_org_member_directory(uuid) to authenticated;

create policy "platform admins can list workspaces" on public.organizations
  for select to authenticated using ((select public.is_platform_admin()));
create policy "platform admins can list workspace members" on public.organization_members
  for select to authenticated using ((select public.is_platform_admin()));
create policy "platform admins can manage workspace roles" on public.organization_members
  for update to authenticated using ((select public.is_platform_admin()))
  with check (role in ('admin','receptionist','member') and (select public.is_platform_admin()));
create policy "platform admins can list branches" on public.locations
  for select to authenticated using ((select public.is_platform_admin()));
create policy "platform admins can manage branches" on public.locations
  for all to authenticated using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- Stop workspace admins from removing/demoting the final workspace admin.
create or replace function public.protect_last_org_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if not exists (
      select 1 from public.organization_members m
      where m.organization_id = old.organization_id and m.role = 'admin'
        and m.user_id <> old.user_id
    ) then
      raise exception 'A workspace must retain at least one admin';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger protect_last_org_admin before update of role or delete on public.organization_members
  for each row execute function public.protect_last_org_admin();

create or replace function public.protect_last_branch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.locations l
    where l.organization_id = old.organization_id and l.id <> old.id
  ) then
    raise exception 'A workspace must retain at least one branch';
  end if;
  return old;
end;
$$;
create trigger protect_last_branch before delete on public.locations
  for each row execute function public.protect_last_branch();

