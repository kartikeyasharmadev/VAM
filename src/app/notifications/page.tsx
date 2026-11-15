import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { markAllNotificationsRead, markNotificationRead, markPlatformNotificationRead } from '../actions'

type Search = Promise<Record<string, string | string[] | undefined>>
type Notification = { id: string; organization_id: string; event_key: string; title: string; message: string; created_at: string; read_at: string | null }
type PlatformNotification = { id: string; organization_id: string; event_key: string; title: string; message: string; created_at: string; read_at: string | null }

export default async function Notifications({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/')
  const [{ data: memberships }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.from('organization_members').select('organization_id, role').eq('user_id', userId).order('created_at'),
    supabase.rpc('is_platform_admin'),
  ])
  const ids = (memberships ?? []).map(item => item.organization_id)
  const selectedId = typeof params.workspace === 'string' ? params.workspace : undefined
  const globalView = !selectedId
  if (selectedId && !ids.includes(selectedId) && !isPlatformAdmin) redirect('/')
  const [orgResult, notificationResult, countResult, platformResult, platformCountResult] = await Promise.all([
    ids.length ? supabase.from('organizations').select('id,name').in('id', ids) : Promise.resolve({ data: [] }),
    (() => { let q = supabase.from('organization_notifications').select('id,organization_id,event_key,title,message,created_at,read_at').order('created_at', { ascending: false }).limit(100); if (selectedId) q = q.eq('organization_id', selectedId); return q })(),
    (() => { let q = supabase.from('organization_notifications').select('id', { count: 'exact', head: true }).is('read_at', null); if (selectedId) q = q.eq('organization_id', selectedId); return q })(),
    isPlatformAdmin && globalView ? supabase.from('platform_notifications').select('id,organization_id,event_key,title,message,created_at,read_at').order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] as PlatformNotification[], error: null }),
    isPlatformAdmin && globalView ? supabase.from('platform_notifications').select('id', { count: 'exact', head: true }).is('read_at', null) : Promise.resolve({ count: 0, error: null }),
  ])
  const workspace = (orgResult.data ?? []).find(item => item.id === selectedId)
  const memberRole = memberships?.find(item => item.organization_id === selectedId)?.role
  const canSeeSelectedWorkspace = Boolean(selectedId && (memberRole || (isPlatformAdmin && ids.includes(selectedId))))
  const canSeeGlobalInbox = ids.length > 0 || Boolean(isPlatformAdmin)
  const available = globalView ? canSeeGlobalInbox : canSeeSelectedWorkspace
  const notifications = notificationResult.data as Notification[] | null
  const organizationNames = new Map((orgResult.data ?? []).map(item => [item.id, item.name]))
  const platformNotifications = (platformResult.data ?? []) as PlatformNotification[]
  const unread = (countResult.count ?? 0) + (platformCountResult.count ?? 0)
  const error = typeof params.error === 'string' ? params.error : ''
  return <AppShell active="notifications" pageTitle="Notifications" workspaceId={selectedId} workspaceName={globalView ? 'All workspaces' : workspace?.name} userEmail={String(auth.claims.email ?? '')} workspaceRole={memberRole} isPlatformAdmin={Boolean(isPlatformAdmin)}>
    <section className="notifications-heading"><div><span className="eyebrow">WORKSPACE ACTIVITY</span><h2>{globalView ? 'Your notifications' : 'Workspace notifications'}</h2><p>{globalView ? isPlatformAdmin ? 'Platform subscription alerts and notifications for your workspaces.' : 'A personal inbox across the workspaces you belong to.' : `Visitor activity for ${workspace?.name ?? 'this workspace'}.`}</p></div><div className="notification-heading-actions"><span className="count-badge">{unread} unread</span>{available && unread > 0 && <form action={markAllNotificationsRead}>{globalView ? <input type="hidden" name="all" value="true"/> : <input type="hidden" name="organization_id" value={selectedId}/>}<button className="action">Mark all read</button></form>}{!globalView && <Link className="button secondary" href={`/settings/notifications?workspace=${selectedId}`}>Preferences</Link>}</div></section>
    {error && <div className="error">Notification action failed. Refresh the page and try again.</div>}
    {!available ? <section className="panel empty">Notifications are private to workspace members. Join a workspace to receive its staff activity notifications.</section> : notificationResult.error || countResult.error ? <div className="notice">Notification storage is not installed yet. Apply the workspace notifications migration from the project README, then refresh.</div> : <>{platformNotifications.length > 0 && <section className="panel notification-list"><h3>Platform subscription activity</h3>{platformNotifications.map(item => <article className={`notification-row ${item.read_at ? '' : 'notification-unread'}`} key={item.id}><span className={`notification-symbol notification-${item.event_key}`}>{item.event_key === 'subscription_attention' ? '!' : '₹'}</span><div className="notification-copy"><div><strong>{item.title}</strong>{!item.read_at && <span className="unread-dot" aria-label="Unread"/>}</div><p>{item.message}</p><small>{organizationNames.get(item.organization_id) ?? 'Customer workspace'} · {new Date(item.created_at).toLocaleString()}</small></div>{!item.read_at && <form action={markPlatformNotificationRead}><input type="hidden" name="notification_id" value={item.id}/><button className="action">Mark read</button></form>}</article>)}</section>}{notifications?.length ? <section className="panel notification-list">{notifications.map(item => <article className={`notification-row ${item.read_at ? '' : 'notification-unread'}`} key={item.id}><span className={`notification-symbol notification-${item.event_key}`}>{['visit_expected','visit_requested'].includes(item.event_key) ? '＋' : item.event_key === 'visit_inside' ? '↗' : item.event_key === 'visit_rejected' ? '×' : item.event_key === 'subscription_attention' ? '!' : '✓'}</span><div className="notification-copy"><div><strong>{item.title}</strong>{!item.read_at && <span className="unread-dot" aria-label="Unread"/>}</div><p>{item.message}</p><small>{organizationNames.get(item.organization_id) ?? workspace?.name ?? 'Workspace'} · {new Date(item.created_at).toLocaleString()}</small></div>{!item.read_at && <form action={markNotificationRead}><input type="hidden" name="organization_id" value={item.organization_id}/><input type="hidden" name="notification_id" value={item.id}/><button className="action">Mark read</button></form>}</article>)}</section> : platformNotifications.length === 0 ? <section className="panel empty notification-empty"><span className="notification-empty-icon">✓</span><strong>You’re all caught up</strong><p>Subscription and visitor activity notifications will appear here.</p></section> : null}</>}
    <p className="footer">Only you can see your notification inbox. Preferences are saved separately for each workspace.</p>
  </AppShell>
}
