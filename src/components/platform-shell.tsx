import type { ReactNode } from 'react'
import Link from 'next/link'
import { Brand } from './brand'
import { NotificationBell } from './notification-bell'
import { PlatformProfileMenu } from './platform-profile-menu'

export type PlatformTabKey = 'platform' | 'platform-workspaces' | 'platform-plans' | 'platform-billing' | 'platform-branding'

type Props = {
  active: PlatformTabKey
  pageTitle?: string
  userEmail?: string
  viewingWorkspaceId?: string
  viewingWorkspaceName?: string
  children: ReactNode
}

const tabs: { key: PlatformTabKey; label: string; href: string; icon: ReactNode }[] = [
  {
    key: 'platform',
    label: 'Overview',
    href: '/super-admin',
    icon: (
      <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    key: 'platform-workspaces',
    label: 'Workspaces',
    href: '/super-admin/workspaces',
    icon: (
      <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 21V9h6v12M9 12h6M9 16h6M7 6h.01M17 6h.01" />
      </svg>
    ),
  },
  {
    key: 'platform-plans',
    label: 'Plans',
    href: '/super-admin/plans',
    icon: (
      <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7h18M5 3h14M5 21h14M3 17h18" />
        <rect x="5" y="7" width="14" height="10" rx="2" />
        <path d="M9 12h6" />
      </svg>
    ),
  },
  {
    key: 'platform-billing',
    label: 'Billing & attention',
    href: '/super-admin/billing',
    icon: (
      <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </svg>
    ),
  },
  {
    key: 'platform-branding',
    label: 'Settings',
    href: '/platform/branding',
    icon: (
      <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    ),
  },
]

export function PlatformShell({
  active,
  pageTitle,
  userEmail,
  viewingWorkspaceId,
  viewingWorkspaceName,
  children,
}: Props) {
  return (
    <div className="platform-layout">
      {/* Sticky Two-Row Header */}
      <header className="platform-header" role="banner">
        {/* Row 1: Brand, Divider, Label, Workspace Actions, Bell, Profile Menu */}
        <div className="platform-header-row-1">
          <div className="platform-header-brand-area">
            <div className="platform-brand-full">
              <Brand />
            </div>
            <div className="platform-brand-icon-only">
              <Brand iconOnly />
            </div>
            <span className="platform-header-divider" aria-hidden="true" />
            <span className="platform-header-label">Platform console</span>
          </div>

          <div className="platform-header-actions">
            {viewingWorkspaceId && (
              <div className="platform-viewing-actions" role="group" aria-label="Viewing workspace actions">
                <Link
                  href={`/?workspace=${viewingWorkspaceId}`}
                  className="button platform-open-workspace-btn"
                  title={`Open ${viewingWorkspaceName ?? 'workspace'}`}
                >
                  Open workspace
                </Link>
                <Link
                  href="/super-admin"
                  className="button secondary platform-stop-viewing-btn"
                  title="Stop viewing workspace"
                >
                  Stop viewing
                </Link>
              </div>
            )}

            <div className="platform-header-bell-wrap">
              <NotificationBell isPlatformAdmin />
            </div>

            <PlatformProfileMenu userEmail={userEmail} />
          </div>
        </div>

        {/* Row 2: Horizontal Navigation Tabs */}
        <nav className="platform-header-tabs-nav" aria-label="Platform console navigation">
          <div className="platform-header-tabs-strip">
            {tabs.map(tab => {
              const isActive = active === tab.key
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={`platform-nav-tab ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.icon}
                  <span className="tab-label">{tab.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </header>

      {/* Main Centered Content Container (max 1280px) with proper top padding */}
      <main className="platform-main-container" id="main-content">
        {pageTitle && <h1 className="sr-only">{pageTitle}</h1>}
        {children}
      </main>
    </div>
  )
}
