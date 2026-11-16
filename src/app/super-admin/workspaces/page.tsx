import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlatformShell } from '@/components/platform-shell'
import { createClient } from '@/lib/supabase/server'
import { PlanSelector } from '@/components/plan-selector'
import { createPlatformWorkspace } from '@/app/actions'

type Search = Promise<Record<string, string | string[] | undefined>>

export default async function PlatformWorkspaces({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/')
  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  if (!isPlatformAdmin) redirect('/')
  const [{ data: organizations }, { data: members }] = await Promise.all([
    supabase.from('organizations').select('id,name,slug,industry,created_at').order('created_at', { ascending: false }),
    supabase.from('organization_members').select('organization_id'),
  ])
  const q = typeof params.q === 'string' ? params.q.trim().toLowerCase() : ''
  const rows = (organizations ?? []).filter(org => !q || [org.name, org.slug, org.industry].some(value => value.toLowerCase().includes(q)))
  return <PlatformShell active="platform-workspaces" pageTitle="Customer workspaces" userEmail={String(auth.claims.email ?? '')}>
    <section className="page-intro platform-page-intro"><div><span className="eyebrow">PLATFORM DIRECTORY</span><h2>Workspaces</h2><p>Open a customer environment to review its users, branches, and subscription.</p></div><span className="count-badge">{organizations?.length ?? 0} total</span></section>
    <section className="panel platform-table-panel platform-create-panel">
      <div className="section-title"><div><span className="eyebrow">NEW CUSTOMER</span><h2>Create a workspace</h2><p className="muted">Choose a required monthly plan, then invite the customer’s first admin and staff from Manage users.</p></div></div>
      {params.error === 'workspace' && <p className="error">Could not create this workspace. Check the name and use a unique lowercase slug such as haven-cowork.</p>}
      {params.error === 'plan' && <p className="error">Select a plan before creating the workspace.</p>}
      <form action={createPlatformWorkspace} className="platform-create-form">
        <div className="field"><label htmlFor="platform-workspace-name">Workspace name</label><input id="platform-workspace-name" name="name" required minLength={2} maxLength={120} placeholder="e.g. Haven Cowork" /></div>
        <div className="field"><label htmlFor="platform-workspace-slug">URL slug</label><input id="platform-workspace-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="e.g. haven-cowork" /></div>
        <div className="field"><label htmlFor="platform-workspace-type">Customer type</label><select id="platform-workspace-type" name="industry" defaultValue="general"><option value="general">General / other venue</option><option value="coworking">Coworking</option><option value="office">Office</option><option value="school">School</option><option value="clinic">Clinic</option><option value="industrial">Industrial site</option></select></div>
        <PlanSelector/>
        <button className="button">Create workspace</button>
      </form>
    </section>
    <section className="panel platform-table-panel"><div className="directory-toolbar"><div><strong>All customer workspaces</strong><small>Platform access is logged and workspace data remains protected by database policy.</small></div><form method="get" className="directory-search"><input name="q" defaultValue={typeof params.q === 'string' ? params.q : ''} placeholder="Search workspace" aria-label="Search workspaces"/><button className="action">Search</button></form></div><div className="platform-table-wrap"><table className="platform-table platform-workspaces-table"><thead><tr><th>WORKSPACE</th><th>TYPE</th><th>USERS</th><th>STARTED</th><th>ACTIONS</th></tr></thead><tbody>{rows.map(org => <tr key={org.id}><td data-label="Workspace"><strong>{org.name}</strong><small>/{org.slug}</small></td><td data-label="Type">{org.industry}</td><td data-label="Users">{members?.filter(member => member.organization_id === org.id).length ?? 0}</td><td data-label="Started">{new Date(org.created_at).toLocaleDateString()}</td><td data-label="Actions"><div className="platform-actions"><Link href={`/?workspace=${org.id}`}>Open</Link><Link href={`/staff?workspace=${org.id}`}>Users</Link><Link href={`/branches?workspace=${org.id}`}>Branches</Link><Link href={`/billing?workspace=${org.id}`}>Billing</Link></div></td></tr>)}</tbody></table>{!rows.length && <div className="empty">{q ? 'No workspace matches your search.' : 'No customer workspaces yet.'}</div>}</div></section>
  </PlatformShell>
}
