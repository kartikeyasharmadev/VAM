'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripePost, stripeSiteUrl, type StripeCheckoutSession, type StripePortalSession } from '@/lib/stripe'

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) redirect('/?error=missing')
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect('/?error=signin')
  redirect('/')
}

export async function signInWithGoogle() {
  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteUrl}/auth/confirm` },
  })
  if (error || !data.url) redirect('/?error=oauth')
  redirect(data.url)
}

export async function signUp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (password.length < 10) redirect('/signup?error=password')
  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${siteUrl}/auth/confirm` } })
  if (error) redirect('/signup?error=signup')
  if (data.session) redirect('/')
  redirect('/signup?check_email=1')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function createOrganization(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const industry = String(formData.get('industry') ?? 'general')
  if (name.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) redirect('/?error=workspace')

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims?.sub) redirect('/')
  const { error } = await supabase.rpc('create_organization', {
    p_name: name,
    p_slug: slug,
    p_industry: industry,
  })
  if (error) redirect('/?error=workspace')
  revalidatePath('/')
  redirect('/')
}

export async function createVisit(formData: FormData) {
  const name = String(formData.get('visitor_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim() || null
  const host = String(formData.get('host_name') ?? '').trim()
  const locationId = String(formData.get('location_id') ?? '')
  const purpose = String(formData.get('purpose') ?? 'Other')
  const expected = String(formData.get('expected_at_iso') ?? '')
  if (!name || !host || !expected || !/^[0-9a-f-]{36}$/i.test(locationId)) redirect('/?error=visit')
  const expectedAt = new Date(expected)
  if (Number.isNaN(expectedAt.getTime())) redirect('/?error=visit')

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub
  if (!userId) redirect('/')
  const organizationId = String(formData.get('organization_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) redirect('/?error=membership')
  const [{ data: membership }, { data: platformAdmin }] = await Promise.all([supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle(), supabase.rpc('is_platform_admin')])
  if (!membership && !platformAdmin) redirect('/?error=membership')

  const { error } = await supabase.rpc('create_visit', {
    p_organization_id: membership?.organization_id ?? organizationId,
    p_location_id: locationId,
    p_visitor_name: name,
    p_visitor_email: email,
    p_host_name: host,
    p_purpose: purpose,
    p_expected_at: expectedAt.toISOString(),
  })
  if (error) redirect(`/?workspace=${organizationId}&error=visit`)
  revalidatePath('/')
  redirect(`/?workspace=${organizationId}`)
}

export async function updateVisitStatus(formData: FormData) {
  const visitId = String(formData.get('visit_id') ?? '')
  const action = String(formData.get('next_status') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(visitId) || !['expected', 'rejected', 'inside', 'checked_out'].includes(action)) redirect('/?error=visit')
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims?.sub) redirect('/')
  const { data: visit } = await supabase.from('visits').select('id, organization_id, status, location_id').eq('id', visitId).maybeSingle()
  if (!visit) redirect('/?error=visit')
  const allowedTransition = (visit.status === 'pending' && ['expected', 'rejected'].includes(action))
    || (visit.status === 'expected' && action === 'inside')
    || (visit.status === 'inside' && action === 'checked_out')
  if (!allowedTransition) redirect(`/?workspace=${visit.organization_id}&error=visit`)
  if (['expected', 'rejected'].includes(action)) {
    const { data: canApprove } = await supabase.rpc('has_location_role', {
      p_organization_id: visit.organization_id,
      p_location_id: visit.location_id,
      p_roles: ['admin', 'receptionist'],
    })
    if (!canApprove) redirect('/?error=visit')
  }
  const update = action === 'inside'
    ? { status: 'inside', checked_in_at: new Date().toISOString(), checked_out_at: null }
    : action === 'checked_out'
      ? { status: 'checked_out', checked_out_at: new Date().toISOString() }
      : { status: action }
  const { error } = await supabase.from('visits').update(update).eq('id', visitId)
  if (error) redirect('/?error=visit')
  revalidatePath('/')
  revalidatePath('/visitors')
  revalidatePath('/notifications')
}

async function requireSignedIn() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) redirect('/')
  return supabase
}

function administrationUrl(formData: FormData, organizationId: string, section: 'staff' | 'branches', state?: [string, string]) {
  const requested = String(formData.get('return_to') ?? 'settings')
  const page = requested === 'staff' || requested === 'branches' ? requested : 'settings'
  const query = new URLSearchParams({ workspace: organizationId })
  if (page === 'settings') query.set('section', section)
  if (state) query.set(state[0], state[1])
  return `/${page}?${query.toString()}`
}

export async function setWorkspaceRole(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  const role = String(formData.get('role') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !/^[0-9a-f-]{36}$/i.test(userId) || !['admin', 'receptionist', 'member'].includes(role)) redirect('/settings?error=invalid')
  const supabase = await requireSignedIn()
  const { data: platformAdmin } = await supabase.rpc('is_platform_admin')
  if (!platformAdmin) {
    const { data: claims } = await supabase.auth.getClaims()
    const { data: membership } = await supabase.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', claims!.claims!.sub!).maybeSingle()
    if (membership?.role !== 'admin') redirect('/?error=membership')
  }
  const { error } = await supabase.from('organization_members').update({ role }).eq('organization_id', organizationId).eq('user_id', userId)
  if (error) redirect(administrationUrl(formData, organizationId, 'staff', ['error','role']))
  revalidatePath('/settings')
  revalidatePath('/super-admin')
  redirect(administrationUrl(formData, organizationId, 'staff', ['saved','role']))
}

export async function addWorkspaceMember(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  const role = String(formData.get('role') ?? 'member')
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !/^\S+@\S+\.\S+$/.test(email) || !['admin', 'receptionist', 'member'].includes(role)) redirect('/settings?error=member')
  const supabase = await requireSignedIn()
  const { error: existingMemberError } = await supabase.rpc('add_org_member_by_email', { p_organization_id: organizationId, p_email: email, p_role: role })
  if (!existingMemberError) {
    revalidatePath('/settings')
    revalidatePath('/')
    redirect(administrationUrl(formData, organizationId, 'staff', ['saved','member']))
  }
  if (!existingMemberError.message.includes('No confirmed EntryFlow account exists')) redirect(administrationUrl(formData, organizationId, 'staff', ['error','member']))

  let admin
  try { admin = createAdminClient() } catch { redirect(administrationUrl(formData, organizationId, 'staff', ['error','invite_config'])) }
  const { data: invitationId, error: invitationError } = await supabase.rpc('create_workspace_invitation', {
    p_organization_id: organizationId,
    p_email: email.toLowerCase(),
    p_role: role,
  })
  if (invitationError || !invitationId) redirect(administrationUrl(formData, organizationId, 'staff', ['error','member']))
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { error: emailError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm`,
    data: { entryflow_invitation: invitationId },
  })
  if (emailError) {
    await supabase.rpc('cancel_workspace_invitation', { p_organization_id: organizationId, p_invitation_id: invitationId })
    redirect(administrationUrl(formData, organizationId, 'staff', ['error','invite']))
  }
  revalidatePath('/settings')
  revalidatePath('/')
  redirect(administrationUrl(formData, organizationId, 'staff', ['saved','invite']))
}

export async function cancelWorkspaceInvitation(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const invitationId = String(formData.get('invitation_id') ?? '')
  if (![organizationId, invitationId].every(id => /^[0-9a-f-]{36}$/i.test(id))) redirect('/settings?error=member')
  const supabase = await requireSignedIn()
  const { error } = await supabase.rpc('cancel_workspace_invitation', { p_organization_id: organizationId, p_invitation_id: invitationId })
  if (error) redirect(administrationUrl(formData, organizationId, 'staff', ['error','member']))
  revalidatePath('/settings')
  redirect(administrationUrl(formData, organizationId, 'staff', ['saved','invitation_removed']))
}

export async function markNotificationRead(formData: FormData) {
  const notificationId = String(formData.get('notification_id') ?? '')
  const organizationId = String(formData.get('organization_id') ?? '')
  if (![notificationId, organizationId].every(id => /^[0-9a-f-]{36}$/i.test(id))) redirect('/?error=notification')
  const supabase = await requireSignedIn()
  const { error } = await supabase.from('organization_notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId).eq('organization_id', organizationId)
  if (error) redirect(`/notifications?workspace=${organizationId}&error=notification`)
  revalidatePath('/notifications')
  redirect(`/notifications?workspace=${organizationId}`)
}

export async function markPlatformNotificationRead(formData: FormData) {
  const notificationId = String(formData.get('notification_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(notificationId)) redirect('/notifications?error=notification')
  const supabase = await requireSignedIn()
  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  if (!isPlatformAdmin) redirect('/')
  const { error } = await supabase.from('platform_notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId)
  if (error) redirect('/notifications?error=notification')
  revalidatePath('/notifications')
  redirect('/notifications')
}

export async function markAllNotificationsRead(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const all = formData.get('all') === 'true'
  if (!all && !/^[0-9a-f-]{36}$/i.test(organizationId)) redirect('/')
  const supabase = await requireSignedIn()
  const { data: auth } = await supabase.auth.getClaims()
  let query = supabase.from('organization_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).eq('recipient_user_id', auth!.claims!.sub!)
  if (!all) query = query.eq('organization_id', organizationId)
  const { error } = await query
  if (error) redirect(all ? '/notifications?error=notification' : `/notifications?workspace=${organizationId}&error=notification`)
  if (all) {
    const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
    if (isPlatformAdmin) await supabase.from('platform_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  }
  revalidatePath('/notifications')
  redirect(all ? '/notifications' : `/notifications?workspace=${organizationId}`)
}

export async function saveNotificationPreferences(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) redirect('/')
  const supabase = await requireSignedIn()
  const { data: auth } = await supabase.auth.getClaims()
  const preferences = {
    organization_id: organizationId,
    user_id: auth!.claims!.sub!,
    new_visits: formData.get('new_visits') === 'on',
    visit_updates: formData.get('visit_updates') === 'on',
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('organization_notification_preferences').upsert(preferences, { onConflict: 'organization_id,user_id' })
  if (error) redirect(`/settings/notifications?workspace=${organizationId}&error=notification`)
  revalidatePath('/notifications')
  revalidatePath('/settings/notifications')
  redirect(`/settings/notifications?workspace=${organizationId}&saved=1`)
}

export async function setLocationMemberRole(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const locationId = String(formData.get('location_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  const role = String(formData.get('role') ?? '')
  if (![organizationId, locationId, userId].every(id => /^[0-9a-f-]{36}$/i.test(id)) || !['admin','receptionist','member'].includes(role)) redirect('/settings?error=assignment')
  const supabase = await requireSignedIn()
  const { error } = await supabase.rpc('set_location_member_role', {
    p_organization_id: organizationId,
    p_location_id: locationId,
    p_user_id: userId,
    p_role: role,
  })
  if (error) redirect(administrationUrl(formData, organizationId, 'staff', ['error','assignment']))
  revalidatePath('/')
  revalidatePath('/settings')
  redirect(administrationUrl(formData, organizationId, 'staff', ['saved','assignment']))
}

export async function removeLocationMember(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const locationId = String(formData.get('location_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  if (![organizationId, locationId, userId].every(id => /^[0-9a-f-]{36}$/i.test(id))) redirect('/settings?error=assignment')
  const supabase = await requireSignedIn()
  const { error } = await supabase.rpc('remove_location_member', {
    p_organization_id: organizationId,
    p_location_id: locationId,
    p_user_id: userId,
  })
  if (error) redirect(administrationUrl(formData, organizationId, 'staff', ['error','assignment']))
  revalidatePath('/')
  revalidatePath('/settings')
  redirect(administrationUrl(formData, organizationId, 'staff', ['saved','assignment']))
}

export async function createBranch(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !name || name.length > 120) redirect('/settings?error=branch')
  const supabase = await requireSignedIn()
  const { error } = await supabase.from('locations').insert({ organization_id: organizationId, name })
  if (error) redirect(administrationUrl(formData, organizationId, 'branches', ['error','branch']))
  revalidatePath('/settings')
  redirect(administrationUrl(formData, organizationId, 'branches', ['saved','branch']))
}

export async function deleteBranch(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const branchId = String(formData.get('branch_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !/^[0-9a-f-]{36}$/i.test(branchId)) redirect('/settings?error=branch')
  const supabase = await requireSignedIn()
  const { error } = await supabase.from('locations').delete().eq('organization_id', organizationId).eq('id', branchId)
  if (error) redirect(administrationUrl(formData, organizationId, 'branches', ['error','branch']))
  revalidatePath('/settings')
  redirect(administrationUrl(formData, organizationId, 'branches', ['saved','branch']))
}

export async function saveWorkspaceBranding(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const logoUrl = String(formData.get('brand_logo_url') ?? '').trim()
  const color = String(formData.get('brand_primary_color') ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || (logoUrl && !/^https:\/\//i.test(logoUrl)) || !/^#[0-9a-f]{6}$/i.test(color)) {
    redirect(`/branding?workspace=${organizationId}&error=branding`)
  }
  const supabase = await requireSignedIn()
  const { error } = await supabase.rpc('update_workspace_branding', {
    p_organization_id: organizationId,
    p_logo_url: logoUrl || null,
    p_primary_color: color,
  })
  if (error) redirect(`/branding?workspace=${organizationId}&error=branding`)
  revalidatePath('/')
  revalidatePath('/branding')
  redirect(`/branding?workspace=${organizationId}&saved=1`)
}

export async function startSubscriptionCheckout(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  const plan = String(formData.get('plan') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !['team', 'business'].includes(plan)) redirect('/?error=billing')
  const supabase = await requireSignedIn()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  const { data: membership } = await supabase.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', userId!).maybeSingle()
  if (membership?.role !== 'admin') redirect('/?error=membership')
  const priceId = plan === 'team' ? process.env.STRIPE_PRICE_TEAM : process.env.STRIPE_PRICE_BUSINESS
  if (!priceId) redirect(`/billing?workspace=${organizationId}&error=config`)
  const { data: billing } = await supabase.from('organization_billing').select('stripe_customer_id, status').eq('organization_id', organizationId).maybeSingle()
  if (billing?.stripe_customer_id && ['active', 'trialing', 'past_due'].includes(billing.status)) redirect(`/billing?workspace=${organizationId}&error=active`)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const fields: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: stripeSiteUrl(`/billing?workspace=${organizationId}&success=1`),
    cancel_url: stripeSiteUrl(`/billing?workspace=${organizationId}&cancelled=1`),
    'metadata[organization_id]': organizationId,
    'metadata[plan_key]': plan,
    'subscription_data[metadata][organization_id]': organizationId,
    'subscription_data[metadata][plan_key]': plan,
    'allow_promotion_codes': 'true',
  }
  if (billing?.stripe_customer_id) fields.customer = billing.stripe_customer_id
  else fields.customer_email = String(auth?.claims?.email ?? '')
  try {
    const session = await stripePost<StripeCheckoutSession>('checkout/sessions', fields)
    if (!session.url) redirect(`/billing?workspace=${organizationId}&error=checkout`)
    redirect(session.url)
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    redirect(`/billing?workspace=${organizationId}&error=checkout`)
  }
}

export async function openSubscriptionPortal(formData: FormData) {
  const organizationId = String(formData.get('organization_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) redirect('/?error=billing')
  const supabase = await requireSignedIn()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  const { data: membership } = await supabase.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', userId!).maybeSingle()
  if (membership?.role !== 'admin') redirect('/?error=membership')
  const { data: billing } = await supabase.from('organization_billing').select('stripe_customer_id').eq('organization_id', organizationId).maybeSingle()
  if (!billing?.stripe_customer_id) redirect(`/billing?workspace=${organizationId}&error=no_customer`)
  try {
    const portal = await stripePost<StripePortalSession>('billing_portal/sessions', {
      customer: billing.stripe_customer_id,
      return_url: stripeSiteUrl(`/billing?workspace=${organizationId}`),
    })
    redirect(portal.url)
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    redirect(`/billing?workspace=${organizationId}&error=portal`)
  }
}
