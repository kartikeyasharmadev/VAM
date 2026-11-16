-- Rollback Migration: 20261116000600_platform_branding_and_audit_rollback.sql
-- Description: Revert platform branding table, audit log table, trigger, and brand assets storage bucket.

drop trigger if exists tr_platform_branding_audit on public.platform_branding;
drop function if exists public.log_platform_branding_change();
drop table if exists public.platform_branding_audit cascade;
drop table if exists public.platform_branding cascade;

-- Storage rollback
drop policy if exists "anyone can view platform brand assets" on storage.objects;
drop policy if exists "platform admins can upload brand assets" on storage.objects;
drop policy if exists "platform admins can update brand assets" on storage.objects;
drop policy if exists "platform admins can delete brand assets" on storage.objects;
delete from storage.objects where bucket_id = 'platform-brand-assets';
delete from storage.buckets where id = 'platform-brand-assets';
