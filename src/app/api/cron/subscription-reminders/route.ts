import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

type BillingRow = {
  organization_id: string
  plan_key: string
  status: string
  current_period_end: string | null
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return Response.json({ error: 'Cron is not configured.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const resendKey = process.env.RESEND_API_KEY
  const emailFrom = process.env.EMAIL_FROM
  if (!resendKey || !emailFrom) {
    return Response.json({ sent: 0, skipped: 'Add RESEND_API_KEY and EMAIL_FROM to enable email reminders.' })
  }

  const supabase = createAdminClient()
  const { data: subscriptions, error: billingError } = await supabase
    .from('organization_billing')
    .select('organization_id,plan_key,status,current_period_end')
  if (billingError) return Response.json({ error: 'Could not read subscription data.' }, { status: 500 })

  const rows = (subscriptions ?? []) as BillingRow[]
  if (!rows.length) return Response.json({ sent: 0, scanned: 0 })
  const { data: organizations } = await supabase.from('organizations').select('id,name').in('id', rows.map(row => row.organization_id))
  const names = new Map((organizations ?? []).map(item => [item.id, item.name]))
  const now = Date.now()
  const sevenDays = now + 7 * 24 * 60 * 60 * 1000
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const billing of rows) {
    const periodEnd = billing.current_period_end ? new Date(billing.current_period_end) : null
    const attention = ['past_due', 'unpaid', 'canceled', 'paused'].includes(billing.status)
      || (billing.plan_key !== 'free' && periodEnd !== null && periodEnd.getTime() < now)
    const renewalDue = !attention && ['active', 'trialing'].includes(billing.status)
      && periodEnd !== null && periodEnd.getTime() >= now && periodEnd.getTime() <= sevenDays
    if (!attention && !renewalDue) continue

    const reminderType = attention ? 'billing_attention' : 'renewal_7d'
    const { data: admins, error: adminsError } = await supabase.from('organization_members')
      .select('user_id').eq('organization_id', billing.organization_id).eq('role', 'admin')
    if (adminsError) { failed++; continue }

    for (const admin of admins ?? []) {
      const periodKey = periodEnd?.toISOString() ?? 'no-period'
      const dedupeKey = `${billing.organization_id}:${reminderType}:${billing.status}:${periodKey}:${admin.user_id}`
      const { data: existing, error: lookupError } = await supabase.from('subscription_reminder_deliveries')
        .select('dedupe_key').eq('dedupe_key', dedupeKey).maybeSingle()
      if (lookupError) { failed++; continue }
      if (existing) { skipped++; continue }

      const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(admin.user_id)
      const email = userResult.user?.email
      if (userError || !email) { failed++; continue }

      const workspaceName = names.get(billing.organization_id) ?? 'Your workspace'
      const endLabel = periodEnd ? periodEnd.toLocaleDateString('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }) : 'not available'
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
      const billingLink = siteUrl ? `${siteUrl}/billing?workspace=${billing.organization_id}` : ''
      const subject = attention ? `Action needed: ${workspaceName} subscription` : `Your ${workspaceName} plan renews soon`
      const text = attention
        ? `${workspaceName}: your ${billing.plan_key} subscription is ${billing.status}. Please review billing to continue service. Period end: ${endLabel}.${billingLink ? `\nManage billing: ${billingLink}` : ''}`
        : `${workspaceName}: your ${billing.plan_key} plan is due for renewal on ${endLabel}.${billingLink ? `\nManage billing: ${billingLink}` : ''}`

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: emailFrom, to: [email], subject, text }),
          cache: 'no-store',
        })
        if (!response.ok) { failed++; continue }
        const { error: logError } = await supabase.from('subscription_reminder_deliveries').insert({
          dedupe_key: dedupeKey,
          organization_id: billing.organization_id,
          recipient_user_id: admin.user_id,
          reminder_type: reminderType,
          period_end: billing.current_period_end,
        })
        if (logError) { failed++; continue }
        sent++
      } catch {
        failed++
      }
    }
  }

  return Response.json({ sent, skipped, failed, scanned: rows.length })
}
