import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

type Search = Promise<Record<string, string | string[] | undefined>>

export default async function PlatformBilling({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/')
  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  if (!isPlatformAdmin) redirect('/')
  const [{ data: organizations }, { data: billing }] = await Promise.all([
    supabase.from('organizations').select('id,name,slug').order('name'),
    supabase.from('organization_billing').select('organization_id,plan_key,status,current_period_end,stripe_customer_id'),
  ])
  const rows = (organizations ?? []).map(org => ({ ...org, billing: billing?.find(item => item.organization_id === org.id) }))
  const active = rows.filter(row => ['active','trialing'].includes(row.billing?.status ?? '')).length
  const attention = rows.filter(row => ['past_due','unpaid','incomplete'].includes(row.billing?.status ?? '')).length
  const free = rows.filter(row => (row.billing?.plan_key ?? 'free') === 'free').length
  const q = typeof params.q === 'string' ? params.q.trim().toLowerCase() : ''
  const filtered = rows.filter(row => !q || [row.name,row.slug,row.billing?.plan_key,row.billing?.status].some(value => value?.toLowerCase().includes(q)))
  return <AppShell active="platform-billing" pageTitle="Billing & attention" userEmail={String(auth.claims.email ?? '')} isPlatformAdmin>
    <section className="page-intro platform-page-intro"><div><span className="eyebrow">PLATFORM OPERATIONS</span><h2>Billing & attention</h2><p>Review customer subscription states and open a workspace’s billing page.</p></div></section>
    <section className="metric-grid platform-metrics"><Metric label="Active subscriptions" value={active} detail="Active or trialing" tone="blue"/><Metric label="Needs attention" value={attention} detail="Past due, unpaid, or incomplete" tone="pink"/><Metric label="Workspaces" value={rows.length} detail="All customer accounts" tone="purple"/><Metric label="Free plan" value={free} detail="No paid plan recorded" tone="green"/></section>
    <section className="panel platform-table-panel"><div className="directory-toolbar"><div><strong>Subscription status by workspace</strong><small>Use the workspace billing page for account-level details.</small></div><form method="get" className="directory-search"><input name="q" defaultValue={typeof params.q === 'string' ? params.q : ''} placeholder="Search workspace or status" aria-label="Search subscriptions"/><button className="action">Search</button></form></div><div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>WORKSPACE</th><th>PLAN</th><th>STATUS</th><th>PERIOD END</th><th>ACTIONS</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>/{row.slug}</small></td><td><span className="plan-chip">{row.billing?.plan_key ?? 'free'}</span></td><td><span className={`pill platform-status ${['active','trialing'].includes(row.billing?.status ?? '') ? 'status-active' : ['past_due','unpaid'].includes(row.billing?.status ?? '') ? 'status-past_due' : ''}`}>{row.billing?.status ?? 'free'}</span></td><td>{row.billing?.current_period_end ? new Date(row.billing.current_period_end).toLocaleDateString() : '—'}</td><td><div className="platform-actions"><Link href={`/billing?workspace=${row.id}`}>Open billing</Link><Link href={`/?workspace=${row.id}`}>Open workspace</Link></div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty">{q ? 'No workspace matches your search.' : 'No billing records found.'}</div>}</div></section>
    <p className="footer">Payment changes are completed by workspace admins through Stripe’s billing portal.</p>
  </AppShell>
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) { return <article className={`metric-card metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-dot"/></div><strong>{value}</strong><small>{detail}</small></article> }
