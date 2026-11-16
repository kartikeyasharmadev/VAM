import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { updateVisitStatus } from '../actions'

type Search = Promise<Record<string, string | string[] | undefined>>

export default async function VisitorLog({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/')
  const [{ data: memberships }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.from('organization_members').select('organization_id, role').eq('user_id', userId).order('created_at'),
    supabase.rpc('is_platform_admin'),
  ])
  const selected = typeof params.workspace === 'string' ? params.workspace : memberships?.[0]?.organization_id
  const { data: platformWorkspaces } = isPlatformAdmin ? await supabase.from('organizations').select('id,name').order('name') : { data: [] }
  const membership = memberships?.find(item => item.organization_id === selected) ?? (isPlatformAdmin && platformWorkspaces?.some(item => item.id === selected) ? { organization_id: selected!, role: 'admin' as const } : null)
  if (!membership) redirect('/')
  const [{ data: organization }, { data: member }, { data: branchRoles }, { data: visits }] = await Promise.all([
    supabase.from('organizations').select('id,name').eq('id', membership.organization_id).maybeSingle(),
    supabase.from('organization_members').select('role').eq('organization_id', membership.organization_id).eq('user_id', userId).maybeSingle(),
    supabase.from('location_members').select('location_id,role').eq('organization_id', membership.organization_id).eq('user_id', userId),
    supabase.from('visits').select('id,status,expected_at,host_name,purpose,visitor:visitors(full_name,email,company_name,phone,photo_path),branch:locations(name)').eq('organization_id', membership.organization_id).order('expected_at', { ascending: false }).limit(100),
  ])
  const canManageWorkspace = Boolean(isPlatformAdmin) || member?.role === 'admin'
  const canManageFrontDesk = canManageWorkspace || member?.role === 'receptionist' || branchRoles?.some(item => ['admin','receptionist'].includes(item.role))
  if (!canManageFrontDesk) redirect('/')
  const query = typeof params.q === 'string' ? params.q.trim().toLowerCase() : ''
  const photoPaths = [...new Set((visits ?? []).map(visit => { const guest = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor; return guest?.photo_path }).filter((path): path is string => Boolean(path)))]
  const { data: signedPhotos } = photoPaths.length
    ? await supabase.storage.from('visitor-photos').createSignedUrls(photoPaths, 300)
    : { data: [] }
  const photoUrls = new Map((signedPhotos ?? []).map(item => [item.path, item.signedUrl ?? '']))
  const rows = (visits ?? []).filter(visit => {
    const guest = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor
    const branch = Array.isArray(visit.branch) ? visit.branch[0] : visit.branch
    return !query || [guest?.full_name, guest?.email, guest?.company_name, guest?.phone, visit.host_name, branch?.name].some(value => value?.toLowerCase().includes(query))
  })
  return <AppShell active="visitors" pageTitle="Visitor log" workspaceId={membership.organization_id} workspaceName={organization?.name} userEmail={String(auth.claims.email ?? '')} workspaceRole={member?.role ?? (isPlatformAdmin ? undefined : membership.role)} isPlatformAdmin={Boolean(isPlatformAdmin)} canManageFrontDesk={canManageFrontDesk} canManageWorkspace={canManageWorkspace}>
    <section className="page-intro visitor-page-intro"><div><span className="eyebrow">FRONT DESK · {organization?.name}</span><h2>Visitor log</h2><p>Review member requests, approve or reject them, and manage arrivals.</p></div><Link className="button" href={`/?workspace=${membership.organization_id}`}>Register a visitor</Link></section>
    <section className="panel visitor-log-panel"><div className="directory-toolbar"><div><strong>{rows.length} recent visits</strong><small>Showing the latest 100 visits you can access.</small></div><form method="get" className="directory-search"><input type="hidden" name="workspace" value={membership.organization_id}/><input name="q" defaultValue={typeof params.q === 'string' ? params.q : ''} placeholder="Search visitor, host, branch" aria-label="Search visits"/><button className="action">Search</button></form></div><div className="platform-table-wrap"><table className="visit-table visitor-page-table"><thead><tr><th>VISITOR</th><th>HOST / PURPOSE</th><th>BRANCH</th><th>ARRIVAL</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{rows.map(visit => { const guest = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor; const branch = Array.isArray(visit.branch) ? visit.branch[0] : visit.branch; const photoUrl = guest?.photo_path ? photoUrls.get(guest.photo_path) : ''; return <tr key={visit.id}><td><div className="visitor-log-identity">{photoUrl && <img src={photoUrl} alt={`${guest?.full_name ?? 'Visitor'} photo`} loading="lazy"/>}<div><b>{guest?.full_name ?? 'Guest'}</b>{guest?.email && <><br/><span className="muted">{guest.email}</span></>}{guest?.company_name && <><br/><span className="muted">{guest.company_name}</span></>}{guest?.phone && <><br/><span className="muted">{guest.phone}</span></>}</div></div></td><td>{visit.host_name ?? '—'}<br/><span className="muted">{visit.purpose}</span></td><td>{branch?.name ?? '—'}</td><td>{new Date(visit.expected_at).toLocaleString()}</td><td><span className={`pill ${visit.status === 'expected' ? 'expected' : ''}`}>{visit.status.replace('_',' ')}</span></td><td className="row-actions">{visit.status === 'pending' && <><form action={updateVisitStatus}><input type="hidden" name="visit_id" value={visit.id}/><input type="hidden" name="next_status" value="expected"/><button className="action">Approve</button></form><form action={updateVisitStatus}><input type="hidden" name="visit_id" value={visit.id}/><input type="hidden" name="next_status" value="rejected"/><button className="action">Reject</button></form></>}{visit.status === 'expected' && <form action={updateVisitStatus}><input type="hidden" name="visit_id" value={visit.id}/><input type="hidden" name="next_status" value="inside"/><button className="action">Check in</button></form>}{visit.status === 'inside' && <form action={updateVisitStatus}><input type="hidden" name="visit_id" value={visit.id}/><input type="hidden" name="next_status" value="checked_out"/><button className="action">Check out</button></form>}{visit.status === 'rejected' && <span className="muted">Request declined</span>}{visit.status === 'checked_out' && <span className="muted">Complete</span>}</td></tr>})}</tbody></table>{!rows.length && <div className="empty">{query ? 'No visits match your search.' : 'No visitor activity yet.'}</div>}</div></section>
  </AppShell>
}
