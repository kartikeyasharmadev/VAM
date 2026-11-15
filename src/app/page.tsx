import Link from 'next/link'
import { createOrganization, signIn, signOut, updateVisitStatus } from './actions'
import { VisitorForm } from './visitor-form'
import { createClient } from '@/lib/supabase/server'
import { Brand } from '@/components/brand'
import { AppShell } from '@/components/app-shell'
import { GoogleSignIn } from '@/components/google-sign-in'

type Search = Promise<Record<string, string | string[] | undefined>>

const errorMessages: Record<string, string> = {
  missing: 'Enter your email and password.',
  signin: 'We could not sign you in. Check your email and password.',
  oauth: 'Google sign-in could not start. Check that Google is enabled in Supabase Auth and that your callback URL is allowed.',
  workspace: 'Workspace could not be created. Check the name and unique URL slug.',
  membership: 'Your account is not part of a workspace yet.',
  visit: 'Visitor could not be saved. Check the form and your front desk role.',
  billing: 'Billing could not be opened. Check that you are an admin of this workspace.',
  invite_accept: 'Your account is confirmed, but this workspace invitation could not be accepted. Ask the workspace administrator to resend it.',
  notification: 'Notification action could not be completed.',
}

export default async function Home({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  let supabase
  try { supabase = await createClient() } catch (error) {
    const message = error instanceof Error ? error.message : 'Add your Supabase values to .env.local.'
    return <main className="shell"><Brand/><section className="auth-card"><h1>Connect Supabase</h1><p className="muted">EntryFlow needs your project URL and publishable key before sign-in can work.</p><ol className="setup-steps"><li>Create or open a Supabase project.</li><li>Copy <code>.env.example</code> to <code>.env.local</code>.</li><li>Paste your Project URL and publishable key, then restart the dev server.</li></ol><div className="notice">{message}</div></section></main>
  }
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) {
    const errorKey = typeof params.error === 'string' ? params.error : ''
    return <main className="shell auth-shell"><Brand/><div className="auth-intro"><span className="eyebrow">ARRIVALS, HANDLED.</span><h1>A better first hello starts here.</h1><p>Keep your front desk moving and every guest accounted for.</p><div className="auth-points"><span>✓ Simple visitor check-in</span><span>✓ One view across every branch</span><span>✓ Access that stays with your team</span></div></div><section className="auth-card"><h2>Welcome back</h2><p className="muted">Sign in to your visitor management workspace.</p>{errorMessages[errorKey] && <div className="error">{errorMessages[errorKey]}</div>}<form action={signIn}><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com"/></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required/></div><button className="button full">Sign in</button></form><div className="auth-divider"><span>or</span></div><GoogleSignIn/><p className="switch-auth">New to EntryFlow? <Link href="/signup">Create an account</Link></p></section></main>
  }

  const [{ data: memberships }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.from('organization_members').select('organization_id, role').eq('user_id', userId).order('created_at'),
    supabase.rpc('is_platform_admin'),
  ])
  const selectedWorkspace = typeof params.workspace === 'string' ? params.workspace : ''
  const { data: platformWorkspaces } = isPlatformAdmin ? await supabase.from('organizations').select('id, name').order('name') : { data: [] }
  const validMembership = memberships?.find(item => item.organization_id === selectedWorkspace) ?? memberships?.[0]
  const selectedPlatformWorkspace = isPlatformAdmin ? platformWorkspaces?.find(item => item.id === selectedWorkspace) ?? platformWorkspaces?.[0] : null
  const membership = validMembership ?? (selectedPlatformWorkspace ? { organization_id: selectedPlatformWorkspace.id, role: 'admin' as const } : null)
  if ((!memberships?.length && !isPlatformAdmin) || !membership) {
    if (isPlatformAdmin) return <AppShell active="platform" pageTitle="Platform overview" userEmail={String(auth.claims.email ?? '')} isPlatformAdmin><section className="panel"><h2>No workspaces yet</h2><p className="muted">Create a customer workspace from the platform console when you are ready.</p><Link className="button" href="/super-admin">Open platform console</Link></section></AppShell>
    const errorKey = typeof params.error === 'string' ? params.error : ''
    return <main className="shell"><div className="app-header"><Brand/><form action={signOut}><button className="button secondary">Sign out</button></form></div><section className="auth-card"><h1>Create your workspace</h1><p className="muted">This creates your customer organization, grants your account the first admin role, and adds a default location.</p>{errorMessages[errorKey] && <div className="error">{errorMessages[errorKey]}</div>}<form action={createOrganization}><div className="field"><label htmlFor="org-name">Workspace name</label><input id="org-name" name="name" required minLength={2} maxLength={120} placeholder="e.g. Haven Cowork"/></div><div className="field"><label htmlFor="org-slug">Workspace URL slug</label><input id="org-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="e.g. haven-cowork"/><small className="muted">Lowercase letters, numbers, and hyphens.</small></div><div className="field"><label htmlFor="industry">Starting customer type</label><select id="industry" name="industry"><option value="general">General / other venue</option><option value="coworking">Coworking</option><option value="office">Office</option><option value="school">School</option><option value="clinic">Clinic</option><option value="industrial">Industrial site</option></select></div><button className="button full">Create secure workspace</button></form></section></main>
  }

  const { data: workspaceOptions } = isPlatformAdmin
    ? { data: platformWorkspaces ?? [] }
    : await supabase.from('organizations').select('id, name').in('id', (memberships ?? []).map(item => item.organization_id)).order('name')

  const [{ data: organization }, { data: visits }, { data: todayVisits }, { data: insideVisits }, { data: member }, { data: branches }, { data: branchRoles }] = await Promise.all([
    supabase.from('organizations').select('id, name, industry').eq('id', membership.organization_id).maybeSingle(),
    supabase.from('visits').select('id, purpose, status, expected_at, host_name, visitor:visitors(full_name, email), branch:locations(name)').eq('organization_id', membership.organization_id).order('expected_at', { ascending: false }).limit(12),
    supabase.from('visits').select('id, purpose, status, expected_at, host_name, visitor:visitors(full_name, email), branch:locations(name)').eq('organization_id', membership.organization_id).gte('expected_at', new Date(new Date().setHours(0,0,0,0)).toISOString()).lt('expected_at', new Date(new Date().setHours(24,0,0,0)).toISOString()).order('expected_at', { ascending: true }).limit(250),
    supabase.from('visits').select('id').eq('organization_id', membership.organization_id).eq('status', 'inside'),
    supabase.from('organization_members').select('role').eq('organization_id', membership.organization_id).eq('user_id', userId).maybeSingle(),
    supabase.from('locations').select('id, name').eq('organization_id', membership.organization_id).order('created_at'),
    supabase.from('location_members').select('location_id, role').eq('organization_id', membership.organization_id).eq('user_id', userId),
  ])
  const canManageFrontDesk = Boolean(isPlatformAdmin) || member?.role === 'admin' || member?.role === 'receptionist' || branchRoles?.some(item => ['admin','receptionist'].includes(item.role))
  const canManageWorkspace = Boolean(isPlatformAdmin) || member?.role === 'admin'
  const issue = typeof params.error === 'string' ? params.error : ''

  const visibleBranches = member?.role === 'admin' || member?.role === 'receptionist' || isPlatformAdmin
    ? branches ?? []
    : member?.role === 'member'
      ? branchRoles?.length
        ? (branches ?? []).filter(branch => branchRoles.some(item => item.location_id === branch.id))
        : branches ?? []
      : (branches ?? []).filter(branch => branchRoles?.some(item => item.location_id === branch.id && ['admin','receptionist'].includes(item.role)))
  const expectedToday = (todayVisits ?? []).filter(visit => visit.status === 'expected').length
  const checkedInToday = (todayVisits ?? []).filter(visit => visit.status === 'inside').length
  const branchVisits = (todayVisits ?? []).reduce<Record<string, number>>((acc, visit) => { const item = Array.isArray(visit.branch) ? visit.branch[0] : visit.branch; if (item?.name) acc[item.name] = (acc[item.name] ?? 0) + 1; return acc }, {})
  const greeting = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date())
  const timeGreeting = Number(greeting) < 12 ? 'Good morning' : Number(greeting) < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = String(auth.claims.email ?? 'there').split('@')[0].split(/[._-]/)[0]
  return <AppShell active="dashboard" pageTitle="Dashboard" workspaceId={membership.organization_id} workspaceName={organization?.name} userEmail={String(auth.claims.email ?? '')} workspaceRole={member?.role ?? (isPlatformAdmin ? undefined : membership.role)} isPlatformAdmin={Boolean(isPlatformAdmin)} canManageWorkspace={canManageWorkspace} canManageFrontDesk={canManageFrontDesk}>
    {!organization ? <section className="panel"><h1>Workspace unavailable</h1><p className="muted">Your workspace could not be loaded. Choose another workspace or ask an administrator to check access.</p></section> : <>
      <section className="dashboard-intro"><div><span className="eyebrow">{organization.name} · TODAY</span><h2>{timeGreeting}, <em>{firstName}</em></h2><p>Here’s what’s happening across your workspace.</p></div>{workspaceOptions && workspaceOptions.length > 1 && <nav className="workspace-switcher" aria-label="Switch workspace">{workspaceOptions.map(item => <Link key={item.id} aria-current={item.id===membership.organization_id?'page':undefined} href={`/?workspace=${item.id}`}>{item.name}</Link>)}</nav>}</section>
      {errorMessages[issue] && <div className="error">{errorMessages[issue]}</div>}
      {!canManageFrontDesk && <div className="notice">Submit visitor requests here. Front desk staff will review and approve or reject each request.</div>}
      <section className="metric-grid" aria-label="Workspace activity">
        <Metric label="Visits today" value={todayVisits?.length ?? 0} detail="Scheduled arrivals" tone="purple"/>
        <Metric label="Expected" value={expectedToday} detail="Guests yet to arrive" tone="blue"/>
        <Metric label="On site" value={insideVisits?.length ?? 0} detail={`${checkedInToday} checked in today`} tone="pink"/>
        <Metric label="Branches" value={branches?.length ?? 0} detail="Locations in workspace" tone="green"/>
      </section>
      <div className="dashboard-grid">
        {(canManageFrontDesk || member?.role === 'member') && <section className="panel dashboard-form"><div className="section-title"><div><span className="eyebrow">{canManageFrontDesk ? 'FRONT DESK' : 'VISITOR REQUEST'}</span><h2>{canManageFrontDesk ? 'Welcome a visitor' : 'Request a visitor visit'}</h2><p className="muted">{canManageFrontDesk ? 'Register an expected arrival and notify their host.' : 'Send visitor details to the front desk for approval.'}</p></div><span className="title-icon">＋</span></div><VisitorForm organizationId={membership.organization_id} branches={visibleBranches} requestMode={!canManageFrontDesk}/><div className="howto">Visitor information is isolated by workspace and enforced by Supabase Row Level Security.</div></section>}
        <section className="panel dashboard-arrivals" id="visitors"><div className="section-title"><div><span className="eyebrow">LIVE ACTIVITY</span><h2>{canManageFrontDesk ? 'Recent arrivals & requests' : 'My visitor requests'}</h2><p className="muted">{canManageFrontDesk ? `The latest visitor activity in ${organization.name}.` : 'Track whether the front desk approved your requests.'}</p></div><span className="count-badge">{visits?.length ?? 0} recent</span></div>{visits?.length ? <div style={{overflowX:'auto'}}><table className="visit-table"><thead><tr><th>VISITOR</th><th>HOST</th><th>BRANCH</th><th>ARRIVAL</th><th>STATUS</th>{canManageFrontDesk&&<th>ACTION</th>}</tr></thead><tbody>{visits.map((visit) => { const guest = Array.isArray(visit.visitor) ? visit.visitor[0] : visit.visitor; const branch = Array.isArray(visit.branch) ? visit.branch[0] : visit.branch; return <tr key={visit.id}><td><b>{guest?.full_name ?? 'Guest'}</b>{guest?.email&&<><br/><span className="muted">{guest.email}</span></>}</td><td>{visit.host_name ?? '—'}</td><td>{branch?.name ?? '—'}</td><td>{new Date(visit.expected_at).toLocaleString()}</td><td><span className={`pill ${visit.status==='expected'?'expected':''}`}>{visit.status.replace('_',' ')}</span></td>{canManageFrontDesk&&<td className="row-actions">{visit.status==='pending'&&<><form action={updateVisitStatus}><input type="hidden" name="visit_id" value={visit.id}/><input type="hidden" name="next_status" value="expected"/><button className="action">Approve</button></form><form action={updateVisitStatus}><input type="hidden" name="visit_id" value={visit.id}/><input type="hidden" name="next_status" value="rejected"/><button className="action">Reject</button></form></>}{visit.status==='expected'&&<form action={updateVisitStatus}><input type="hidden" name="visit_id" value={visit.id}/><input type="hidden" name="next_status" value="inside"/><button className="action">Check in</button></form>}{visit.status==='inside'&&<form action={updateVisitStatus}><input type="hidden" name="visit_id" value={visit.id}/><input type="hidden" name="next_status" value="checked_out"/><button className="action">Check out</button></form>}</td>}</tr>})}</tbody></table></div> : <div className="empty">{canManageFrontDesk ? 'No visits or pending requests yet.' : 'You have not submitted a visitor request yet.'}</div>}</section>
      </div>
      <section className="panel branch-overview"><div className="section-title"><div><span className="eyebrow">LOCATION ACCESS</span><h2>Branch overview</h2><p className="muted">Today’s scheduled visits, grouped by branch.</p></div>{canManageWorkspace && <Link className="text-link" href={`/settings?workspace=${membership.organization_id}&section=branches`}>Manage branches →</Link>}</div><div className="branch-overview-grid">{(branches ?? []).map(branch => { const count = branchVisits[branch.name] ?? 0; return <article className="branch-overview-card" key={branch.id}><span className="branch-symbol"><IconLocation/></span><div><strong>{branch.name}</strong><small>{count} {count === 1 ? 'visit' : 'visits'} today</small></div><span className="branch-count">{count}</span></article>})}</div></section>
    </>}
    <p className="footer">EntryFlow · Keep visitor information private and only collect what your workflow needs.</p>
  </AppShell>
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) { return <article className={`metric-card metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-dot"/></div><strong>{value}</strong><small>{detail}</small></article> }
function IconLocation() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg> }
