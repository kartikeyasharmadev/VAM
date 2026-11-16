import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_PLATFORM_BRANDING, type PlatformBranding } from './platform-branding-shared'

export { DEFAULT_PLATFORM_BRANDING } from './platform-branding-shared'
export type { PlatformBranding } from './platform-branding-shared'

export const getPlatformBranding = cache(async (): Promise<PlatformBranding> => {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('platform_branding').select('product_name,logo_light_url,logo_dark_url,icon_url,primary_light,primary_dark,auto_adjust_dark').eq('singleton', true).maybeSingle()
    if (error || !data) return DEFAULT_PLATFORM_BRANDING
    return { ...data, configured: true }
  } catch {
    return DEFAULT_PLATFORM_BRANDING
  }
})
