-- Workspace-level identity applies consistently to every branch.
alter table public.organizations
  add column if not exists brand_logo_url text,
  add column if not exists brand_primary_color text not null default '#5c14a3';
alter table public.organizations drop constraint if exists organizations_brand_primary_color_check;
alter table public.organizations add constraint organizations_brand_primary_color_check
  check (brand_primary_color ~ '^#[0-9A-Fa-f]{6}$');

create or replace function public.update_workspace_branding(
  p_organization_id uuid,
  p_logo_url text,
  p_primary_color text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_platform_admin())
     and not (select public.has_org_role(p_organization_id, array['admin']::text[])) then
    raise exception 'Workspace admin access is required';
  end if;
  if p_logo_url is not null and (length(p_logo_url) > 2048 or p_logo_url !~* '^https://') then
    raise exception 'Logo must be a secure HTTPS URL';
  end if;
  if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Choose a valid hex color'; end if;
  update public.organizations
  set brand_logo_url = nullif(trim(p_logo_url), ''), brand_primary_color = p_primary_color
  where id = p_organization_id;
  if not found then raise exception 'Workspace not found'; end if;
end;
$$;
revoke all on function public.update_workspace_branding(uuid,text,text) from public, anon;
grant execute on function public.update_workspace_branding(uuid,text,text) to authenticated;

-- Platform-only inbox for subscription and plan changes across customers.
create table public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_key text not null check (event_key in ('plan_changed','subscription_attention')),
  dedupe_key text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_user_id, dedupe_key)
);
alter table public.platform_notifications enable row level security;
create policy "platform admins read platform notifications" on public.platform_notifications
  for select to authenticated using (recipient_user_id = (select auth.uid()) and (select public.is_platform_admin()));
create policy "platform admins mark their notifications read" on public.platform_notifications
  for update to authenticated using (recipient_user_id = (select auth.uid()) and (select public.is_platform_admin()))
  with check (recipient_user_id = (select auth.uid()) and (select public.is_platform_admin()));
grant select on public.platform_notifications to authenticated;
grant update (read_at) on public.platform_notifications to authenticated;

alter table public.organization_notifications drop constraint if exists organization_notifications_event_key_check;
alter table public.organization_notifications add constraint organization_notifications_event_key_check
  check (event_key in ('visit_requested','visit_expected','visit_approved','visit_rejected','visit_inside','visit_checked_out','subscription_attention'));

create or replace function public.notify_billing_state_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org_name text;
  v_message text;
  v_attention boolean;
  v_plan_changed boolean;
  v_key text;
  v_admin record;
begin
  if tg_op = 'INSERT' then
    v_plan_changed := true;
  else
    v_plan_changed := new.plan_key is distinct from old.plan_key
      or new.status is distinct from old.status
      or new.current_period_end is distinct from old.current_period_end;
  end if;
  v_attention := new.status in ('past_due','unpaid','canceled','paused')
    or (new.plan_key <> 'free' and new.current_period_end is not null and new.current_period_end < now());
  if not v_plan_changed then return new; end if;

  select o.name into v_org_name from public.organizations o where o.id = new.organization_id;
  v_message := coalesce(v_org_name, 'A workspace') || ' · ' || upper(new.plan_key) || ' · ' || new.status
    || case when new.current_period_end is null then '' else ' · period ends ' || to_char(new.current_period_end at time zone 'UTC', 'YYYY-MM-DD') end;
  v_key := new.organization_id::text || ':' || new.plan_key || ':' || new.status || ':' || coalesce(new.current_period_end::text, 'none');

  for v_admin in select p.user_id from public.platform_admins p loop
    insert into public.platform_notifications(recipient_user_id, organization_id, event_key, dedupe_key, title, message)
    values (v_admin.user_id, new.organization_id, case when v_attention then 'subscription_attention' else 'plan_changed' end,
      v_key, case when v_attention then 'Customer subscription needs attention' else 'Customer plan updated' end, v_message)
    on conflict (recipient_user_id, dedupe_key) do nothing;
  end loop;

  if v_attention then
    for v_admin in select m.user_id from public.organization_members m where m.organization_id = new.organization_id and m.role = 'admin' loop
      insert into public.organization_notifications(organization_id, recipient_user_id, entity_id, event_key, title, message)
      values (new.organization_id, v_admin.user_id, new.organization_id, 'subscription_attention',
        'Subscription needs attention', 'Your ' || upper(new.plan_key) || ' plan is ' || new.status
        || case when new.current_period_end is null then '. Review billing to keep your service active.' else ' (period ends ' || to_char(new.current_period_end at time zone 'UTC', 'DD Mon YYYY') || '). Review billing to keep your service active.' end)
      on conflict (organization_id, recipient_user_id, event_key, entity_id) do nothing;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_billing_state_change() from public, anon, authenticated;
create trigger organization_billing_notify_state_change
  after insert or update of plan_key, status, current_period_end on public.organization_billing
  for each row execute function public.notify_billing_state_change();
