-- Migration: 20261116000600_platform_branding_and_audit.sql
-- Description: Platform-wide branding settings, brand assets storage bucket, and transactional audit logging.

-- 1. Create singleton platform_branding table
create table if not exists public.platform_branding (
  singleton boolean primary key default true check (singleton),
  product_name text not null default 'Gatewise' check (length(trim(product_name)) between 1 and 30),
  logo_light_url text,
  logo_dark_url text,
  icon_url text,
  primary_light text not null default '#4338CA' check (primary_light ~ '^#[0-9A-Fa-f]{6}$'),
  primary_dark text not null default '#818CF8' check (primary_dark ~ '^#[0-9A-Fa-f]{6}$'),
  auto_adjust_dark boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_branding enable row level security;

-- Read policy: Any signed-in user can read platform branding
drop policy if exists "signed-in users can read platform branding" on public.platform_branding;
create policy "signed-in users can read platform branding"
  on public.platform_branding
  for select
  to authenticated
  using (true);

-- Write policies: Only Platform Super Admin can insert or update
drop policy if exists "platform admins can insert platform branding" on public.platform_branding;
create policy "platform admins can insert platform branding"
  on public.platform_branding
  for insert
  to authenticated
  with check ((select public.is_platform_admin()));

drop policy if exists "platform admins can update platform branding" on public.platform_branding;
create policy "platform admins can update platform branding"
  on public.platform_branding
  for update
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- Seed the initial singleton row if absent
insert into public.platform_branding (singleton)
values (true)
on conflict do nothing;

-- 2. Create public-read storage bucket for brand assets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'platform-brand-assets',
  'platform-brand-assets',
  true,
  1048576, -- 1 MB
  array['image/png', 'image/svg+xml']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/png', 'image/svg+xml'];

-- Storage Policies
drop policy if exists "anyone can view platform brand assets" on storage.objects;
create policy "anyone can view platform brand assets"
  on storage.objects
  for select
  to public
  using (bucket_id = 'platform-brand-assets');

drop policy if exists "platform admins can upload brand assets" on storage.objects;
create policy "platform admins can upload brand assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'platform-brand-assets'
    and (select public.is_platform_admin())
  );

drop policy if exists "platform admins can update brand assets" on storage.objects;
create policy "platform admins can update brand assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'platform-brand-assets'
    and (select public.is_platform_admin())
  )
  with check (
    bucket_id = 'platform-brand-assets'
    and (select public.is_platform_admin())
  );

drop policy if exists "platform admins can delete brand assets" on storage.objects;
create policy "platform admins can delete brand assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'platform-brand-assets'
    and (select public.is_platform_admin())
  );

-- 3. Create platform_branding_audit table
create table if not exists public.platform_branding_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null, -- 'INSERT' or 'UPDATE'
  changed_fields jsonb not null default '[]'::jsonb,
  old_data jsonb,
  new_data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.platform_branding_audit enable row level security;

-- Read policy: Only Platform Super Admin can inspect audit logs
drop policy if exists "platform admins can view platform branding audit logs" on public.platform_branding_audit;
create policy "platform admins can view platform branding audit logs"
  on public.platform_branding_audit
  for select
  to authenticated
  using ((select public.is_platform_admin()));

-- 4. Transactional Trigger function to write audit records on brand changes
create or replace function public.log_platform_branding_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diff jsonb := '[]'::jsonb;
begin
  if (tg_op = 'UPDATE') then
    if new.product_name is distinct from old.product_name then diff := diff || '["product_name"]'::jsonb; end if;
    if new.logo_light_url is distinct from old.logo_light_url then diff := diff || '["logo_light_url"]'::jsonb; end if;
    if new.logo_dark_url is distinct from old.logo_dark_url then diff := diff || '["logo_dark_url"]'::jsonb; end if;
    if new.icon_url is distinct from old.icon_url then diff := diff || '["icon_url"]'::jsonb; end if;
    if new.primary_light is distinct from old.primary_light then diff := diff || '["primary_light"]'::jsonb; end if;
    if new.primary_dark is distinct from old.primary_dark then diff := diff || '["primary_dark"]'::jsonb; end if;
    if new.auto_adjust_dark is distinct from old.auto_adjust_dark then diff := diff || '["auto_adjust_dark"]'::jsonb; end if;
  end if;

  insert into public.platform_branding_audit (
    actor_id,
    action,
    changed_fields,
    old_data,
    new_data
  ) values (
    coalesce(new.updated_by, (select auth.uid())),
    tg_op,
    case when tg_op = 'INSERT' then '["all"]'::jsonb else diff end,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

drop trigger if exists tr_platform_branding_audit on public.platform_branding;
create trigger tr_platform_branding_audit
  after insert or update on public.platform_branding
  for each row
  execute function public.log_platform_branding_change();
