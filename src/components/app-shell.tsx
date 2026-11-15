import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { Brand } from './brand'
import { NotificationBell } from './notification-bell'
import { signOut } from '@/app/actions'
import { createClient } from '@/lib/supabase/server'

type Active = 'dashboard' | 'visitors' | 'branches' | 'staff' | 'branding' | 'billing' | 'notifications' | 'platform' | 'platform-workspaces' | 'platform-billing'
type Props = {
  active: Active
  pageTitle: string
  workspaceId?: string
  workspaceName?: string
  userEmail?: string
  workspaceRole?: string
  isPlatformAdmin?: boolean
  canManageFrontDesk?: boolean
  canManageWorkspace?: boolean
  children: ReactNode
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    visitors: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    branches: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V9h6v12M9 12h6M9 16h6M7 6h.01M17 6h.01"/></>,
    staff: <><circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 4.5a4 4 0 0 1 0 7.75M18 15h1a3 3 0 0 1 3 3v3"/></>,
    billing: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>,
    notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    platform: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export async function AppShell({ active, pageTitle, workspaceId, workspaceName, userEmail, workspaceRole, isPlatformAdmin, canManageFrontDesk, canManageWorkspace, children }: Props) {
  let brand: { brand_logo_url: string | null; brand_primary_color: string | null } | null = null
  if (workspaceId) {
    const supabase = await createClient()
    const { data } = await supabase.from('organizations').select('brand_logo_url, brand_primary_color').eq('id', workspaceId).maybeSingle()
    brand = data
  }
  const scoped = workspaceId ? `?workspace=${workspaceId}` : ''
  const workspaceAdmin = canManageWorkspace ?? (workspaceRole === 'admin' || Boolean(isPlatformAdmin))
  const frontDesk = canManageFrontDesk ?? (workspaceAdmin || workspaceRole === 'receptionist')
  const nav = workspaceId ? [
    { key: 'dashboard' as const, label: 'Dashboard', href: `/${scoped}`, icon: 'dashboard' },
    ...(frontDesk ? [{ key: 'visitors' as const, label: 'Visitor log', href: `/visitors${scoped}`, icon: 'visitors' }] : []),
    { key: 'notifications' as const, label: 'Notifications', href: `/notifications?workspace=${workspaceId}`, icon: 'notifications' },
    ...(workspaceAdmin ? [
      { key: 'branches' as const, label: 'Branches', href: `/branches${scoped}`, icon: 'branches' },
      { key: 'staff' as const, label: 'Staff & access', href: `/staff${scoped}`, icon: 'staff' },
      { key: 'billing' as const, label: 'Plan & billing', href: `/billing?workspace=${workspaceId}`, icon: 'billing' },
    ] : []),
  ] : []
  return <div className="app-frame" style={brand?.brand_primary_color ? { '--green': brand.brand_primary_color } as CSSProperties : undefined}>
    <aside className="sidebar">
      <div className="sidebar-brand"><Brand logoUrl={brand?.brand_logo_url} name={workspaceName ?? 'entryflow'}/></div>
      {workspaceName && <div className="sidebar-workspace"><span>WORKSPACE</span><strong>{workspaceName}</strong><small>Visitor management</small></div>}
      {nav.length > 0 && <><span className="sidebar-label">WORKSPACE</span><nav className="side-nav" aria-label="Workspace navigation">{nav.map(item => <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</nav></>}
      {workspaceAdmin && workspaceId && <nav className="side-nav workspace-branding-nav" aria-label="Workspace settings"><Link href={`/branding${scoped}`} className={active === 'branding' ? 'active' : ''}><Icon name="platform"/><span>Branding</span></Link></nav>}
      {isPlatformAdmin && <><span className="sidebar-label platform-label">PLATFORM</span><nav className="side-nav" aria-label="Platform navigation"><Link href="/super-admin" className={active === 'platform' ? 'active' : ''}><Icon name="platform"/><span>Overview</span></Link><Link href="/super-admin/workspaces" className={active === 'platform-workspaces' ? 'active' : ''}><Icon name="branches"/><span>Workspaces</span></Link><Link href="/super-admin/billing" className={active === 'platform-billing' ? 'active' : ''}><Icon name="billing"/><span>Billing & attention</span></Link></nav></>}
      <div className="sidebar-bottom"><div className="account-chip"><span className="avatar">{(userEmail?.[0] ?? 'E').toUpperCase()}</span><span><strong>{userEmail ?? 'EntryFlow account'}</strong><small>{isPlatformAdmin ? 'Platform Super Admin' : `Workspace ${workspaceRole ?? 'member'}`}</small></span></div><form action={signOut}><button className="sidebar-signout">Sign out</button></form></div>
    </aside>
    <section className="app-main"><header className="topbar"><div><span className="topbar-kicker">{workspaceName ?? 'ENTRYFLOW PLATFORM'}</span><h1>{pageTitle}</h1></div><div className="topbar-right"><NotificationBell workspaceId={workspaceId} isPlatformAdmin={Boolean(isPlatformAdmin)}/>{isPlatformAdmin ? <span className="role-pill global-role"><Icon name="platform"/>Platform Super Admin</span> : <span className="role-pill">Workspace {workspaceRole ?? 'member'}</span>}{isPlatformAdmin && workspaceRole && workspaceId && <span className="secondary-role">Workspace access: {workspaceRole}</span>}</div></header><main className="content-area">{children}</main></section>
  </div>
}
