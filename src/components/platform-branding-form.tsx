'use client'

import { useMemo, useState } from 'react'
import type { PlatformBranding } from '@/lib/platform-branding-shared'
import { autoAdjustForDark, contrastRatio, DEFAULT_PLATFORM_BRANDING, isValidHex, PLATFORM_COLOR_PRESETS } from '@/lib/platform-branding-shared'
import { DEFAULT_DARK_BACKGROUND, DEFAULT_LIGHT_PRIMARY, DEFAULT_LIGHT_BACKGROUND, DEFAULT_LIGHT_TEXT, DEFAULT_DARK_PRIMARY, DEFAULT_WHITE } from '@/lib/brand-config'
type PreviewMode = 'light' | 'dark'
type LogoKey = 'logo_light' | 'logo_dark' | 'icon'

export function PlatformBrandingForm({ initial }: { initial: PlatformBranding }) {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const [files, setFiles] = useState<Partial<Record<LogoKey, File>>>({})
  const [previews, setPreviews] = useState<Partial<Record<LogoKey, string>>>({})
  const [previewMode, setPreviewMode] = useState<PreviewMode>('light')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = JSON.stringify(form) !== JSON.stringify(saved) || Object.keys(files).length > 0

  const checks = useMemo(() => {
    if (!isValidHex(form.primary_light) || !isValidHex(form.primary_dark)) return [0, 0, 0, 0]
    const lightText = Math.max(contrastRatio(DEFAULT_WHITE, form.primary_light), contrastRatio(DEFAULT_LIGHT_TEXT, form.primary_light))
    const lightSurface = contrastRatio(form.primary_light, DEFAULT_LIGHT_BACKGROUND)
    const darkText = Math.max(contrastRatio(DEFAULT_WHITE, form.primary_dark), contrastRatio(DEFAULT_DARK_BACKGROUND, form.primary_dark))
    const darkSurface = contrastRatio(form.primary_dark, DEFAULT_DARK_BACKGROUND)
    return [lightText, lightSurface, darkText, darkSurface]
  }, [form.primary_light, form.primary_dark])
  const contrastPass = isValidHex(form.primary_light) && isValidHex(form.primary_dark) && checks.every(value => value >= 4.5)

  function update<K extends keyof PlatformBranding>(key: K, value: PlatformBranding[K]) {
    setForm(current => ({ ...current, [key]: value, ...(key === 'primary_light' && current.auto_adjust_dark && typeof value === 'string' ? { primary_dark: autoAdjustForDark(value) } : {}) }))
  }

  function selectFile(key: LogoKey, file?: File) {
    setError('')
    if (!file) return
    if (!['image/png', 'image/svg+xml'].includes(file.type) || file.size > 1024 * 1024) {
      setError('Choose an SVG or PNG file smaller than 1 MB.')
      return
    }
    setFiles(current => ({ ...current, [key]: file }))
    const reader = new FileReader()
    reader.onload = () => setPreviews(current => ({ ...current, [key]: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  async function save(mode: 'save' | 'reset' = 'save') {
    if (mode === 'save' && (!contrastPass || !isValidHex(form.primary_light) || !isValidHex(form.primary_dark))) return
    setBusy(true); setError(''); setToast('')
    try {
      const body = new FormData()
      body.set('mode', mode)
      body.set('settings', JSON.stringify(mode === 'reset' ? { ...DEFAULT_PLATFORM_BRANDING, configured: undefined } : { ...form, configured: undefined }))
      if (mode === 'save') for (const [key, file] of Object.entries(files)) if (file) body.set(key, file)
      const response = await fetch('/api/platform/branding', { method: 'POST', body })
      const result = await response.json() as { branding?: PlatformBranding; error?: string }
      if (!response.ok || !result.branding) throw new Error(result.error || 'Could not save platform branding.')
      setSaved(result.branding); setForm(result.branding); setFiles({}); setPreviews({}); setToast(mode === 'reset' ? 'Gatewise defaults restored.' : 'Branding saved across the platform.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save platform branding.')
    } finally { setBusy(false) }
  }

  function discard() { setForm(saved); setFiles({}); setPreviews({}); setError(''); setToast('Changes discarded.') }

  const currentLogo = previewMode === 'dark'
    ? previews.logo_dark ?? form.logo_dark_url ?? previews.logo_light ?? form.logo_light_url
    : previews.logo_light ?? form.logo_light_url
  const mark = previews.icon ?? form.icon_url
  const pageName = form.product_name.trim() || 'Product name'
  const primary = previewMode === 'dark' ? form.primary_dark : form.primary_light

  return <div className="platform-branding-layout">
    <section className="panel platform-branding-settings">
      {!initial.configured && <div className="notice">The platform branding schema has not been applied yet. Review and approve the migration before saving settings.</div>}
      {dirty && <div className="branding-unsaved" role="status">You have unsaved changes. <button type="button" onClick={discard}>Discard changes</button></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {toast && <p className="notice" role="status">{toast}</p>}

      <section className="branding-section"><span className="eyebrow">PRODUCT IDENTITY</span><h3>Product name</h3><p className="muted">Shown in the app navigation, browser title, sign-in screens, and install prompt.</p>
        <div className="field"><label htmlFor="platform-product-name">Product name</label><input id="platform-product-name" value={form.product_name} maxLength={30} onChange={event => update('product_name', event.target.value)}/><small className="muted">Up to 30 characters.</small></div>
      </section>

      <section className="branding-section"><span className="eyebrow">LOGO ASSETS</span><h3>Platform logos</h3><p className="muted">SVG and PNG only, maximum 1 MB each. Dark mode falls back to the light logo.</p>
        <LogoField id="logo-light" label="Full logo for light mode" accept="image/png,image/svg+xml" value={form.logo_light_url} onFile={file => selectFile('logo_light', file)} preview={previews.logo_light}/>
        <LogoField id="logo-dark" label="Full logo for dark mode (optional)" accept="image/png,image/svg+xml" value={form.logo_dark_url} onFile={file => selectFile('logo_dark', file)} preview={previews.logo_dark}/>
        <LogoField id="icon-mark" label="Icon mark / favicon / PWA icon" accept="image/png,image/svg+xml" value={form.icon_url} onFile={file => selectFile('icon', file)} preview={previews.icon}/>
        <button type="button" className="button secondary" onClick={() => { setFiles({}); setPreviews({}); update('logo_light_url', null); update('logo_dark_url', null); update('icon_url', null) }}>Use default Gatewise logo</button>
      </section>

      <section className="branding-section"><span className="eyebrow">BRAND COLOURS</span><h3>Primary colour</h3><p className="muted">Set eight curated colours or enter an accessible custom hex value.</p>
        <fieldset className="brand-color-fieldset"><legend>Light mode primary</legend><ColorControl value={form.primary_light} onChange={value => update('primary_light', value)} name="primary-light"/></fieldset>
        <fieldset className="brand-color-fieldset"><legend>Dark mode primary</legend><label className="checkbox-line"><input type="checkbox" checked={form.auto_adjust_dark} onChange={event => setForm(current => ({ ...current, auto_adjust_dark: event.target.checked, ...(event.target.checked ? { primary_dark: autoAdjustForDark(current.primary_light) } : {}) }))}/> Auto-adjust for dark mode (recommended)</label>{!form.auto_adjust_dark && <ColorControl value={form.primary_dark} onChange={value => update('primary_dark', value)} name="primary-dark"/>}</fieldset>
        <div className="accessibility-check"><strong>{contrastPass ? 'AA contrast passes' : 'Contrast needs adjustment'}</strong><span>Text on primary and primary on each mode’s background must each reach 4.5:1.</span><small>Light: {checks[0].toFixed(2)}:1 / {checks[1].toFixed(2)}:1 · Dark: {checks[2].toFixed(2)}:1 / {checks[3].toFixed(2)}:1</small>{!contrastPass && <button type="button" className="action" onClick={() => { setForm(current => ({ ...current, primary_light: DEFAULT_LIGHT_PRIMARY, primary_dark: DEFAULT_DARK_PRIMARY })) }}>Use accessible Gatewise indigo</button>}</div>
      </section>

      <div className="branding-actions"><button className="button" type="button" disabled={busy || !initial.configured || !contrastPass} onClick={() => save()}>{busy ? 'Saving…' : 'Save changes'}</button><button className="button secondary" type="button" disabled={busy || !initial.configured} onClick={() => save('reset')}>Reset to default</button><button className="button-outline" type="button" disabled={busy || !dirty} onClick={discard}>Discard changes</button></div>
    </section>

    <aside className="platform-branding-preview" aria-label="Live product preview">
      <div className="preview-controls">
        <div>
          <span className="eyebrow">LIVE PREVIEW</span>
          <h3>Product appearance</h3>
        </div>
        <div className="preview-mode-toggle" role="group" aria-label="Preview color mode">
          <button type="button" className={`preview-mode-btn ${previewMode === 'light' ? 'active' : ''}`} aria-pressed={previewMode === 'light'} onClick={() => setPreviewMode('light')}>Light</button>
          <button type="button" className={`preview-mode-btn ${previewMode === 'dark' ? 'active' : ''}`} aria-pressed={previewMode === 'dark'} onClick={() => setPreviewMode('dark')}>Dark</button>
        </div>
      </div>

      <div className={`mini-platform-preview mini-platform-preview-${previewMode}`} style={{ '--preview-primary': primary } as React.CSSProperties}>
        {/* Row 1: Header */}
        <div className="mini-preview-header">
          <div className="mini-preview-brand-area">
            {mark ? <img src={mark} alt="" className="mini-preview-logo" /> : currentLogo ? <img src={currentLogo} alt="" className="mini-preview-logo" /> : <span className="mini-preview-mark">G</span>}
            <strong className="mini-preview-brand-name">{pageName}</strong>
            <span className="mini-preview-divider" />
            <span className="mini-preview-label">Platform console</span>
          </div>
          <div className="mini-preview-actions">
            <span className="mini-preview-avatar">S</span>
          </div>
        </div>

        {/* Row 2: Tabs */}
        <div className="mini-preview-tabs">
          <span className="mini-preview-tab active">Overview</span>
          <span className="mini-preview-tab">Workspaces</span>
          <span className="mini-preview-tab">Plans</span>
          <span className="mini-preview-tab">Billing</span>
        </div>

        {/* Preview Content Area: Button + Stat Card */}
        <div className="mini-preview-body">
          <div className="mini-preview-stat-card">
            <div className="mini-preview-stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 21V9h6v12"/>
              </svg>
            </div>
            <div>
              <small>Workspaces</small>
              <strong>128</strong>
              <span>+12% this month</span>
            </div>
          </div>
          <button type="button" className="mini-preview-button">Create workspace</button>
        </div>
      </div>
      <p className="muted">Brand changes update the full application, including browser metadata and the PWA manifest.</p>
    </aside>
  </div>
}

function LogoField({ id, label, accept, value, preview, onFile }: { id: string; label: string; accept: string; value: string | null; preview?: string; onFile: (file?: File) => void }) {
  return <div className="logo-field"><label htmlFor={id}>{label}</label><input id={id} type="file" accept={accept} onChange={event => onFile(event.target.files?.[0])}/>{(preview || value) && <div className="logo-preview-tile"><img src={preview || value || ''} alt={`${label} preview`}/></div>}</div>
}

function ColorControl({ value, onChange, name }: { value: string; onChange: (value: string) => void; name: string }) {
  return <><div className="color-input-row"><input type="color" aria-label={`${name} color picker`} value={isValidHex(value) ? value : DEFAULT_LIGHT_PRIMARY} onChange={event => onChange(event.target.value.toUpperCase())}/><label htmlFor={`${name}-hex`}>Hex value</label><input id={`${name}-hex`} value={value} maxLength={7} onChange={event => onChange(event.target.value.toUpperCase())} aria-label={`${name} hex value`}/></div><div className="color-presets" aria-label="Curated color presets">{PLATFORM_COLOR_PRESETS.map(preset => <button key={preset.name} type="button" aria-label={`Set ${preset.name}`} title={preset.name} style={{ '--swatch': preset.color } as React.CSSProperties} onClick={() => onChange(preset.color)}/>)}</div></>
}
