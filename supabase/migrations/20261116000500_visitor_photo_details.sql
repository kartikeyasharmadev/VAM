-- Review-only migration for optional visitor details and private live/captured photos.
-- This file has not been applied to any Supabase project.

alter table public.visitors
  add column if not exists phone text,
  add column if not exists photo_path text;

alter table public.visitors
  drop constraint if exists visitors_phone_length_check,
  add constraint visitors_phone_length_check check (
    phone is null or (trim(phone) ~ '^[+0-9(). -]{3,30}$' and length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 3)
  ),
  drop constraint if exists visitors_photo_path_scope_check,
  add constraint visitors_photo_path_scope_check check (
    photo_path is null or photo_path ~ ('^' || organization_id::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visitor-photos', 'visitor-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "workspace members can upload their visitor photos" on storage.objects;
create policy "workspace members can upload their visitor photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'visitor-photos'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and (
      (
        (select public.is_org_member(((storage.foldername(name))[1])::uuid))
        and (
          (select public.has_org_role(((storage.foldername(name))[1])::uuid, array['admin','receptionist']::text[]))
          or not exists (
            select 1 from public.location_members lm
            where lm.organization_id=((storage.foldername(name))[1])::uuid and lm.user_id=(select auth.uid())
          )
          or exists (
            select 1 from public.location_members lm
            where lm.organization_id=((storage.foldername(name))[1])::uuid
              and lm.location_id=((storage.foldername(name))[2])::uuid and lm.user_id=(select auth.uid())
          )
        )
      )
      or (select public.is_platform_admin())
    )
  );

drop policy if exists "workspace staff and photo owner can read visitor photos" on storage.objects;
create policy "workspace staff and photo owner can read visitor photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'visitor-photos'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and (
      (storage.foldername(name))[3] = (select auth.uid())::text
      or (select public.has_location_role(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid, array['admin','receptionist']::text[]))
      or (select public.is_platform_admin())
    )
    and (
      (select public.is_org_member(((storage.foldername(name))[1])::uuid))
      or (select public.is_platform_admin())
    )
  );

drop policy if exists "photo owners and workspace admins can remove visitor photos" on storage.objects;
create policy "photo owners and workspace admins can remove visitor photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'visitor-photos'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and (
      (storage.foldername(name))[3] = (select auth.uid())::text
      or (select public.has_location_role(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid, array['admin']::text[]))
      or (select public.is_platform_admin())
    )
    and (
      (select public.is_org_member(((storage.foldername(name))[1])::uuid))
      or (select public.is_platform_admin())
    )
  );

-- Replace the old RPC signature so seven-argument callers continue to work via
-- defaults, while the updated form can submit company, phone, and photo path.
drop function if exists public.create_visit(uuid,uuid,text,text,text,text,timestamptz);
create function public.create_visit(
  p_organization_id uuid,
  p_location_id uuid,
  p_visitor_name text,
  p_visitor_email text,
  p_host_name text,
  p_purpose text,
  p_expected_at timestamptz,
  p_company_name text default null,
  p_visitor_phone text default null,
  p_photo_path text default null
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
  if p_company_name is not null and length(trim(p_company_name)) > 120 then raise exception 'Company name is too long'; end if;
  if p_visitor_phone is not null and (
    trim(p_visitor_phone) !~ '^[+0-9(). -]{3,30}$' or length(regexp_replace(p_visitor_phone, '[^0-9]', '', 'g')) < 3
  ) then raise exception 'Enter a valid phone number'; end if;
  if p_photo_path is not null then
    if p_photo_path !~ ('^' || p_organization_id::text || '/' || p_location_id::text || '/' || v_user_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
      raise exception 'Visitor photo path is invalid';
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'visitor-photos' and o.name = p_photo_path and o.owner_id = v_user_id::text
    ) then raise exception 'Upload the visitor photo before submitting'; end if;
  end if;
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
  insert into public.visitors(organization_id,full_name,email,company_name,phone,photo_path,created_by)
  values (
    p_organization_id,trim(p_visitor_name),nullif(trim(p_visitor_email),''),
    nullif(trim(p_company_name),''),nullif(trim(p_visitor_phone),''),p_photo_path,v_user_id
  ) returning id into v_visitor_id;
  insert into public.visits(organization_id,visitor_id,location_id,host_name,purpose,status,expected_at,created_by)
  values (p_organization_id,v_visitor_id,p_location_id,trim(p_host_name),coalesce(nullif(trim(p_purpose),''),'Other'),v_status,p_expected_at,v_user_id)
  returning id into v_visit_id;
  return v_visit_id;
end;
$$;
revoke all on function public.create_visit(uuid,uuid,text,text,text,text,timestamptz,text,text,text) from public,anon;
grant execute on function public.create_visit(uuid,uuid,text,text,text,text,timestamptz,text,text,text) to authenticated;

