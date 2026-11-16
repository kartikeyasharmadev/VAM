import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlatformShell } from '@/components/platform-shell'
import { PlatformOverviewCharts } from '@/components/platform-overview-charts'

export default async function SuperAdmin() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/')
  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  if (!isPlatformAdmin) redirect('/')

  const [{ data: organizations }, { data: counts }, { data: billing }] = await Promise.all([
    supabase.from('organizations').select('id, name, slug, industry, created_at').order('created_at', { ascending: false }),
    supabase.from('organization_members').select('organization_id'),
    supabase.from('organization_billing').select('organization_id, plan_key, status'),
  ])

  const orgs = organizations ?? []
  const billingList = billing ?? []
  const activeSubscriptions = billingList.filter(row => ['active', 'trialing'].includes(row.status)).length
  const needsAttention = billingList.filter(row => ['past_due', 'unpaid', 'incomplete'].includes(row.status)).length
  const memberCount = (counts ?? []).length

  return (
    <PlatformShell active="platform" pageTitle="Platform overview" userEmail={String(auth.claims.email ?? '')}>
      <div className="platform-overview-page">
        {/* Page Title & Subtitle */}
        <section className="platform-page-header">
          <div className="platform-page-title-group">
            <span className="eyebrow">PLATFORM OPERATIONS</span>
            <h2>Platform Overview</h2>
            <p className="platform-page-subtitle">Monitor subscriptions, customer workspaces, and platform performance.</p>
          </div>
        </section>

        {/* 4 Neutral Stat Cards */}
        <section className="platform-stats-grid" aria-label="Platform key metrics">
          <article className="platform-stat-card">
            <div className="platform-stat-icon-square" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 21V9h6v12M9 12h6M9 16h6M7 6h.01M17 6h.01" />
              </svg>
            </div>
            <div className="platform-stat-content">
              <span className="platform-stat-label">Workspaces</span>
              <strong className="platform-stat-number">{orgs.length}</strong>
              <small className="platform-stat-helper">Customer organizations</small>
            </div>
          </article>

          <article className="platform-stat-card">
            <div className="platform-stat-icon-square" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="platform-stat-content">
              <span className="platform-stat-label">User memberships</span>
              <strong className="platform-stat-number">{memberCount}</strong>
              <small className="platform-stat-helper">Across all workspaces</small>
            </div>
          </article>

          <article className="platform-stat-card">
            <div className="platform-stat-icon-square" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div className="platform-stat-content">
              <span className="platform-stat-label">Active subscriptions</span>
              <strong className="platform-stat-number">{activeSubscriptions}</strong>
              <small className="platform-stat-helper">Active or trialing</small>
            </div>
          </article>

          <article className="platform-stat-card">
            <div className="platform-stat-icon-square" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="platform-stat-content">
              <span className="platform-stat-label">Needs attention</span>
              <strong className="platform-stat-number">{needsAttention}</strong>
              <small className="platform-stat-helper">Billing follow-up</small>
            </div>
          </article>
        </section>

        {/* Charts: Registrations (Segmented + Line/Area) & Workspace Status (Donut) */}
        <PlatformOverviewCharts
          workspaces={orgs}
          billing={billingList}
          memberCount={memberCount}
        />

        {/* Customer Directory Table */}
        <section className="panel platform-table-panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">CUSTOMER DIRECTORY</span>
              <h2>Recently created</h2>
              <p className="muted">A quick view of the newest customer workspaces.</p>
            </div>
            <Link className="text-link" href="/super-admin/workspaces">
              View all workspaces →
            </Link>
          </div>

          {orgs.length ? (
            <div className="platform-table-wrap">
              <table className="platform-table platform-overview-table">
                <thead>
                  <tr>
                    <th>WORKSPACE</th>
                    <th>PLAN</th>
                    <th>USERS</th>
                    <th>STATUS</th>
                    <th>STARTED</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.slice(0, 5).map(org => {
                    const plan = billingList.find(row => row.organization_id === org.id)
                    const userCount = (counts ?? []).filter(row => row.organization_id === org.id).length
                    const statusClass =
                      plan?.status === 'active' || plan?.status === 'trialing'
                        ? 'status-active'
                        : ['past_due', 'unpaid'].includes(plan?.status ?? '')
                        ? 'status-past_due'
                        : ''

                    return (
                      <tr key={org.id}>
                        <td data-label="Workspace">
                          <strong>{org.name}</strong>
                          <small>/{org.slug} · {org.industry}</small>
                        </td>
                        <td data-label="Plan">
                          <span className="plan-chip">{plan?.plan_key ?? 'starter'}</span>
                        </td>
                        <td data-label="Users">{userCount}</td>
                        <td data-label="Status">
                          <span className={`pill platform-status ${statusClass}`}>
                            {plan?.status ?? 'pending_payment'}
                          </span>
                        </td>
                        <td data-label="Started">
                          {new Date(org.created_at).toLocaleDateString()}
                        </td>
                        <td data-label="Actions">
                          <div className="platform-actions">
                            <Link href={`/?workspace=${org.id}`}>Open</Link>
                            <Link href={`/staff?workspace=${org.id}`}>Manage users</Link>
                            <Link href={`/billing?workspace=${org.id}`}>Billing</Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No customer workspaces yet.</div>
          )}
        </section>

        {/* Platform Access Note */}
        <section className="platform-security">
          <span className="security-icon">✓</span>
          <div>
            <strong>Platform Super Admin access</strong>
            <p>Your platform role is separate from workspace roles and grants access across all customer workspaces. Workspace staff do not receive this access.</p>
          </div>
          <Link href="/super-admin/workspaces">Review workspace roles →</Link>
        </section>

        <p className="footer">
          Platform actions remain subject to Supabase Row Level Security and are scoped to authenticated platform administrators.
        </p>
      </div>
    </PlatformShell>
  )
}
