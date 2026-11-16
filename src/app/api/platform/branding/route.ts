import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { autoAdjustForDark, contrastRatio, isValidHex } from '@/lib/platform-branding-shared'
import type { PlatformBranding } from '@/lib/platform-branding-shared'

export const runtime = 'nodejs'
const bucket = 'platform-brand-assets'
const defaults: Omit<PlatformBranding, 'configured'> = { product_name: 'Gatewise', logo_light_url: null, logo_dark_url: null, icon_url: null, primary_light: '#4338CA', primary_dark: '#818CF8', auto_adjust_dark: true }

function safeSvg(source: string) {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source) || !/<\/svg>\s*$/i.test(source)) return null
  return source
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])\s*(?:https?:|javascript:|data:|\/\/)[\s\S]*?\1/gi, '')
    .replace(/url\(\s*(["']?)(?!#)[^)]+\)/gi, 'none')
    .replace(/expression\s*\([^)]*\)/gi, '')
}

function isSquareIconSvg(source: string) {
  const viewBox = source.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*["']/i)
  if (viewBox) return Math.abs(Number(viewBox[1]) - Number(viewBox[2])) < 0.01
  const width = source.match(/\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i)
  const height = source.match(/\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i)
  return Boolean(width && height && Math.abs(Number(width[1]) - Number(height[1])) < 0.01)
}

function safeBrandUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin
    return url.origin === supabaseOrigin && url.pathname.includes(`/storage/v1/object/public/${bucket}/`) ? url.toString() : null
  } catch { return null }
}

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) return { response: NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 }) }
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) return { response: NextResponse.json({ error: 'Platform Super Admin access is required.' }, { status: 403 }) }
  return { supabase, userId }
}

export async function POST(request: Request) {
  const access = await requirePlatformAdmin()
  if (access.response) return access.response
  const { supabase, userId } = access
  try {
    const form = await request.formData()
    const mode = form.get('mode') === 'reset' ? 'reset' : 'save'
    const settingsText = String(form.get('settings') ?? '{}')
    const raw = JSON.parse(settingsText) as Record<string, unknown>
    const productName = mode === 'reset' ? defaults.product_name : String(raw.product_name ?? '').trim()
    const lightColor = mode === 'reset' ? defaults.primary_light : String(raw.primary_light ?? '')
    const submittedDark = mode === 'reset' ? defaults.primary_dark : String(raw.primary_dark ?? '')
    const autoDark = mode === 'reset' ? true : raw.auto_adjust_dark === true
    const darkColor = mode === 'reset' ? defaults.primary_dark : autoDark ? autoAdjustForDark(lightColor) : submittedDark
    if (productName.length < 1 || productName.length > 30 || !isValidHex(lightColor) || !isValidHex(darkColor)) {
      return NextResponse.json({ error: 'Enter a product name (1–30 characters) and valid six-digit hex colours.' }, { status: 400 })
    }
    const contrastPass = Math.max(contrastRatio('#FFFFFF', lightColor), contrastRatio('#0F172A', lightColor)) >= 4.5
      && contrastRatio(lightColor, '#F8FAFC') >= 4.5
      && Math.max(contrastRatio('#FFFFFF', darkColor), contrastRatio('#0B1020', darkColor)) >= 4.5
      && contrastRatio(darkColor, '#0B1020') >= 4.5
    if (!contrastPass) return NextResponse.json({ error: 'Both primary colours must pass WCAG AA contrast (4.5:1) against their text and page backgrounds.' }, { status: 400 })

    const next: typeof defaults = mode === 'reset' ? { ...defaults } : {
      product_name: productName,
      logo_light_url: safeBrandUrl(raw.logo_light_url),
      logo_dark_url: safeBrandUrl(raw.logo_dark_url),
      icon_url: safeBrandUrl(raw.icon_url),
      primary_light: lightColor.toUpperCase(), primary_dark: darkColor.toUpperCase(), auto_adjust_dark: autoDark,
    }

    if (mode === 'save') {
      for (const [field, column] of [['logo_light', 'logo_light_url'], ['logo_dark', 'logo_dark_url'], ['icon', 'icon_url']] as const) {
        const file = form.get(field)
        if (!(file instanceof File) || file.size === 0) continue
        if (file.size > 1024 * 1024 || !['image/png', 'image/svg+xml'].includes(file.type)) return NextResponse.json({ error: 'Logo files must be SVG or PNG and smaller than 1 MB.' }, { status: 400 })
        let upload: File | Blob = file
        if (file.type === 'image/svg+xml') {
          const sanitized = safeSvg(await file.text())
          if (!sanitized || /<script\b|\son[a-z]+\s*=|javascript:/i.test(sanitized)) return NextResponse.json({ error: 'This SVG contains unsupported active content.' }, { status: 400 })
          if (field === 'icon' && !isSquareIconSvg(sanitized)) return NextResponse.json({ error: 'The icon mark must use a square SVG viewBox or canvas.' }, { status: 400 })
          upload = new Blob([sanitized], { type: 'image/svg+xml' })
        } else {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
          if (!pngSignature.every((byte, index) => bytes[index] === byte) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return NextResponse.json({ error: 'The uploaded PNG file is not a valid PNG image.' }, { status: 400 })
          const width = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16)
          const height = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20)
          if (field === 'icon' && width !== height) return NextResponse.json({ error: 'The icon mark must be a square PNG image.' }, { status: 400 })
          upload = new Blob([bytes], { type: 'image/png' })
        }
        const extension = file.type === 'image/png' ? 'png' : 'svg'
        const path = `${userId}/${randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, upload, { contentType: file.type, upsert: false, cacheControl: '31536000' })
        if (uploadError) return NextResponse.json({ error: `Logo upload failed: ${uploadError.message}` }, { status: 400 })
        next[column] = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
      }
    }

    const { error: readError } = await supabase.from('platform_branding').select('singleton').eq('singleton', true).maybeSingle()
    if (readError) return NextResponse.json({ error: 'Platform branding storage is not configured. Apply the reviewed platform-branding migration first.' }, { status: 409 })
    const { error: writeError } = await supabase.from('platform_branding').upsert({ singleton: true, ...next, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'singleton' })
    if (writeError) return NextResponse.json({ error: 'Branding could not be saved. Check the platform branding policies.' }, { status: 400 })
    // The approved schema will add a database trigger that writes the audit record
    // inside the same transaction as this upsert.
    revalidatePath('/', 'layout')
    return NextResponse.json({ branding: { ...next, configured: true } })
  } catch {
    return NextResponse.json({ error: 'The branding request could not be processed.' }, { status: 400 })
  }
}
