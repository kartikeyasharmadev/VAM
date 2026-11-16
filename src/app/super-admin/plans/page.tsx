import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PlatformShell } from '@/components/platform-shell'
import { createClient } from '@/lib/supabase/server'

const plans = [
  { key: 'starter', name: 'Starter', price: '₹3,000 / month', description: 'For a small front desk getting started.', features: ['1 branch', '3 team members', '100 visits per month'] },
  { key: 'team', name: 'Team', price: '₹6,500 / month', description: 'For busy venues with a growing team.', features: ['Up to 5 branches', 'Up to 20 team members', 'Unlimited visits'] },
  { key: 'business', name: 'Business', price: '₹13,000 / month', description: 'For organizations managing many locations.', features: ['Unlimited branches', 'Unlimited team members', 'Unlimited visits'] },
]

export default async function PlatformPlans() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/')
  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  if (!isPlatformAdmin) redirect('/')

  const { data: subscriptions } = await supabase.from('organization_billing').select('plan_key,status')
  const records = subscriptions ?? []

  return <PlatformShell active="platform-plans" pageTitle="Plans" userEmail={String(auth.claims.email ?? '')}>
    <section className="page-intro platform-page-intro"><div><span className="eyebrow">PLATFORM CATALOG</span><h2>Plans and pricing</h2><p>Review the plans offered to customer workspaces and see how subscriptions are configured.</p></div></section>
    <section className="notice platform-config-warning">Customers must choose one of these plans before a workspace is created. Their selected plan grants access immediately; payments are not collected yet.</section>
    <section className="plan-grid platform-plan-grid" aria-label="Available plans">
      {plans.map(plan => {
        const count = records.filter(row => row.plan_key === plan.key).length
        const active = records.filter(row => row.plan_key === plan.key && ['active', 'trialing'].includes(row.status)).length
        return <article className={`plan-card ${plan.key === 'team' ? 'plan-featured' : ''}`} key={plan.key}>
          {plan.key === 'team' && <span className="plan-ribbon">MOST POPULAR</span>}
          <span className="plan-name">{plan.name}</span><h2>{plan.price}</h2><p>{plan.description}</p>
          <ul>{plan.features.map(feature => <li key={feature}><span className="check-mark">✓</span>{feature}</li>)}</ul>
          <div className="platform-plan-count"><strong>{count}</strong><span>workspaces on plan</span><small>{active} active or trialing</small></div>
        </article>
      })}
    </section>
    <section className="panel platform-plan-help"><div><span className="eyebrow">PLAN CONFIGURATION</span><h2>Payment collection comes later</h2><p>Assign plans from Billing & attention. The database applies each selected plan’s branch, staff, and visit limits now; customers have access immediately.</p></div><Link className="button platform-plan-button" href="/super-admin/billing"><span>Assign customer plans</span><span aria-hidden="true">→</span></Link></section>
    <p className="footer">Subscription status is updated by verified Stripe webhooks and shown in Billing & attention.</p>
  </PlatformShell>
}
