-- A unique row per customer, reminder type, billing period, and recipient keeps
-- daily cron retries from sending the same email twice.
create table public.subscription_reminder_deliveries (
  dedupe_key text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('renewal_7d','billing_attention')),
  period_end timestamptz,
  sent_at timestamptz not null default now()
);

alter table public.subscription_reminder_deliveries enable row level security;
revoke all on public.subscription_reminder_deliveries from public, anon, authenticated;
grant select, insert on public.subscription_reminder_deliveries to service_role;
