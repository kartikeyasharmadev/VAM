'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createVisit } from './actions'

export function VisitorForm({ organizationId, branches, requestMode = false }: { organizationId: string; branches: { id: string; name: string }[]; requestMode?: boolean }) {
  const [arrival, setArrival] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoConsent, setPhotoConsent] = useState(false)
  const [photoIssue, setPhotoIssue] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const photoInput = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const previewObjectUrl = useRef('')

  useEffect(() => {
    if (!cameraOpen) return
    let cancelled = false
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(media => {
      if (cancelled) { media.getTracks().forEach(track => track.stop()); return }
      stream.current = media
      if (video.current) video.current.srcObject = media
      setCameraReady(true)
    }).catch(() => setCameraError('Camera permission was denied or no camera is available. You can still upload a photo.'))
    return () => { cancelled = true; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null }
  }, [cameraOpen])

  useEffect(() => {
    return () => { if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current) }
  }, [])

  function replacePhoto(file: File | null) {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
    previewObjectUrl.current = file ? URL.createObjectURL(file) : ''
    setPhotoPreview(previewObjectUrl.current)
    setPhoto(file)
  }

  function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera is unavailable here. Use the photo upload control instead.')
      setCameraOpen(true)
      return
    }
    setCameraError('')
    setCameraReady(false)
    setCameraOpen(true)
  }

  function closeCamera() {
    setCameraReady(false)
    setCameraOpen(false)
  }

  function capturePhoto() {
    const source = video.current
    if (!source || !source.videoWidth) return
    const scale = Math.min(1, 1280 / source.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(source.videoWidth * scale)
    canvas.height = Math.round(source.videoHeight * scale)
    const context = canvas.getContext('2d')
    context?.drawImage(source, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], `visitor-${Date.now()}.jpg`, { type: 'image/jpeg' })
      if (file.size > 5 * 1024 * 1024) { setPhotoIssue('The captured photo is larger than 5 MB. Move closer and try again.'); return }
      if (photoInput.current) {
        const transfer = new DataTransfer()
        transfer.items.add(file)
        photoInput.current.files = transfer.files
      }
      replacePhoto(file)
      setPhotoIssue('')
      closeCamera()
    }, 'image/jpeg', 0.86)
  }

  function choosePhoto(file?: File) {
    setPhotoIssue('')
    if (!file) { replacePhoto(null); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setPhotoIssue('Choose a JPG, PNG, or WebP image under 5 MB.')
      if (photoInput.current) photoInput.current.value = ''
      replacePhoto(null)
      return
    }
    replacePhoto(file)
  }

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
    <div className="field"><label htmlFor="visitor-company">Company <span className="muted">(optional)</span></label><input id="visitor-company" name="company_name" maxLength={120} placeholder="Company or organization"/></div>
    <div className="field"><label htmlFor="visitor-phone">Mobile number <span className="muted">(optional)</span></label><input id="visitor-phone" name="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="+91 98765 43210"/></div>
    <div className="field"><label htmlFor="host-name">Host / member</label><input id="host-name" name="host_name" required maxLength={120} placeholder="Who are they visiting?"/></div>
    <div className="field"><label htmlFor="branch-id">Branch</label><select id="branch-id" name="location_id" required defaultValue={branches[0]?.id ?? ''}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
    <div className="field"><label htmlFor="purpose">Purpose</label><select id="purpose" name="purpose"><option>Meeting</option><option>Tour</option><option>Event</option><option>Delivery</option><option>Other</option></select></div>
    <div className="field"><label htmlFor="expected-at">Expected arrival</label><input id="expected-at" name="expected_local" type="datetime-local" required value={arrival} onChange={event => setArrival(event.target.value)}/></div>
    <section className="visitor-photo-field" aria-labelledby="visitor-photo-title">
      <div><strong id="visitor-photo-title">Visitor photo <span className="muted">(optional)</span></strong><p className="muted">A photo helps the front desk identify the arriving guest. Keep it only for visitor management.</p></div>
      <label className="checkbox-line visitor-photo-consent"><input type="checkbox" name="photo_consent" value="yes" checked={photoConsent} required={Boolean(photo)} onChange={event => setPhotoConsent(event.target.checked)}/> I have the visitor’s permission to capture and use this photo for check-in.</label>
      <div className="visitor-photo-controls"><button className="button secondary" type="button" disabled={!photoConsent} onClick={() => photoInput.current?.click()}>Upload / take photo</button><input ref={photoInput} className="sr-only" id={`visitor-photo-${organizationId}`} name="visitor_photo" type="file" aria-label="Upload or take visitor photo" accept="image/jpeg,image/png,image/webp" capture="user" onChange={event => choosePhoto(event.target.files?.[0])}/><button className="button-outline" type="button" disabled={!photoConsent} onClick={openCamera}>Use live camera</button>{photo && <button className="button-outline" type="button" onClick={() => { if (photoInput.current) photoInput.current.value = ''; replacePhoto(null) }}>Remove photo</button>}</div>
      {photoIssue && <small className="error" role="alert">{photoIssue}</small>}
      {photoPreview && <div className="visitor-photo-preview"><img src={photoPreview} alt="Visitor photo preview"/><span>{photo?.name ?? 'Visitor photo'}</span></div>}
      {!photoConsent && <small className="muted">Ask the visitor first. Photo capture stays optional.</small>}
      {cameraOpen && <div className="camera-capture" role="dialog" aria-modal="true" aria-label="Capture visitor photo"><div className="camera-capture-heading"><strong>Take a live photo</strong><button className="button-outline" type="button" onClick={closeCamera}>Close</button></div>{cameraError ? <p className="error" role="alert">{cameraError}</p> : <video ref={video} autoPlay playsInline muted/>}<div className="camera-capture-actions"><button className="button" type="button" disabled={!photoConsent || Boolean(cameraError) || !cameraReady} onClick={capturePhoto}>Capture photo</button><span className="muted">Camera access is used only while this capture panel is open.</span></div></div>}
    </section>
    <button className="button full">{requestMode ? 'Submit visitor request' : 'Add visitor'}</button>
  </form>
}
