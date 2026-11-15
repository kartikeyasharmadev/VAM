import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export async function NotificationBell({ workspaceId, isPlatformAdmin = false }: { workspaceId?: string; isPlatformAdmin?: boolean }) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) return null
  let query = supabase.from('organization_notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (workspaceId) query = query.eq('organization_id', workspaceId)
  const [{ count }, { count: platformCount }] = await Promise.all([
    query,
    isPlatformAdmin ? supabase.from('platform_notifications').select('id', { count: 'exact', head: true }).is('read_at', null) : Promise.resolve({ data: null, count: 0 }),
  ])
  const unread = (count ?? 0) + (platformCount ?? 0)
  const href = isPlatformAdmin ? '/notifications' : workspaceId ? `/notifications?workspace=${workspaceId}` : '/notifications'
  return <Link className="header-notification" href={href} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
    {unread > 0 && <span className="header-notification-count">{unread > 99 ? '99+' : unread}</span>}
  </Link>
}
