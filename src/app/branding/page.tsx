import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { saveWorkspaceBranding } from '../actions'

type Search = Promise<Record<string, string | string[] | undefined>>

export default async function BrandingSettings({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/')
  const [{ data: memberships }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.from('organization_members').select('organization_id,role').eq('user_id', userId),
    supabase.rpc('is_platform_admin'),
  ])
  const ids = (memberships ?? []).filter(item => item.role === 'admin').map(item => item.organization_id)
  const { data: organizations } = isPlatformAdmin
    ? await supabase.from('organizations').select('id,name,brand_logo_url,brand_primary_color').order('name')
    : ids.length ? await supabase.from('organizations').select('id,name,brand_logo_url,brand_primary_color').in('id', ids).order('name') : { data: [] }
  const selected = typeof params.workspace === 'string' ? params.workspace : organizations?.[0]?.id
  const organization = organizations?.find(item => item.id === selected)
  if (!organization) redirect('/')
  const role = memberships?.find(item => item.organization_id === organization.id)?.role
  if (!isPlatformAdmin && role !== 'admin') redirect('/')
  return <AppShell active="branding" pageTitle="Workspace branding" workspaceId={organization.id} workspaceName={organization.name} userEmail={String(auth.claims.email ?? '')} workspaceRole={role ?? undefined} isPlatformAdmin={Boolean(isPlatformAdmin)}>
    <section className="page-intro"><div><span className="eyebrow">WORKSPACE SETTINGS</span><h2>Make EntryFlow yours</h2><p>Your logo and accent color appear across this workspace and all its branches.</p></div></section>
    {typeof params.error === 'string' && <div className="error">Use a secure https logo URL and a valid six-digit color.</div>}
    {params.saved && <div className="notice">Workspace branding saved. It will appear for all branches.</div>}
    <section className="panel branding-panel">
      <div className="branding-preview" style={{ borderColor: organization.brand_primary_color ?? '#5c14a3' }}>
        {organization.brand_logo_url ? <img src={organization.brand_logo_url} alt={`${organization.name} logo preview`}/> : <span className="branding-placeholder" style={{ background: organization.brand_primary_color ?? '#5c14a3' }}>{organization.name.slice(0,1).toUpperCase()}</span>}
        <div><small>PREVIEW</small><strong>{organization.name}</strong><span>All branches use this workspace brand</span></div>
      </div>
      <form action={saveWorkspaceBranding} className="branding-form">
        <input type="hidden" name="organization_id" value={organization.id}/>
        <div className="field"><label htmlFor="brand-logo">Logo URL</label><input id="brand-logo" name="brand_logo_url" type="url" defaultValue={organization.brand_logo_url ?? ''} placeholder="https://example.com/logo.png"/><small className="muted">Use a public HTTPS PNG, JPG, SVG, or WebP image URL.</small></div>
        <div className="field"><label htmlFor="brand-color">Primary color</label><input id="brand-color" name="brand_primary_color" type="color" defaultValue={organization.brand_primary_color ?? '#5c14a3'} required/></div>
        <button className="button">Save workspace branding</button>
      </form>
      <p className="muted">Branding is managed once per workspace, so every branch stays consistent.</p>
    </section>
    <p className="footer"><Link href={`/staff?workspace=${organization.id}`}>Manage workspace staff</Link></p>
  </AppShell>
}
