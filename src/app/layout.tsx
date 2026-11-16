import type { Metadata, Viewport } from 'next'
import './globals.css'
import './theme-tokens.css'
import './palette-tokens.css'
import { cookies } from 'next/headers'
import { PwaSetup } from '@/components/pwa-setup'
import { ThemeProvider, type ThemeChoice } from '@/components/theme-provider'
import { getPlatformBranding } from '@/lib/platform-branding'

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPlatformBranding()
  const customIcon = branding.icon_url ? [{ url: branding.icon_url }] : []
  return {
    title: `${branding.product_name} — Arrivals, handled.`,
    description: 'A calmer front desk for every workspace. Guest check-in, branch management, and visitor history in one place.',
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: branding.product_name, statusBarStyle: 'black-translucent' },
    icons: {
      icon: [...customIcon, { url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: 'any' }],
      apple: [{ url: branding.icon_url?.toLowerCase().includes('.png') ? branding.icon_url : '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const branding = await getPlatformBranding()
  const theme = (await cookies()).get('gatewise-theme')?.value
  const themeColor = theme === 'dark' ? branding.primary_dark : branding.primary_light
  return { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: [
    { media: '(prefers-color-scheme: light)', color: theme === 'system' || !theme ? branding.primary_light : themeColor },
    { media: '(prefers-color-scheme: dark)', color: theme === 'system' || !theme ? branding.primary_dark : themeColor },
  ], colorScheme: 'light dark' }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieTheme = (await cookies()).get('gatewise-theme')?.value
  const initialTheme: ThemeChoice = cookieTheme === 'light' || cookieTheme === 'dark' ? cookieTheme : 'system'
  const branding = await getPlatformBranding()
  return <html lang="en" data-theme={initialTheme} suppressHydrationWarning><body style={{ '--brand-primary-light': branding.primary_light, '--brand-primary-dark': branding.primary_dark } as React.CSSProperties}><ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider><PwaSetup/></body></html>
}
