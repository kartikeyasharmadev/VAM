import type { MetadataRoute } from 'next'
import { DEFAULT_LIGHT_BACKGROUND } from '@/lib/brand-config'
import { getPlatformBranding } from '@/lib/platform-branding'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getPlatformBranding()
  return {
    id: '/',
    name: branding.product_name,
    short_name: branding.product_name.slice(0, 12),
    description: 'Visitor check-in and branch management for your workspace.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: branding.primary_light,
    background_color: DEFAULT_LIGHT_BACKGROUND,
    lang: 'en',
    categories: ['business', 'productivity'],
    icons: [
      ...(branding.icon_url ? [{ src: branding.icon_url, sizes: 'any', type: branding.icon_url.toLowerCase().includes('.png') ? 'image/png' : 'image/svg+xml', purpose: 'any' as const }] : []),
      { src: '/icons/gatewise-48.png', sizes: '48x48', type: 'image/png' },
      { src: '/icons/gatewise-72.png', sizes: '72x72', type: 'image/png' },
      { src: '/icons/gatewise-96.png', sizes: '96x96', type: 'image/png' },
      { src: '/icons/gatewise-144.png', sizes: '144x144', type: 'image/png' },
      { src: '/icons/gatewise-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/gatewise-256.png', sizes: '256x256', type: 'image/png' },
      { src: '/icons/gatewise-384.png', sizes: '384x384', type: 'image/png' },
      { src: '/icons/gatewise-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/gatewise-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/gatewise-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcuts: [
      { name: 'Check in visitor', short_name: 'Check in', url: '/' },
      { name: 'Visitors today', short_name: 'Visitors', url: '/visitors' },
      { name: 'Dashboard', short_name: 'Dashboard', url: '/' },
    ],
  }
}
