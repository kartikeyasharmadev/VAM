# Proposed database change — approval required

This is a review proposal only. It has not been added to the applied migration chain and has not been sent to Supabase.

## Platform-wide brand settings

Create one `public.platform_branding` row, readable by signed-in users and writable only by `public.is_platform_admin()`:

```sql
create table public.platform_branding (
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
create policy "signed-in users can read platform branding" on public.platform_branding
  for select to authenticated using (true);
create policy "platform admins can insert platform branding" on public.platform_branding
  for insert to authenticated with check ((select public.is_platform_admin()));
create policy "platform admins can update platform branding" on public.platform_branding
  for update to authenticated using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
insert into public.platform_branding(singleton) values (true) on conflict do nothing;
```

Add a `platform_branding_audit` table with actor, changed field names, before/after JSON, and timestamp. An `AFTER INSERT OR UPDATE` trigger writes audit records in the same transaction as the brand settings update. Only Platform Super Admins may read audit rows; browser clients cannot insert or update them.

Create a public-read `platform-brand-assets` bucket for SVG/PNG brand files (max 1 MB). Only Platform Super Admins may insert, replace, or delete bucket objects. Uploaded names are random UUIDs. SVG files are validated and sanitized by the API before upload. Visitor photos do **not** use this bucket.

## Visitor photo and extra details

The current visitor form already asks for name, optional email, host, branch, purpose, and expected arrival. Company is already a `visitors.company_name` column but is not yet collected by the form. Proposed additions are optional mobile number, company name, and an optional live/captured photo. No government ID number or sensitive identity document is proposed.

Add `visitors.phone` and `visitors.photo_path`. Store photos only in a **private** `visitor-photos` bucket under random paths prefixed by the workspace ID. RLS permits authenticated members of that workspace to read photos and permits visit creators with the existing role rules to upload. Do not publish photo URLs; serve authorized previews through short-lived signed URLs. Add input validation and photo size/type limits, and a consent confirmation before capture. Existing visit approval and check-in states remain unchanged.

The visit-creation RPC currently owns creation of both visitor and visit records. The review-only migration now updates its signature/body to accept company, phone, and the private photo path while retaining its membership, branch, plan-limit, and role checks. Existing visit data remains valid because new columns are nullable.

## Apply only after approval

The platform branding UI/API already targets the proposed table and bucket names. It shows an unconfigured notice and disables save while the table is absent. No SQL has been run. The visitor form now supports optional company/mobile, consent-gated camera capture or photo upload, and shows private photo previews in the staff visitor log. Its RPC call requires the visitor-photo migration to be applied first. The visitor approval, rejection, and check-in states have not changed.
