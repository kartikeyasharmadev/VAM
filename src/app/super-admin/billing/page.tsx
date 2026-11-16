import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlatformShell } from '@/components/platform-shell'
import { createClient } from '@/lib/supabase/server'
import { setWorkspacePlan } from '@/app/actions'
import { StatCard } from '@/components/ui'

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
  const awaitingPayment = rows.filter(row => (row.billing?.status ?? 'pending_payment') === 'pending_payment').length
  const q = typeof params.q === 'string' ? params.q.trim().toLowerCase() : ''
  const filtered = rows.filter(row => !q || [row.name,row.slug,row.billing?.plan_key,row.billing?.status].some(value => value?.toLowerCase().includes(q)))
  return <PlatformShell active="platform-billing" pageTitle="Billing & attention" userEmail={String(auth.claims.email ?? '')}>
    <section className="page-intro platform-page-intro"><div><span className="eyebrow">PLATFORM OPERATIONS</span><h2>Billing & attention</h2><p>Review customer subscription states and open a workspace’s billing page.</p></div></section>
    {params.saved === 'plan' && <div className="notice">Workspace plan updated. Access is available immediately; no payment was collected.</div>}
    {params.error === 'plan' && <div className="error">Plan could not be changed. Confirm the workspace and selected plan.</div>}
    <section className="metric-grid platform-metrics"><Metric label="Active subscriptions" value={active} detail="Active or trialing" tone="blue"/><Metric label="Needs attention" value={attention} detail="Past due, unpaid, or incomplete" tone="pink"/><Metric label="Workspaces" value={rows.length} detail="All customer accounts" tone="purple"/><Metric label="Awaiting payment" value={awaitingPayment} detail="Plan selected; payments not enabled" tone="green"/></section>
    <section className="panel platform-table-panel"><div className="directory-toolbar"><div><strong>Subscription status by workspace</strong><small>Assign a plan to sell or update workspace access. Payment collection is not enabled yet.</small></div><form method="get" className="directory-search"><input name="q" defaultValue={typeof params.q === 'string' ? params.q : ''} placeholder="Search workspace or status" aria-label="Search subscriptions"/><button className="action">Search</button></form></div><div className="platform-table-wrap"><table className="platform-table platform-billing-table"><thead><tr><th>WORKSPACE</th><th>PLAN</th><th>STATUS</th><th>PERIOD END</th><th>ASSIGN PLAN / ACTIONS</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td data-label="Workspace"><strong>{row.name}</strong><small>/{row.slug}</small></td><td data-label="Plan"><span className="plan-chip">{row.billing?.plan_key ?? 'starter'}</span></td><td data-label="Status"><span className={`pill platform-status ${['active','trialing'].includes(row.billing?.status ?? '') ? 'status-active' : ['past_due','unpaid'].includes(row.billing?.status ?? '') ? 'status-past_due' : ''}`}>{row.billing?.status ?? 'pending_payment'}</span></td><td data-label="Period end">{row.billing?.current_period_end ? new Date(row.billing.current_period_end).toLocaleDateString() : '—'}</td><td data-label="Plan & actions"><div className="platform-actions"><form action={setWorkspacePlan} className="platform-plan-edit"><input type="hidden" name="organization_id" value={row.id}/><select name="plan" aria-label={`Plan for ${row.name}`} defaultValue={row.billing?.plan_key ?? 'starter'}><option value="starter">Starter · ₹3,000</option><option value="team">Team · ₹6,500</option><option value="business">Business · ₹13,000</option></select><button className="action">Save plan</button></form><Link href={`/staff?workspace=${row.id}`}>Manage users</Link><Link href={`/branches?workspace=${row.id}`}>Manage branches</Link><Link href={`/branding?workspace=${row.id}`}>Branding</Link><Link href={`/?workspace=${row.id}`}>Open</Link></div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty">{q ? 'No workspace matches your search.' : 'No billing records found.'}</div>}</div></section>
    <p className="footer">Selected plans grant access now. Payment collection will be added later.</p>
  </PlatformShell>
}

function Metric(props: { label: string; value: number; detail: string; tone: string }) { return <StatCard {...props}/> }
