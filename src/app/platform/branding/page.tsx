import { redirect } from 'next/navigation'
import { PlatformShell } from '@/components/platform-shell'
import { PlatformBrandingForm } from '@/components/platform-branding-form'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_PLATFORM_BRANDING, getPlatformBranding } from '@/lib/platform-branding'

export default async function PlatformBrandingPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/')
  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  if (!isPlatformAdmin) redirect('/')
  const branding = await getPlatformBranding()
  return <PlatformShell active="platform-branding" pageTitle="Branding & appearance" userEmail={String(auth.claims.email ?? '')}>
    <section className="page-intro platform-page-intro"><div><span className="eyebrow">PLATFORM SETTINGS</span><h2>Branding & appearance</h2><p>Set the product identity and theme that every workspace sees.</p></div></section>
    <PlatformBrandingForm initial={branding.configured ? branding : DEFAULT_PLATFORM_BRANDING}/>
  </PlatformShell>
}
