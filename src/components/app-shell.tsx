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
    platform: <><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>,
    building: <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></>,
    palette: <><circle cx="13.5" cy="6.5" r=".8" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".8" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".8" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".8" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></>,
    arrowLeft: <><path d="m12 19-7-7 7-7M19 12H5"/></>,
    chevron: <><path d="m6 9 6 6 6-6"/></>,
  }
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? paths.dashboard}
    </svg>
  )
}

export async function AppShell({
  active,
  pageTitle,
  workspaceId,
  workspaceName,
  userEmail,
  workspaceRole,
  isPlatformAdmin,
  canManageFrontDesk,
  canManageWorkspace,
  children,
}: Props) {
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

  const nav = workspaceId
    ? [
        { key: 'dashboard' as const, label: 'Dashboard', href: `/${scoped}`, icon: 'dashboard' },
        ...(frontDesk ? [{ key: 'visitors' as const, label: 'Visitor log', href: `/visitors${scoped}`, icon: 'visitors' }] : []),
        { key: 'notifications' as const, label: 'Notifications', href: `/notifications?workspace=${workspaceId}`, icon: 'notifications' },
        ...(workspaceAdmin
          ? [
              { key: 'branches' as const, label: 'Branches', href: `/branches${scoped}`, icon: 'branches' },
              { key: 'staff' as const, label: 'Staff & access', href: `/staff${scoped}`, icon: 'staff' },
              { key: 'billing' as const, label: 'Plan & billing', href: `/billing?workspace=${workspaceId}`, icon: 'billing' },
            ]
          : []),
      ]
    : []

  const brandingNav = workspaceAdmin && workspaceId
    ? [{ key: 'branding' as const, label: 'Branding', href: `/branding${scoped}`, icon: 'palette' }]
    : []

  const platformNav = isPlatformAdmin
    ? [
        { key: 'platform' as const, label: 'Overview', href: '/super-admin', icon: 'platform' },
        { key: 'platform-workspaces' as const, label: 'Workspaces', href: '/super-admin/workspaces', icon: 'building' },
        { key: 'platform-plans' as const, label: 'Plans', href: '/super-admin/plans', icon: 'plans' },
        { key: 'platform-billing' as const, label: 'Billing & attention', href: '/super-admin/billing', icon: 'billing' },
        { key: 'platform-branding' as const, label: 'Platform Branding', href: '/platform/branding', icon: 'palette' },
      ]
    : []

  const isViewingWorkspace = Boolean(isPlatformAdmin && workspaceId)
  const isPlatformActive = active.startsWith('platform')

  return (
    <div
      className="app-shell-root"
      style={{
        '--banner-h': isViewingWorkspace ? '44px' : '0px',
        ...(brand?.brand_primary_color
          ? { '--primary': brand.brand_primary_color, '--brand-primary': brand.brand_primary_color }
          : {}),
      } as CSSProperties}
    >
      <KioskWakeLock enabled={active === 'dashboard'} />

      {/* 1. Full-width slim warning banner: rendered ABOVE app-frame, never inside the 2-column grid */}
      {isViewingWorkspace && (
        <aside className="viewing-workspace-banner" role="status" aria-label="Platform operator warning">
          <div className="viewing-workspace-banner-inner">
            <div className="viewing-workspace-banner-left">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="banner-warning-icon">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="viewing-workspace-banner-text">
                Viewing <strong className="banner-workspace-name">{workspaceName ?? 'workspace'}</strong> as a platform operator. Changes you make are real.
              </span>
            </div>
            <div className="viewing-workspace-banner-links">
              <Link href="/super-admin" className="banner-btn banner-btn-ghost">
                Platform console
              </Link>
              <Link href="/super-admin" className="banner-btn banner-btn-primary">
                Stop viewing
              </Link>
            </div>
          </div>
        </aside>
      )}

      {/* 2. App area: Exactly two columns (sidebar + app-main) */}
      <div className="app-frame">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <Brand logoUrl={brand?.brand_logo_url} />
          </div>

          {workspaceName && (
            <div className="sidebar-workspace">
              <span className="sidebar-workspace-kicker">WORKSPACE</span>
              <strong className="sidebar-workspace-title" title={workspaceName}>{workspaceName}</strong>
              <small className="sidebar-workspace-sub">Visitor management</small>
            </div>
          )}

          {nav.length > 0 && (
            <div className="sidebar-section">
              <span className="sidebar-label">WORKSPACE</span>
              <nav className="side-nav" aria-label="Workspace navigation">
                {nav.map(item => (
                  <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          )}

          {brandingNav.length > 0 && (
            <nav className="side-nav workspace-branding-nav" aria-label="Workspace settings">
              {brandingNav.map(item => (
                <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          )}

          {/* Platform Console Navigation Group */}
          {platformNav.length > 0 && (
            <div className="sidebar-platform-wrapper">
              <Link href="/super-admin" className="sidebar-return-console-btn">
                <Icon name="arrowLeft" />
                <span>Platform console</span>
              </Link>

              <details className="sidebar-platform-accordion" open={isPlatformActive}>
                <summary className="sidebar-platform-summary">
                  <span className="sidebar-label platform-label">OPERATIONS</span>
                  <Icon name="chevron" />
                </summary>
                <nav className="side-nav platform-side-nav" aria-label="Platform navigation">
                  {platformNav.map(item => (
                    <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </nav>
              </details>
            </div>
          )}

          <div className="sidebar-bottom">
            <div className="account-chip">
              <span className="avatar">{(userEmail?.[0] ?? 'G').toUpperCase()}</span>
              <span>
                <strong>{userEmail ?? `${platformBrand.product_name} account`}</strong>
                <small>{isPlatformAdmin ? 'Platform Super Admin' : `Workspace ${workspaceRole ?? 'member'}`}</small>
              </span>
            </div>
            <form action={signOut}>
              <button className="sidebar-signout">Sign out</button>
            </form>
          </div>
        </aside>

        <section className="app-main">
          <header className="topbar">
            <div className="topbar-heading">
              <details className="mobile-nav">
                <summary aria-label="Open navigation menu">
                  <span className="menu-glyph" aria-hidden="true">☰</span>
                  <span className="sr-only">Menu</span>
                </summary>
                <div className="mobile-nav-panel">
                  <Brand logoUrl={brand?.brand_logo_url} />
                  {workspaceName && <div className="mobile-workspace">{workspaceName}</div>}

                  {nav.length > 0 && (
                    <>
                      <span className="sidebar-label">WORKSPACE</span>
                      <nav className="side-nav" aria-label="Workspace navigation">
                        {nav.map(item => (
                          <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}>
                            <Icon name={item.icon} />
                            <span>{item.label}</span>
                          </Link>
                        ))}
                      </nav>
                    </>
                  )}

                  {brandingNav.length > 0 && (
                    <nav className="side-nav" aria-label="Workspace settings">
                      {brandingNav.map(item => (
                        <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}>
                          <Icon name={item.icon} />
                          <span>{item.label}</span>
                        </Link>
                      ))}
                    </nav>
                  )}

                  {platformNav.length > 0 && (
                    <>
                      <span className="sidebar-label platform-label">PLATFORM</span>
                      <nav className="side-nav" aria-label="Platform navigation">
                        {platformNav.map(item => (
                          <Link key={item.key} href={item.href} className={active === item.key ? 'active' : ''}>
                            <Icon name={item.icon} />
                            <span>{item.label}</span>
                          </Link>
                        ))}
                      </nav>
                    </>
                  )}

                  {userEmail && (
                    <div className="mobile-account">
                      <span className="avatar">{userEmail[0].toUpperCase()}</span>
                      <span>
                        <strong>{userEmail}</strong>
                        <small>{isPlatformAdmin ? 'Platform Super Admin' : `Workspace ${workspaceRole ?? 'member'}`}</small>
                      </span>
                    </div>
                  )}
                  <form action={signOut}>
                    <button className="sidebar-signout">Sign out</button>
                  </form>
                </div>
              </details>

              <div>
                <span className="topbar-kicker">{workspaceName ?? `${platformBrand.product_name.toUpperCase()} PLATFORM`}</span>
                <h1>{pageTitle}</h1>
              </div>
            </div>

            <div className="topbar-right">
              <ThemeSwitcher />
              <NotificationBell workspaceId={workspaceId} isPlatformAdmin={Boolean(isPlatformAdmin)} />
              {isPlatformAdmin ? (
                <span className="role-pill global-role">
                  <Icon name="platform" />Platform Super Admin
                </span>
              ) : (
                <span className="role-pill">Workspace {workspaceRole ?? 'member'}</span>
              )}
              {isPlatformAdmin && workspaceRole && workspaceId && (
                <span className="secondary-role">Workspace access: {workspaceRole}</span>
              )}
            </div>
          </header>

          <main className="content-area">
            {children}
          </main>
        </section>
      </div>
    </div>
  )
}
