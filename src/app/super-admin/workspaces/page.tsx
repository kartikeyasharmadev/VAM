import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

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
  return <AppShell active="platform-workspaces" pageTitle="Customer workspaces" userEmail={String(auth.claims.email ?? '')} isPlatformAdmin>
    <section className="page-intro platform-page-intro"><div><span className="eyebrow">PLATFORM DIRECTORY</span><h2>Workspaces</h2><p>Open a customer environment to review its users, branches, and subscription.</p></div><span className="count-badge">{organizations?.length ?? 0} total</span></section>
    <section className="panel platform-table-panel"><div className="directory-toolbar"><div><strong>All customer workspaces</strong><small>Platform access is logged and workspace data remains protected by database policy.</small></div><form method="get" className="directory-search"><input name="q" defaultValue={typeof params.q === 'string' ? params.q : ''} placeholder="Search workspace" aria-label="Search workspaces"/><button className="action">Search</button></form></div><div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>WORKSPACE</th><th>TYPE</th><th>USERS</th><th>STARTED</th><th>ACTIONS</th></tr></thead><tbody>{rows.map(org => <tr key={org.id}><td><strong>{org.name}</strong><small>/{org.slug}</small></td><td>{org.industry}</td><td>{members?.filter(member => member.organization_id === org.id).length ?? 0}</td><td>{new Date(org.created_at).toLocaleDateString()}</td><td><div className="platform-actions"><Link href={`/?workspace=${org.id}`}>Open</Link><Link href={`/staff?workspace=${org.id}`}>Users</Link><Link href={`/branches?workspace=${org.id}`}>Branches</Link><Link href={`/billing?workspace=${org.id}`}>Billing</Link></div></td></tr>)}</tbody></table>{!rows.length && <div className="empty">{q ? 'No workspace matches your search.' : 'No customer workspaces yet.'}</div>}</div></section>
  </AppShell>
}
