-- Members submit requests; front desk staff approve/reject before check-in.
alter table public.visits drop constraint if exists visits_status_check;
alter table public.visits add constraint visits_status_check
  check (status in ('pending', 'expected', 'inside', 'checked_out', 'cancelled', 'rejected'));

-- Workspace members need branch names to submit a request. Visit rows remain
-- separately protected by the visit and visitor policies below.
create or replace function public.can_access_location(p_organization_id uuid, p_location_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.is_platform_admin())
    or (select public.is_org_member(p_organization_id))
    or exists (
      select 1 from public.location_members lm
      where lm.organization_id = p_organization_id and lm.location_id = p_location_id
        and lm.user_id = (select auth.uid())
    );
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
  v_status text;
  v_has_branch_assignments boolean;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if not (select public.is_org_member(p_organization_id))
     and not (select public.is_platform_admin()) then
    raise exception 'Workspace membership is required';
  end if;
  if length(trim(p_visitor_name)) not between 1 and 120 then raise exception 'Visitor name is required'; end if;
  if length(trim(p_host_name)) not between 1 and 120 then raise exception 'Host name is required'; end if;
  if p_expected_at is null then raise exception 'Arrival time is required'; end if;
  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id and l.organization_id = p_organization_id
  ) then
    raise exception 'Choose a branch in this workspace';
  end if;

  -- Staff explicitly assigned to branches may only request/create visits there.
  select exists (
    select 1 from public.location_members lm
    where lm.organization_id = p_organization_id and lm.user_id = v_user_id
  ) into v_has_branch_assignments;
  if v_has_branch_assignments
     and not (select public.has_org_role(p_organization_id, array['admin','receptionist']::text[]))
     and not exists (
    select 1 from public.location_members lm
    where lm.organization_id = p_organization_id
      and lm.location_id = p_location_id and lm.user_id = v_user_id
  ) and not (select public.is_platform_admin()) then
    raise exception 'You are not assigned to this branch';
  end if;

  if (select public.has_location_role(p_organization_id, p_location_id, array['admin','receptionist']::text[])) then
    v_status := 'expected';
  else
    v_status := 'pending';
  end if;

  insert into public.visitors(organization_id, full_name, email, created_by)
  values (p_organization_id, trim(p_visitor_name), nullif(trim(p_visitor_email), ''), v_user_id)
  returning id into v_visitor_id;

  insert into public.visits(organization_id, visitor_id, location_id, host_name, purpose, status, expected_at, created_by)
  values (p_organization_id, v_visitor_id, p_location_id, trim(p_host_name), coalesce(nullif(trim(p_purpose), ''), 'Other'), v_status, p_expected_at, v_user_id)
  returning id into v_visit_id;
  return v_visit_id;
end;
$$;
revoke all on function public.create_visit(uuid, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.create_visit(uuid, uuid, text, text, text, text, timestamptz) to authenticated;

-- Front desk sees assigned branch activity; requesters can see their own requests.
drop policy if exists "users can read visits in assigned branches" on public.visits;
create policy "front desk and requesters can read visits" on public.visits
  for select to authenticated using (
    created_by = (select auth.uid())
    or (select public.has_location_role(organization_id, location_id, array['admin','receptionist']::text[]))
  );

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
        and (
          v.created_by = (select auth.uid())
          or (select public.has_location_role(v.organization_id, v.location_id, array['admin','receptionist']::text[]))
        )
    );
$$;

-- A visit may only be approved/rejected while pending. RLS still scopes the
-- update to an authorized front desk role in that visit's branch.
drop policy if exists "front desk can update visits in assigned branches" on public.visits;
create policy "front desk can update visits in assigned branches" on public.visits
  for update to authenticated
  using ((select public.has_location_role(organization_id, location_id, array['admin','receptionist']::text[])))
  with check ((select public.has_location_role(organization_id, location_id, array['admin','receptionist']::text[])));

create or replace function public.enforce_visit_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if (select auth.uid()) is null or not (select public.has_location_role(
    old.organization_id, old.location_id, array['admin','receptionist']::text[]
  )) then
    raise exception 'Front desk access is required to change visit status';
  end if;

  if old.status = 'pending' and new.status in ('expected','rejected') then return new; end if;
  if old.status = 'expected' and new.status in ('inside','cancelled') then return new; end if;
  if old.status = 'inside' and new.status = 'checked_out' then return new; end if;
  raise exception 'This visit status transition is not allowed';
end;
$$;
create trigger visits_enforce_status_transition
  before update of status on public.visits
  for each row execute function public.enforce_visit_status_transition();

-- Include request lifecycle events in each recipient's private notification inbox.
alter table public.organization_notifications drop constraint if exists organization_notifications_event_key_check;
alter table public.organization_notifications add constraint organization_notifications_event_key_check
  check (event_key in ('visit_requested','visit_expected','visit_approved','visit_rejected','visit_inside','visit_checked_out'));

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
  v_requester_only boolean := false;
begin
  if tg_op = 'INSERT' then
    v_event := case new.status when 'pending' then 'visit_requested' else 'visit_expected' end;
    v_title := case new.status when 'pending' then 'Visitor request needs review' else 'New visitor expected' end;
  elsif new.status is distinct from old.status and old.status = 'pending' and new.status in ('expected','rejected') then
    v_event := case new.status when 'expected' then 'visit_approved' else 'visit_rejected' end;
    v_title := case new.status when 'expected' then 'Visitor request approved' else 'Visitor request declined' end;
    v_requester_only := true;
  elsif new.status is distinct from old.status and new.status in ('inside','checked_out') then
    v_event := case new.status when 'inside' then 'visit_inside' else 'visit_checked_out' end;
    v_title := case new.status when 'inside' then 'Visitor checked in' else 'Visitor checked out' end;
  else
    return new;
  end if;

  select v.full_name into v_visitor_name from public.visitors v where v.id = new.visitor_id;
  select l.name into v_location_name from public.locations l where l.id = new.location_id;

  if v_requester_only then
    select new.created_by as user_id into v_recipient;
    select coalesce(p.visit_updates, true) into v_enabled
      from (select 1) seed left join public.organization_notification_preferences p
      on p.organization_id = new.organization_id and p.user_id = v_recipient.user_id;
    if v_enabled then
      insert into public.organization_notifications (
        organization_id, recipient_user_id, location_id, entity_id, event_key, title, message
      ) values (
        new.organization_id, v_recipient.user_id, new.location_id, new.id, v_event, v_title,
        coalesce(v_visitor_name, 'A visitor') || case when v_location_name is null then '' else ' · ' || v_location_name end
      ) on conflict (organization_id, recipient_user_id, event_key, entity_id) do nothing;
    end if;
    return new;
  end if;

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
    if v_event in ('visit_requested','visit_expected') then
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
