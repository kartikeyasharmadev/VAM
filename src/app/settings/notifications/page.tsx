import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { saveNotificationPreferences } from '../../actions'

type Search = Promise<Record<string, string | string[] | undefined>>

export default async function NotificationSettings({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const organizationId = typeof params.workspace === 'string' ? params.workspace : ''
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) redirect('/')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/')
  const [{ data: membership }, { data: organization }, { data: preferences, error: preferencesError }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle(),
    supabase.from('organizations').select('id, name').eq('id', organizationId).maybeSingle(),
    supabase.from('organization_notification_preferences').select('new_visits, visit_updates').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle(),
    supabase.rpc('is_platform_admin'),
  ])
  if (!organization || !membership) redirect('/')
  const error = typeof params.error === 'string' ? params.error : ''
  return <AppShell active="notifications" pageTitle="Notification preferences" workspaceId={organizationId} workspaceName={organization.name} userEmail={String(auth.claims.email ?? '')} workspaceRole={membership.role} isPlatformAdmin={Boolean(isPlatformAdmin)}>
    <section className="notification-settings-hero"><span className="eyebrow">PERSONAL SETTINGS · {organization.name}</span><h2>Choose what reaches you.</h2><p>These preferences apply only to your account in this workspace.</p><Link href={`/notifications?workspace=${organizationId}`}>← Back to notifications</Link></section>
    {params.saved && <div className="notice">Notification preferences saved.</div>}
    {error && <div className="error">Could not save preferences. Please try again.</div>}
    {preferencesError && <div className="notice">Notification preferences are not installed yet. Apply the workspace notifications migration from the project README, then refresh.</div>}
    <form action={saveNotificationPreferences} className="panel notification-preferences"><input type="hidden" name="organization_id" value={organizationId}/>
      <label className="preference-row"><span><strong>New visitor expected</strong><small>Notify me when front desk staff register a new expected visitor.</small></span><input type="checkbox" name="new_visits" defaultChecked={preferences?.new_visits ?? true}/></label>
      <label className="preference-row"><span><strong>Visitor check-in and check-out</strong><small>Notify me when a visitor’s status changes at the front desk.</small></span><input type="checkbox" name="visit_updates" defaultChecked={preferences?.visit_updates ?? true}/></label>
      <div className="notification-channel-note"><strong>In-app notifications are enabled.</strong><p>Email and push delivery are not active yet. They require a verified email delivery or push provider.</p></div>
      <button className="button" disabled={Boolean(preferencesError)}>Save preferences</button>
    </form>
  </AppShell>
}
