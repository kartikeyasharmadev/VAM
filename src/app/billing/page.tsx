import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'
import { openSubscriptionPortal, signOut, startSubscriptionCheckout } from '../actions'

type Search = Promise<Record<string, string | string[] | undefined>>
const plans = [
  { key: 'free', name: 'Free', price: 'Free', description: 'A simple start for one front desk.', features: ['1 branch', '3 team members', '100 visits each month'] },
  { key: 'team', name: 'Team', price: process.env.NEXT_PUBLIC_TEAM_PRICE_LABEL ?? '₹999 / month', description: 'For busy spaces with a growing team.', features: ['Up to 5 branches', 'Up to 20 team members', 'Unlimited visits'] },
  { key: 'business', name: 'Business', price: process.env.NEXT_PUBLIC_BUSINESS_PRICE_LABEL ?? '₹2,499 / month', description: 'More locations, with room to scale.', features: ['Unlimited branches', 'Unlimited team members', 'Unlimited visits'] },
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
  const currentPlan = billing?.plan_key ?? 'free'
  const hasActiveSubscription = Boolean(billing?.stripe_customer_id && ['active', 'trialing', 'past_due'].includes(billing.status ?? ''))
  const error = typeof params.error === 'string' ? params.error : ''
  return <AppShell active="billing" pageTitle="Plan & billing" workspaceId={workspaceId} workspaceName={organization.name} userEmail={String(auth.claims.email ?? '')} workspaceRole={membership?.role ?? undefined} isPlatformAdmin={Boolean(isPlatformAdmin)}>
    <section className="billing-hero"><div><span className="eyebrow">ENTRYFLOW PLANS</span><h1>Choose how your workspace grows.</h1><p>One subscription covers your whole workspace. Change or cancel it any time in the billing portal.</p></div><div className="billing-current"><span className="muted">CURRENT PLAN</span><strong>{plans.find(plan => plan.key === currentPlan)?.name ?? 'Free'}</strong><span className={`status-badge status-${billing?.status ?? 'free'}`}>{billing?.status ?? 'free'}</span>{billing?.current_period_end && <small>Renews or ends {new Date(billing.current_period_end).toLocaleDateString()}</small>}</div></section>
    {isPlatformAdmin && !membership && <div className="notice">Viewing this customer’s plan as Platform Super Admin. Subscription changes are completed by the workspace admin.</div>}
    {params.success && <div className="notice">Checkout complete. Your plan updates after Stripe confirms the subscription webhook.</div>}
    {params.cancelled && <div className="notice">Checkout was cancelled. Your workspace plan hasn’t changed.</div>}
    {error && <div className="error">{error === 'config' ? 'Add your Stripe price IDs and secret key to .env.local, then restart Next.js.' : error === 'active' ? 'This workspace already has a subscription. Use Manage billing to change it.' : error === 'no_customer' ? 'There is no Stripe customer yet. Choose a paid plan to start a subscription.' : 'We could not open Stripe. Check your Stripe settings and try again.'}</div>}
    {!process.env.STRIPE_SECRET_KEY && <div className="notice">Billing setup is not finished yet. Add Stripe test keys and price IDs to `.env.local` to enable checkout.</div>}
    <section className="plan-grid" aria-label="Subscription plans">{plans.map((plan) => <article className={`plan-card ${plan.key === 'team' ? 'plan-featured' : ''}`} key={plan.key}>
      {plan.key === 'team' && <span className="plan-ribbon">MOST POPULAR</span>}
      <span className="plan-name">{plan.name}</span><h2>{plan.price}</h2><p>{plan.description}</p><ul>{plan.features.map(feature => <li key={feature}><span className="check-mark">✓</span>{feature}</li>)}</ul>
      {plan.key === 'free' ? <div className="current-plan-label">{currentPlan === 'free' ? 'Your current plan' : 'Free plan'}</div> : isPlatformAdmin && !membership ? <div className="current-plan-label">For workspace admins</div> : hasActiveSubscription ? (currentPlan === plan.key ? <div className="current-plan-label">Your current plan</div> : <div className="current-plan-label">Change plans in billing portal</div>) : <form action={startSubscriptionCheckout}><input type="hidden" name="organization_id" value={workspaceId}/><input type="hidden" name="plan" value={plan.key}/><button className={`button full ${plan.key === 'team' ? '' : 'button-outline'}`}>Choose {plan.name}</button></form>}
    </article>)}</section>
    {hasActiveSubscription && (membership?.role === 'admin' || !isPlatformAdmin) && <section className="billing-manage panel"><div><h2>Manage your subscription</h2><p className="muted">Update payment details, view invoices, change plans, or cancel securely through Stripe.</p></div><form action={openSubscriptionPortal}><input type="hidden" name="organization_id" value={workspaceId}/><button className="button">Manage billing</button></form></section>}
    <p className="footer">Payments are handled by Stripe Checkout. EntryFlow receives signed billing events to update workspace access.</p>
  </AppShell>
}
