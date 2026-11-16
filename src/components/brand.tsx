import Link from 'next/link'
import { getPlatformBranding } from '@/lib/platform-branding'
export { BRAND_CONFIG } from '@/lib/brand-config'

export function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={`brand-mark ${className}`} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M10 33V10.5L20 5l10 5.5V33H10Z" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round"/>
    <path d="M16 33V20h8v13M15 14l3.2 3.2 6.8-7" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}

export async function Brand({ logoUrl, name, iconOnly = false }: { logoUrl?: string | null; name?: string; iconOnly?: boolean }) {
  const branding = await getPlatformBranding()
  const displayName = name ?? branding.product_name
  const lightLogo = branding.logo_light_url ?? branding.logo_dark_url
  const darkLogo = branding.logo_dark_url ?? branding.logo_light_url
  const icon = branding.icon_url
  return <Link className={`brand${iconOnly ? ' brand-icon-only' : ''}`} href="/" aria-label={`${displayName} home`}>
    {iconOnly && icon ? <img className="brand-mark custom-brand-mark" src={icon} alt=""/> : logoUrl ? <img className="brand-mark custom-brand-mark" src={logoUrl} alt=""/> : lightLogo || darkLogo ? <span className="brand-image-stack" aria-hidden="true">{lightLogo && <img className="brand-mark custom-brand-mark brand-logo-light" src={lightLogo} alt=""/>}{darkLogo && darkLogo !== lightLogo && <img className="brand-mark custom-brand-mark brand-logo-dark" src={darkLogo} alt=""/>}</span> : <BrandMark/>}
    {!iconOnly && <span>{displayName}</span>}
  </Link>
}
