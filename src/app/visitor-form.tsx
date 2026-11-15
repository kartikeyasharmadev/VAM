'use client'

import { useState, type FormEvent } from 'react'
import { createVisit } from './actions'

export function VisitorForm({ organizationId, branches, requestMode = false }: { organizationId: string; branches: { id: string; name: string }[]; requestMode?: boolean }) {
  const [arrival, setArrival] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))
  function submit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget
    const value = new FormData(form).get('expected_local')
    const iso = value ? new Date(String(value)).toISOString() : ''
    const hidden = form.elements.namedItem('expected_at_iso')
    if (hidden instanceof HTMLInputElement) hidden.value = iso
  }
  return <form action={createVisit} onSubmit={submit}>
    <input type="hidden" name="organization_id" value={organizationId}/>
    <input type="hidden" name="expected_at_iso" value=""/>
    <div className="field"><label htmlFor="visitor-name">Visitor name</label><input id="visitor-name" name="visitor_name" required maxLength={120} placeholder="e.g. Jordan Lee"/></div>
    <div className="field"><label htmlFor="visitor-email">Visitor email <span className="muted">(optional)</span></label><input id="visitor-email" name="email" type="email" maxLength={254} placeholder="guest@example.com"/></div>
    <div className="field"><label htmlFor="host-name">Host / member</label><input id="host-name" name="host_name" required maxLength={120} placeholder="Who are they visiting?"/></div>
    <div className="field"><label htmlFor="branch-id">Branch</label><select id="branch-id" name="location_id" required defaultValue={branches[0]?.id ?? ''}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
    <div className="field"><label htmlFor="purpose">Purpose</label><select id="purpose" name="purpose"><option>Meeting</option><option>Tour</option><option>Event</option><option>Delivery</option><option>Other</option></select></div>
    <div className="field"><label htmlFor="expected-at">Expected arrival</label><input id="expected-at" name="expected_local" type="datetime-local" required value={arrival} onChange={event => setArrival(event.target.value)}/></div>
    <button className="button full">{requestMode ? 'Submit visitor request' : 'Add visitor'}</button>
  </form>
}
