import Link from 'next/link'
import { redirect } from 'next/navigation'
import { addWorkspaceMember, cancelWorkspaceInvitation, createBranch, deleteBranch, removeLocationMember, setLocationMemberRole, setWorkspaceRole } from '../actions'
import { createClient } from '@/lib/supabase/server'
import { BRAND_CONFIG } from '@/components/brand'
import { AppShell } from '@/components/app-shell'

type Search = Promise<Record<string, string | string[] | undefined>>
type DirectoryMember = { user_id: string; email: string | null; role: 'admin' | 'receptionist' | 'member'; created_at: string }
type BranchAssignment = { user_id: string; location_id: string; role: 'admin' | 'receptionist' | 'member' }
type WorkspaceInvitation = { id: string; email: string; role: 'admin' | 'receptionist' | 'member'; created_at: string }

export default async function Settings({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/')
  const { data: memberships } = await supabase.from('organization_members').select('organization_id, role').eq('user_id', userId)
  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  const orgIds = (memberships ?? []).map(item => item.organization_id)
  const { data: platformOrgs } = isPlatformAdmin ? await supabase.from('organizations').select('id, name').order('name') : { data: [] }
  const { data: ownOrgs } = orgIds.length ? await supabase.from('organizations').select('id, name').in('id', orgIds).order('name') : { data: [] }
  const orgs = isPlatformAdmin ? platformOrgs ?? [] : ownOrgs ?? []
  const selected = typeof params.workspace === 'string' ? params.workspace : orgs[0]?.id
  const organization = orgs.find(item => item.id === selected)
  if (!organization) redirect('/')
  const ownRole = memberships?.find(item => item.organization_id === organization.id)?.role
  if (!isPlatformAdmin && ownRole !== 'admin') redirect('/')
  const [{ data: branches }, { data: members }, { data: assignments }, { data: invitations }] = await Promise.all([
    supabase.from('locations').select('id, name, created_at').eq('organization_id', organization.id).order('created_at'),
    supabase.rpc('get_org_member_directory', { p_organization_id: organization.id }),
    supabase.from('location_members').select('user_id, location_id, role').eq('organization_id', organization.id),
    supabase.rpc('list_workspace_invitations', { p_organization_id: organization.id }),
  ])
  const error = typeof params.error === 'string' ? params.error : ''
  const saved = typeof params.saved === 'string' ? params.saved : ''
  const section = params.section === 'branches' ? 'branches' : 'staff'
  const assignmentRows = (assignments ?? []) as BranchAssignment[]
  const search = typeof params.q === 'string' ? params.q.trim().toLowerCase() : ''
  const directory = (members as DirectoryMember[] | null) ?? []
  const filteredMembers = search ? directory.filter(person => `${person.email ?? ''} ${person.role}`.toLowerCase().includes(search)) : directory
  return <AppShell active={section} pageTitle="Administration" workspaceId={organization.id} workspaceName={organization.name} userEmail={String(auth.claims.email ?? '')} workspaceRole={ownRole ?? undefined} isPlatformAdmin={Boolean(isPlatformAdmin)}>
    <div className="page-intro"><p>Give staff the access they need, branch by branch.</p><nav className="admin-tabs" aria-label="Administration sections"><Link aria-current={section === 'staff' ? 'page' : undefined} href={`/staff?workspace=${organization.id}`}>Users</Link><Link aria-current={section === 'branches' ? 'page' : undefined} href={`/branches?workspace=${organization.id}`}>Branches</Link></nav></div>
    {orgs.length > 1 && <nav className="workspace-switcher" aria-label="Choose workspace">{orgs.map(org => <Link key={org.id} href={`/${section}?workspace=${org.id}`} aria-current={org.id === organization.id ? 'page' : undefined}>{org.name}</Link>)}</nav>}
    {error && <div className="error">{error === 'role' ? 'Role update failed. Keep at least one workspace admin.' : error === 'branch' ? 'Branch change failed. It may be in use by visit history, or the branch name may already exist.' : error === 'member' ? 'We could not add this person. Check the email, plan capacity, and workspace access.' : error === 'invite_config' ? 'Email invites need SUPABASE_SECRET_KEY in the server environment. Add it to .env.local and restart Next.js.' : error === 'invite' ? 'The invite email could not be sent. Check Supabase Auth email settings and try again.' : error === 'assignment' ? 'Branch assignment failed. Check the selected workspace member and branch.' : 'Please check the submitted values.'}</div>}
      {saved === 'invite' ? <div className="notice">Invitation sent. The person will get workspace access after confirming their email.</div> : saved === 'invitation_removed' ? <div className="notice">Pending invitation removed.</div> : saved && <div className="notice">Changes saved.</div>}
    {section === 'branches' ? <section className="panel administration-panel"><div className="panel-heading"><div><h2>Branches</h2><p className="muted">Create locations and assign staff to each one from the Users tab.</p></div><span className="count-badge">{branches?.length ?? 0} locations</span></div>
      <form action={createBranch} className="add-branch-form"><input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="return_to" value={section}/><div className="field"><label htmlFor="branch-name">Branch name</label><input id="branch-name" name="name" required maxLength={120} placeholder="e.g. Downtown"/></div><button className="button">Add branch</button></form>
      <div className="branch-grid">{branches?.map(branch => <article className="branch-card" key={branch.id}><span className="branch-symbol"><IconBranch/></span><div><h3>{branch.name}</h3><p>{assignmentRows.filter(row => row.location_id === branch.id).length} assigned staff</p></div><Link href={`/staff?workspace=${organization.id}&branch=${branch.id}`}>Manage staff</Link>{branches.length > 1 && <form action={deleteBranch}><input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="branch_id" value={branch.id}/><input type="hidden" name="return_to" value={section}/><button className="action danger">Remove</button></form>}</article>)}</div>
      <p className="muted branch-footnote">The last branch cannot be removed. Visit history protects branches already in use.</p>
    </section> : <>
      <section className="panel administration-panel"><div className="panel-heading"><div><h2>Users</h2><p className="muted">Add workspace accounts, set their base role, and assign branch-level access.</p></div><span className="count-badge">{directory.length} users</span></div>
        <form action={addWorkspaceMember} className="add-user-form"><input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="return_to" value={section}/><div className="field"><label htmlFor="staff-email">Work email</label><input id="staff-email" name="email" type="email" required placeholder="staff@company.com"/></div><div className="field"><label htmlFor="staff-role">Workspace role</label><select id="staff-role" name="role" defaultValue="member"><option value="admin">Workspace admin</option><option value="receptionist">Front desk</option><option value="member">Member</option></select></div><button className="button">Invite staff member</button></form>
      </section>
      <section className="panel administration-panel staff-directory"><div className="directory-toolbar"><div><strong>Workspace access</strong><small>Platform Super Admin has global access. These roles apply inside this workspace.</small></div><form method="get" className="directory-search"><input type="hidden" name="workspace" value={organization.id}/><input type="hidden" name="section" value="staff"/><input name="q" defaultValue={typeof params.q === 'string' ? params.q : ''} aria-label="Search staff" placeholder="Search name or email"/><button className="action">Search</button></form></div><div className="staff-table-head"><span>NAME / EMAIL</span><span>WORKSPACE ROLE</span><span>BRANCH ACCESS</span></div>
        {filteredMembers.map(member => {
          const userAssignments = assignmentRows.filter(row => row.user_id === member.user_id)
          return <article className="staff-record" key={member.user_id}>
            <div className="staff-identity"><span className="avatar staff-avatar">{(member.email?.[0] ?? 'U').toUpperCase()}</span><span><strong>{member.email ?? 'Email unavailable'}</strong><small>Added {new Date(member.created_at).toLocaleDateString()}</small></span></div>
            <form action={setWorkspaceRole} className="role-change-form"><input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="return_to" value={section}/><input type="hidden" name="user_id" value={member.user_id}/><select name="role" defaultValue={member.role} aria-label={`Workspace role for ${member.email}`}><option value="admin">Workspace admin</option><option value="receptionist">Front desk</option><option value="member">Member</option></select><button className="action">Save</button></form>
            <div className="branch-access"><div className="assignment-chips">{userAssignments.length ? userAssignments.map(row => { const branch = branches?.find(item => item.id === row.location_id); return <span className="assignment-chip" key={row.location_id}>{branch?.name ?? 'Branch'} · {row.role}{member.role !== 'admin' && <form action={removeLocationMember}><input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="return_to" value={section}/><input type="hidden" name="location_id" value={row.location_id}/><input type="hidden" name="user_id" value={member.user_id}/><button aria-label={`Remove ${branch?.name ?? 'branch'} assignment`} className="chip-remove">×</button></form>}</span>}) : <span className="muted">No branch access assigned</span>}</div>
              {member.role !== 'admin' && branches?.length ? <form action={setLocationMemberRole} className="assignment-form"><input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="return_to" value={section}/><input type="hidden" name="user_id" value={member.user_id}/><select name="location_id" aria-label={`Branch for ${member.email}`} defaultValue={typeof params.branch === 'string' && branches.some(item=>item.id===params.branch) ? params.branch : branches[0].id}><option value="" disabled>Choose branch</option>{branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select><select name="role" aria-label={`Branch role for ${member.email}`} defaultValue="receptionist"><option value="admin">Branch admin</option><option value="receptionist">Front desk</option><option value="member">Member</option></select><button className="action">Assign</button></form> : null}
            </div>
          </article>
        })}{!filteredMembers.length && <div className="empty">{search ? 'No users match your search.' : 'No workspace users yet.'}</div>}
      </section>
      {(invitations as WorkspaceInvitation[] | null)?.length ? <section className="panel administration-panel pending-invites"><div className="panel-heading"><div><h2>Pending invitations</h2><p className="muted">These email addresses get access after confirming the invitation.</p></div><span className="count-badge">{(invitations as WorkspaceInvitation[]).length} pending</span></div>{(invitations as WorkspaceInvitation[]).map(invite => <article className="pending-invite-row" key={invite.id}><div><strong>{invite.email}</strong><small>{invite.role} · sent {new Date(invite.created_at).toLocaleDateString()}</small></div><form action={cancelWorkspaceInvitation}><input type="hidden" name="organization_id" value={organization.id}/><input type="hidden" name="return_to" value={section}/><input type="hidden" name="invitation_id" value={invite.id}/><button className="action danger">Revoke</button></form></article>)}</section> : null}
      <div className="role-help"><strong>Role levels</strong><span><b>Platform Super Admin</b> manages the whole {BRAND_CONFIG.name} platform. <b>Workspace admin</b> manages every branch in one workspace. <b>Branch admin / Front desk</b> gets access only to assigned branches.</span></div>
    </>}
  </AppShell>
}

function IconBranch() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V9h6v12M9 12h6M9 16h6"/></svg> }
