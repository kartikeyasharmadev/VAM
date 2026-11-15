import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'

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
  const activeSubscriptions = (billing ?? []).filter(row => ['active', 'trialing'].includes(row.status)).length
  const needsAttention = (billing ?? []).filter(row => ['past_due', 'unpaid', 'incomplete'].includes(row.status)).length
  const memberCount = (counts ?? []).length
  return <AppShell active="platform" pageTitle="Platform console" userEmail={String(auth.claims.email ?? '')} isPlatformAdmin>
    <div className="platform-console">
      <nav className="platform-tabs" aria-label="Platform console"><Link aria-current="page" href="/super-admin">Overview</Link><Link href="/super-admin/workspaces">Workspaces</Link><Link href="/super-admin/billing">Billing & attention</Link></nav>
      <section className="platform-intro"><span className="eyebrow">ENTRYFLOW · PLATFORM</span><h2>Customer workspaces</h2><p>Monitor subscriptions, users, and access across every customer workspace.</p></section>
      <section className="metric-grid platform-metrics" aria-label="Platform metrics">
        <Metric label="Workspaces" value={orgs.length} detail="Customer organizations" tone="purple"/>
        <Metric label="User memberships" value={memberCount} detail="Across all workspaces" tone="pink"/>
        <Metric label="Active subscriptions" value={activeSubscriptions} detail="Active or trialing" tone="blue"/>
        <Metric label="Needs attention" value={needsAttention} detail="Billing follow-up" tone="green"/>
      </section>
      <section className="panel platform-table-panel"><div className="section-title"><div><span className="eyebrow">CUSTOMER DIRECTORY</span><h2>Recently created</h2><p className="muted">A quick view of the newest customer workspaces.</p></div><Link className="text-link" href="/super-admin/workspaces">View all workspaces →</Link></div>
        {orgs.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>WORKSPACE</th><th>PLAN</th><th>USERS</th><th>STATUS</th><th>STARTED</th><th>ACTIONS</th></tr></thead><tbody>{orgs.slice(0, 5).map(org => { const plan = (billing ?? []).find(row => row.organization_id === org.id); const userCount = (counts ?? []).filter(row => row.organization_id === org.id).length; return <tr key={org.id}><td><strong>{org.name}</strong><small>/{org.slug} · {org.industry}</small></td><td><span className="plan-chip">{plan?.plan_key ?? 'free'}</span></td><td>{userCount}</td><td><span className={`pill platform-status ${plan?.status === 'active' || plan?.status === 'trialing' ? 'status-active' : ['past_due','unpaid'].includes(plan?.status ?? '') ? 'status-past_due' : ''}`}>{plan?.status ?? 'free'}</span></td><td>{new Date(org.created_at).toLocaleDateString()}</td><td><div className="platform-actions"><Link href={`/?workspace=${org.id}`}>Open</Link><Link href={`/staff?workspace=${org.id}`}>Manage users</Link><Link href={`/billing?workspace=${org.id}`}>Billing</Link></div></td></tr>})}</tbody></table></div> : <div className="empty">No customer workspaces yet.</div>}
      </section>
      <section className="platform-security"><span className="security-icon">✓</span><div><strong>Platform Super Admin access</strong><p>Your platform role is separate from workspace roles and grants access across all customer workspaces. Workspace staff do not receive this access.</p></div><Link href="/super-admin/workspaces">Review workspace roles →</Link></section>
      <p className="footer">Platform actions remain subject to Supabase Row Level Security and are scoped to authenticated platform administrators.</p>
    </div>
  </AppShell>
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) { return <article className={`metric-card metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-dot"/></div><strong>{value}</strong><small>{detail}</small></article> }
