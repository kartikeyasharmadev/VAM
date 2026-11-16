import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { Brand } from './brand'
import { NotificationBell } from './notification-bell'
import { KioskWakeLock } from './kiosk-wake-lock'
import { ThemeSwitcher } from './theme-switcher'
import { getPlatformBranding } from '@/lib/platform-branding'
import { signOut } from '@/app/actions'
import { createClient } from '@/lib/supabase/server'

type Active = 'dashboard' | 'visitors' | 'branches' | 'staff' | 'branding' | 'billing' | 'notifications' | 'platform' | 'platform-workspaces' | 'platform-billing' | 'platform-plans' | 'platform-branding'
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
    plans: <><path d="M3 7h18M5 3h14M5 21h14M3 17h18"/><rect x="5" y="7" width="14" height="10" rx="2"/><path d="M9 12h6"/></>,
    notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    platform: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    palette: <><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.4-3.4 1.8 1.8 0 0 1 1.3-3.1H19a2 2 0 0 0 2-2 9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="11" cy="6.8" r=".8"/><circle cx="15.5" cy="8" r=".8"/></>,
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export async function AppShell({ active, pageTitle, workspaceId, workspaceName, userEmail, workspaceRole, isPlatformAdmin, canManageFrontDesk, canManageWorkspace, children }: Props) {
  const platformBrand = await getPlatformBranding()
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
  const platformNav = isPlatformAdmin ? [
    { key: 'platform' as const, label: 'Overview', href: '/super-admin', icon: 'platform' },
    { key: 'platform-workspaces' as const, label: 'Workspaces', href: '/super-admin/workspaces', icon: 'branches' },
    { key: 'platform-plans' as const, label: 'Plans', href: '/super-admin/plans', icon: 'plans' },
    { key: 'platform-billing' as const, label: 'Billing & attention', href: '/super-admin/billing', icon: 'billing' },
    { key: 'platform-branding' as const, label: 'Branding', href: '/platform/branding', icon: 'palette' },
  ] : []
  const brandingNav = workspaceAdmin && workspaceId ? [{ key: 'branding' as const, label: 'Branding', href: `/branding${scoped}`, icon: 'platform' }] : []
  return <div className="app-frame" style={brand?.brand_primary_color ? { '--primary': brand.brand_primary_color, '--brand-primary': brand.brand_primary_color } as CSSProperties : undefined}>
    <KioskWakeLock enabled={active === 'dashboard'}/>
    {isPlatformAdmin && workspaceId && (
      <div className="viewing-workspace-banner" role="alert" aria-label="Viewing workspace as platform operator">
        <div className="viewing-workspace-banner-inner">
          <span className="viewing-workspace-banner-text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="banner-warning-icon">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Viewing <strong>{workspaceName ?? 'workspace'}</strong> as a platform operator. Changes you make are real.
          </span>
          <div className="viewing-workspace-banner-links">
            <Link href="/super-admin" className="banner-link">Platform console</Link>
            <Link href="/super-admin" className="banner-link banner-stop-link">Stop viewing</Link>
          </div>
        </div>
      </div>
    )}
    <aside className="sidebar">
      <div className="sidebar-brand"><Brand logoUrl={brand?.brand_logo_url}/></div>
      {workspaceName && <div className="sidebar-workspace"><span>WORKSPACE</span><strong>{workspaceName}</strong><small>Visitor management</small></div>}
      {nav.length > 0 && <><span className="sidebar-label">WORKSPACE</span><nav className="side-nav" aria-label="Workspace navigation">{nav.map(item => <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</nav></>}
      {brandingNav.length > 0 && <nav className="side-nav workspace-branding-nav" aria-label="Workspace settings">{brandingNav.map(item => <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</nav>}
      {platformNav.length > 0 && <><span className="sidebar-label platform-label">PLATFORM</span><nav className="side-nav" aria-label="Platform navigation">{platformNav.map(item => <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</nav></>}
      <div className="sidebar-bottom"><div className="account-chip"><span className="avatar">{(userEmail?.[0] ?? 'G').toUpperCase()}</span><span><strong>{userEmail ?? `${platformBrand.product_name} account`}</strong><small>{isPlatformAdmin ? 'Platform Super Admin' : `Workspace ${workspaceRole ?? 'member'}`}</small></span></div><form action={signOut}><button className="sidebar-signout">Sign out</button></form></div>
    </aside>
    <section className="app-main"><header className="topbar"><div className="topbar-heading"><details className="mobile-nav"><summary aria-label="Open navigation menu"><span className="menu-glyph" aria-hidden="true">☰</span><span className="sr-only">Menu</span></summary><div className="mobile-nav-panel"><Brand logoUrl={brand?.brand_logo_url} />{workspaceName && <div className="mobile-workspace">{workspaceName}</div>}{nav.length > 0 && <><span className="sidebar-label">WORKSPACE</span><nav className="side-nav" aria-label="Workspace navigation">{nav.map(item => <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</nav></>}{brandingNav.length > 0 && <nav className="side-nav" aria-label="Workspace settings">{brandingNav.map(item => <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</nav>}{platformNav.length > 0 && <><span className="sidebar-label platform-label">PLATFORM</span><nav className="side-nav" aria-label="Platform navigation">{platformNav.map(item => <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</nav></>}{userEmail && <div className="mobile-account"><span className="avatar">{userEmail[0].toUpperCase()}</span><span><strong>{userEmail}</strong><small>{isPlatformAdmin ? 'Platform Super Admin' : `Workspace ${workspaceRole ?? 'member'}`}</small></span></div>}<form action={signOut}><button className="sidebar-signout">Sign out</button></form></div></details><div><span className="topbar-kicker">{workspaceName ?? `${platformBrand.product_name.toUpperCase()} PLATFORM`}</span><h1>{pageTitle}</h1></div></div><div className="topbar-right"><ThemeSwitcher/><NotificationBell workspaceId={workspaceId} isPlatformAdmin={Boolean(isPlatformAdmin)}/>{isPlatformAdmin ? <span className="role-pill global-role"><Icon name="platform"/>Platform Super Admin</span> : <span className="role-pill">Workspace {workspaceRole ?? 'member'}</span>}{isPlatformAdmin && workspaceRole && workspaceId && <span className="secondary-role">Workspace access: {workspaceRole}</span>}</div></header><main className="content-area">{children}</main></section>
  </div>
}
