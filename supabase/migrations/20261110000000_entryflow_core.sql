-- EntryFlow core schema: every customer-owned row carries organization_id.
-- Apply through the Supabase SQL Editor or Supabase CLI before starting the app.
create extension if not exists pgcrypto with schema extensions;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  industry text not null default 'general' check (length(industry) between 2 and 40),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'receptionist', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id, organization_id);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  email text,
  company_name text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index visitors_org_created_idx on public.visitors(organization_id, created_at desc);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  visitor_id uuid not null,
  location_id uuid not null,
  host_user_id uuid references auth.users(id) on delete set null,
  host_name text,
  purpose text not null default 'Other' check (length(purpose) <= 120),
  status text not null default 'expected' check (status in ('expected', 'inside', 'checked_out', 'cancelled')),
  expected_at timestamptz not null,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, visitor_id) references public.visitors(organization_id, id) on delete cascade,
  foreign key (organization_id, location_id) references public.locations(organization_id, id) on delete restrict,
  unique (organization_id, id)
);
create index visits_org_expected_idx on public.visits(organization_id, expected_at desc);
create index visits_org_status_idx on public.visits(organization_id, status);
create index visits_host_idx on public.visits(organization_id, host_user_id, expected_at desc);

-- SECURITY DEFINER helpers avoid recursive RLS checks on organization_members.
-- They return only membership/role booleans and use a fixed empty search_path.
create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.role = any(p_roles)
  );
$$;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, text[]) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;

-- Create the organization and its first admin in one transaction. This prevents
-- a user from claiming admin for a workspace they did not create.
create or replace function public.create_organization(p_name text, p_slug text, p_industry text default 'general')
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

  insert into public.organizations(name, slug, industry)
  values (trim(p_name), p_slug, coalesce(nullif(trim(p_industry), ''), 'general'))
  returning id into v_organization_id;

  insert into public.organization_members(organization_id, user_id, role)
  values (v_organization_id, v_user_id, 'admin');

  insert into public.locations(organization_id, name)
  values (v_organization_id, 'Main location');

  return v_organization_id;
end;
$$;
revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;

-- Atomic visit creation: server actions supply the selected tenant, but this
-- function still checks the caller's role before writing either row.
create or replace function public.create_visit(
  p_organization_id uuid,
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
  v_location_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if not (select public.has_org_role(p_organization_id, array['admin','receptionist']::text[])) then
    raise exception 'Front desk access is required';
  end if;
  if length(trim(p_visitor_name)) not between 1 and 120 then raise exception 'Visitor name is required'; end if;
  if length(trim(p_host_name)) not between 1 and 120 then raise exception 'Host name is required'; end if;
  if p_expected_at is null then raise exception 'Arrival time is required'; end if;

  select l.id into v_location_id from public.locations l
  where l.organization_id = p_organization_id order by l.created_at limit 1;
  if v_location_id is null then raise exception 'Workspace has no active location'; end if;

  insert into public.visitors(organization_id, full_name, email, created_by)
  values (p_organization_id, trim(p_visitor_name), nullif(trim(p_visitor_email), ''), v_user_id)
  returning id into v_visitor_id;

  insert into public.visits(organization_id, visitor_id, location_id, host_name, purpose, status, expected_at, created_by)
  values (p_organization_id, v_visitor_id, v_location_id, trim(p_host_name), coalesce(nullif(trim(p_purpose), ''), 'Other'), 'expected', p_expected_at, v_user_id)
  returning id into v_visit_id;

  return v_visit_id;
end;
$$;
revoke all on function public.create_visit(uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.create_visit(uuid, text, text, text, text, timestamptz) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.locations enable row level security;
alter table public.visitors enable row level security;
alter table public.visits enable row level security;

-- Organization ownership is immutable after insert. This prevents a privileged
-- user who belongs to two tenants from accidentally moving a row across them.
create or replace function public.prevent_organization_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id then
    raise exception 'A record cannot be moved to another organization';
  end if;
  return new;
end;
$$;
create trigger organization_members_tenant_immutable before update of organization_id on public.organization_members
  for each row execute function public.prevent_organization_change();
create trigger locations_tenant_immutable before update of organization_id on public.locations
  for each row execute function public.prevent_organization_change();
create trigger visitors_tenant_immutable before update of organization_id on public.visitors
  for each row execute function public.prevent_organization_change();
create trigger visits_tenant_immutable before update of organization_id on public.visits
  for each row execute function public.prevent_organization_change();

create policy "members can read their organizations" on public.organizations
  for select to authenticated using ((select public.is_org_member(id)));

create policy "members can read their membership list" on public.organization_members
  for select to authenticated using ((select public.is_org_member(organization_id)));
create policy "admins can add organization members" on public.organization_members
  for insert to authenticated with check ((select public.has_org_role(organization_id, array['admin']::text[])));
create policy "admins can change organization member roles" on public.organization_members
  for update to authenticated using ((select public.has_org_role(organization_id, array['admin']::text[])))
  with check ((select public.has_org_role(organization_id, array['admin']::text[])));
create policy "admins can remove organization members" on public.organization_members
  for delete to authenticated using ((select public.has_org_role(organization_id, array['admin']::text[])));

create policy "members can read locations" on public.locations
  for select to authenticated using ((select public.is_org_member(organization_id)));
create policy "admins can create locations" on public.locations
  for insert to authenticated with check ((select public.has_org_role(organization_id, array['admin']::text[])));
create policy "admins can update locations" on public.locations
  for update to authenticated using ((select public.has_org_role(organization_id, array['admin']::text[])))
  with check ((select public.has_org_role(organization_id, array['admin']::text[])));
create policy "admins can delete locations" on public.locations
  for delete to authenticated using ((select public.has_org_role(organization_id, array['admin']::text[])));

create policy "front desk can read visitor details" on public.visitors
  for select to authenticated using ((select public.has_org_role(organization_id, array['admin','receptionist']::text[])));
create policy "front desk can add visitors" on public.visitors
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (select public.has_org_role(organization_id, array['admin','receptionist']::text[]))
  );
create policy "front desk can update visitor details" on public.visitors
  for update to authenticated using ((select public.has_org_role(organization_id, array['admin','receptionist']::text[])))
  with check ((select public.has_org_role(organization_id, array['admin','receptionist']::text[])));
create policy "admins can delete visitor details" on public.visitors
  for delete to authenticated using ((select public.has_org_role(organization_id, array['admin']::text[])));

create policy "staff can read visits for their workspace" on public.visits
  for select to authenticated using (
    (select public.has_org_role(organization_id, array['admin','receptionist']::text[]))
  );
create policy "front desk can create visits" on public.visits
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (select public.has_org_role(organization_id, array['admin','receptionist']::text[]))
  );
create policy "front desk can update visits" on public.visits
  for update to authenticated using ((select public.has_org_role(organization_id, array['admin','receptionist']::text[])))
  with check ((select public.has_org_role(organization_id, array['admin','receptionist']::text[])));
create policy "admins can delete visits" on public.visits
  for delete to authenticated using ((select public.has_org_role(organization_id, array['admin']::text[])));

grant select on public.organizations, public.organization_members, public.locations, public.visitors, public.visits to authenticated;
grant insert, update, delete on public.organization_members, public.locations, public.visitors, public.visits to authenticated;
revoke all on public.organizations from anon, authenticated;
grant select on public.organizations to authenticated;

