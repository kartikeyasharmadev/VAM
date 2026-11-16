import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'
import { BRAND_CONFIG } from '@/components/brand'
import { openSubscriptionPortal } from '../actions'

type Search = Promise<Record<string, string | string[] | undefined>>
const plans = [
  { key: 'starter', name: 'Starter', price: '₹3,000 / month', description: 'For a small front desk getting started.', features: ['1 branch', '3 team members', '100 visits each month'] },
  { key: 'team', name: 'Team', price: '₹6,500 / month', description: 'For busy spaces with a growing team.', features: ['Up to 5 branches', 'Up to 20 team members', 'Unlimited visits'] },
  { key: 'business', name: 'Business', price: '₹13,000 / month', description: 'More locations, with room to scale.', features: ['Unlimited branches', 'Unlimited team members', 'Unlimited visits'] },
]

export default async function Billing({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const workspaceId = typeof params.workspace === 'string' ? params.workspace : ''
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) redirect('/')
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/')
  const [{ data: membership }, { data: organization }, { data: billing }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.from('organization_members').select('role').eq('organization_id', workspaceId).eq('user_id', userId).maybeSingle(),
    supabase.from('organizations').select('id, name').eq('id', workspaceId).maybeSingle(),
    supabase.from('organization_billing').select('plan_key, status, current_period_end, stripe_customer_id').eq('organization_id', workspaceId).maybeSingle(),
    supabase.rpc('is_platform_admin'),
  ])
  if (!organization || (!isPlatformAdmin && membership?.role !== 'admin')) redirect('/')
  const currentPlan = billing?.plan_key ?? 'starter'
  const hasActiveSubscription = Boolean(billing?.stripe_customer_id && ['active', 'trialing', 'past_due'].includes(billing.status ?? ''))
  const error = typeof params.error === 'string' ? params.error : ''
  return <AppShell active="billing" pageTitle="Plan & billing" workspaceId={workspaceId} workspaceName={organization.name} userEmail={String(auth.claims.email ?? '')} workspaceRole={membership?.role ?? undefined} isPlatformAdmin={Boolean(isPlatformAdmin)}>
    <section className="billing-hero"><div><span className="eyebrow">{BRAND_CONFIG.name.toUpperCase()} PLANS</span><h1>Your workspace plan</h1><p>The selected plan is active for workspace access now. Online payments will be added later.</p></div><div className="billing-current"><span className="muted">CURRENT PLAN</span><strong>{plans.find(plan => plan.key === currentPlan)?.name ?? 'Starter'}</strong><span className={`status-badge status-${billing?.status ?? 'pending_payment'}`}>{billing?.status === 'active' ? 'active' : billing?.status === 'trialing' ? 'trialing' : 'payment setup later'}</span>{billing?.current_period_end && <small>Renews or ends {new Date(billing.current_period_end).toLocaleDateString()}</small>}</div></section>
    {isPlatformAdmin && !membership && <div className="notice">Viewing this customer’s selected plan as Platform Super Admin. The workspace admin manages their account settings.</div>}
    {params.success && <div className="notice">Payment confirmed. Your subscription status will update after the billing confirmation.</div>}
    {params.cancelled && <div className="notice">Checkout was cancelled. Your selected plan and workspace access remain unchanged.</div>}
    {error && <div className="error">We could not open billing. Please try again later.</div>}
    <div className="notice">Payment collection is not enabled yet. Your plan selection grants access now; no payment is taken on this screen.</div>
    <section className="plan-grid" aria-label="Subscription plans">{plans.map((plan) => <article className={`plan-card ${plan.key === 'team' ? 'plan-featured' : ''}`} key={plan.key}>
      {plan.key === 'team' && <span className="plan-ribbon">MOST POPULAR</span>}
      <span className="plan-name">{plan.name}</span><h2>{plan.price}</h2><p>{plan.description}</p><ul>{plan.features.map(feature => <li key={feature}><span className="check-mark">✓</span>{feature}</li>)}</ul>
      {currentPlan === plan.key ? <div className="current-plan-label">Selected for this workspace</div> : isPlatformAdmin && !membership ? <div className="current-plan-label">For workspace admins</div> : <div className="current-plan-label">Plan changes available later</div>}
    </article>)}</section>
    {hasActiveSubscription && (membership?.role === 'admin' || !isPlatformAdmin) && <section className="billing-manage panel"><div><h2>Manage your subscription</h2><p className="muted">Update payment details, view invoices, or cancel through the billing provider.</p></div><form action={openSubscriptionPortal}><input type="hidden" name="organization_id" value={workspaceId}/><button className="button">Manage billing</button></form></section>}
    <p className="footer">Plan limits apply now. Payment collection and plan changes will be added later.</p>
  </AppShell>
}
