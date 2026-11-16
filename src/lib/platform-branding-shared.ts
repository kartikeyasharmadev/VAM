import { DEFAULT_DARK_PRIMARY, DEFAULT_LIGHT_PRIMARY, DEFAULT_DARK_BACKGROUND } from './brand-config'

export type PlatformBranding = {
  product_name: string
  logo_light_url: string | null
  logo_dark_url: string | null
  icon_url: string | null
  primary_light: string
  primary_dark: string
  auto_adjust_dark: boolean
  configured: boolean
}

export const DEFAULT_PLATFORM_BRANDING: PlatformBranding = {
  product_name: 'Gatewise', logo_light_url: null, logo_dark_url: null, icon_url: null,
  primary_light: DEFAULT_LIGHT_PRIMARY, primary_dark: DEFAULT_DARK_PRIMARY, auto_adjust_dark: true, configured: false,
}

export const PLATFORM_COLOR_PRESETS = [
  { name: 'Indigo', color: '#4338CA' }, { name: 'Blue', color: '#1D4ED8' },
  { name: 'Teal', color: '#0F766E' }, { name: 'Emerald', color: '#047857' },
  { name: 'Violet', color: '#6D28D9' }, { name: 'Rose', color: '#BE123C' },
  { name: 'Amber', color: '#B45309' }, { name: 'Slate', color: '#334155' },
] as const

export function isValidHex(value: string) { return /^#[0-9a-f]{6}$/i.test(value) }

export function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/.{2}/g)!.map(pair => parseInt(pair, 16) / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
  }
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

export function autoAdjustForDark(hex: string) {
  const ratio = (a: string, b: string) => contrastRatio(a, b)
  const rgb = (value: string) => value.slice(1).match(/.{2}/g)!.map(part => parseInt(part, 16))
  const toHex = (parts: number[]) => `#${parts.map(part => Math.round(part).toString(16).padStart(2, '0')).join('')}`
  const source = rgb(hex)
  for (let mix = 0; mix <= 100; mix++) {
    const adjusted = toHex(source.map(channel => channel + (255 - channel) * mix / 100))
    if (ratio(adjusted, DEFAULT_DARK_BACKGROUND) >= 4.5 && Math.max(ratio(adjusted, '#FFFFFF'), ratio(adjusted, DEFAULT_DARK_BACKGROUND)) >= 4.5) return adjusted.toUpperCase()
  }
  return DEFAULT_DARK_PRIMARY
}

