import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(',').map(value => value.split('='))
  const timestamp = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest()
  return signatures.some(value => {
    try {
      const candidate = Buffer.from(value, 'hex')
      return candidate.length === expected.length && timingSafeEqual(candidate, expected)
    } catch { return false }
  })
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!signature || !webhookSecret || !supabaseUrl || !supabaseSecret) {
    return Response.json({ error: 'Webhook configuration is incomplete.' }, { status: 500 })
  }
  const payload = await request.text()
  if (!verifyStripeSignature(payload, signature, webhookSecret)) {
    return Response.json({ error: 'Invalid Stripe signature.' }, { status: 400 })
  }

  let event: { type: string; data: { object: Record<string, unknown> } }
  try { event = JSON.parse(payload) as typeof event }
  catch { return Response.json({ error: 'Invalid JSON payload.' }, { status: 400 }) }
  if (!['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    return Response.json({ received: true })
  }

  const subscription = event.data.object
  const metadata = subscription.metadata as Record<string, string> | undefined
  const organizationId = metadata?.organization_id
  if (!organizationId) return Response.json({ received: true })
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return Response.json({ error: 'Invalid organization metadata.' }, { status: 400 })
  const requestedPlan = metadata?.plan_key
  const planKey = ['team', 'business'].includes(requestedPlan ?? '') ? requestedPlan! : 'free'
  const status = String(subscription.status ?? (event.type.endsWith('.deleted') ? 'canceled' : 'incomplete'))
  const customer = subscription.customer
  const customerId = typeof customer === 'string' ? customer : (customer as { id?: string } | null)?.id
  const items = subscription.items as { data?: Array<{ price?: { id?: string }; current_period_end?: number }> } | undefined
  const priceId = items?.data?.[0]?.price?.id ?? null
  const periodEnd = items?.data?.[0]?.current_period_end
  const supabase = createSupabaseClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await supabase.from('organization_billing').upsert({
    organization_id: organizationId,
    plan_key: status === 'canceled' ? 'free' : planKey,
    status: ['free', 'incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'].includes(status) ? status : 'incomplete',
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: String(subscription.id ?? ''),
    stripe_price_id: priceId,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id' })
  if (error) {
    console.error('Stripe billing sync failed', error.message)
    return Response.json({ error: 'Subscription state could not be saved.' }, { status: 500 })
  }
  return Response.json({ received: true })
}
