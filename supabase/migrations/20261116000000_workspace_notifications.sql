-- Workspace notifications stay private to their recipient; each member controls
-- their personal in-app notification preferences for each workspace.
create table public.organization_notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  new_visits boolean not null default true,
  visit_updates boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.organization_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  entity_id uuid not null,
  event_key text not null check (event_key in ('visit_expected','visit_inside','visit_checked_out')),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (organization_id, recipient_user_id, event_key, entity_id)
);
create index organization_notifications_recipient_recent
  on public.organization_notifications (organization_id, recipient_user_id, created_at desc);

alter table public.organization_notification_preferences enable row level security;
alter table public.organization_notifications enable row level security;

create policy "members read their notification preferences" on public.organization_notification_preferences
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_org_member(organization_id)));
create policy "members create their notification preferences" on public.organization_notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_org_member(organization_id)));
create policy "members update their notification preferences" on public.organization_notification_preferences
  for update to authenticated using (user_id = (select auth.uid()) and (select public.is_org_member(organization_id)))
  with check (user_id = (select auth.uid()) and (select public.is_org_member(organization_id)));
grant select, insert, update on public.organization_notification_preferences to authenticated;
revoke delete on public.organization_notification_preferences from anon, authenticated;

create policy "members read their own notifications" on public.organization_notifications
  for select to authenticated using (recipient_user_id = (select auth.uid()) and (select public.is_org_member(organization_id)));
create policy "members mark their own notifications read" on public.organization_notifications
  for update to authenticated using (recipient_user_id = (select auth.uid()) and (select public.is_org_member(organization_id)))
  with check (recipient_user_id = (select auth.uid()) and (select public.is_org_member(organization_id)));
grant select on public.organization_notifications to authenticated;
grant update (read_at) on public.organization_notifications to authenticated;
revoke insert, delete on public.organization_notifications from anon, authenticated;

create or replace function public.notify_workspace_visit_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_event text;
  v_title text;
  v_visitor_name text;
  v_location_name text;
  v_enabled boolean;
  v_recipient record;
begin
  if tg_op = 'INSERT' then
    v_event := 'visit_expected';
    v_title := 'New visitor expected';
  elsif new.status is distinct from old.status and new.status in ('inside','checked_out') then
    v_event := case new.status when 'inside' then 'visit_inside' else 'visit_checked_out' end;
    v_title := case new.status when 'inside' then 'Visitor checked in' else 'Visitor checked out' end;
  else
    return new;
  end if;

  select v.full_name into v_visitor_name from public.visitors v where v.id = new.visitor_id;
  select l.name into v_location_name from public.locations l where l.id = new.location_id;

  for v_recipient in
    select distinct eligible.user_id from (
      select m.user_id from public.organization_members m
        where m.organization_id = new.organization_id and m.role in ('admin','receptionist')
      union
      select lm.user_id from public.location_members lm
        where lm.organization_id = new.organization_id and lm.location_id = new.location_id and lm.role in ('admin','receptionist')
    ) eligible
    join public.organization_members active_member
      on active_member.organization_id = new.organization_id and active_member.user_id = eligible.user_id
  loop
    if v_event = 'visit_expected' then
      select coalesce(p.new_visits, true) into v_enabled from (select 1) seed
      left join public.organization_notification_preferences p
        on p.organization_id = new.organization_id and p.user_id = v_recipient.user_id;
    else
      select coalesce(p.visit_updates, true) into v_enabled from (select 1) seed
      left join public.organization_notification_preferences p
        on p.organization_id = new.organization_id and p.user_id = v_recipient.user_id;
    end if;
    if v_enabled then
      insert into public.organization_notifications (
        organization_id, recipient_user_id, location_id, entity_id, event_key, title, message
      ) values (
        new.organization_id, v_recipient.user_id, new.location_id, new.id, v_event, v_title,
        coalesce(v_visitor_name, 'A visitor') || case when v_location_name is null then '' else ' · ' || v_location_name end
      ) on conflict (organization_id, recipient_user_id, event_key, entity_id) do nothing;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.notify_workspace_visit_activity() from public, anon, authenticated;
create trigger visits_notify_workspace_activity
  after insert or update of status on public.visits
  for each row execute function public.notify_workspace_visit_activity();
