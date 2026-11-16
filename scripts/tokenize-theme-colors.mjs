import fs from 'node:fs'
import postcss from 'postcss'

const cssPath = new URL('../src/app/globals.css', import.meta.url)
const tokenPath = new URL('../src/app/palette-tokens.css', import.meta.url)
const css = fs.readFileSync(cssPath, 'utf8')
const root = postcss.parse(css, { from: cssPath.pathname })
const tokens = new Map()
const re = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b/gi

function rgb(hex) {
  let raw = hex.slice(1)
  if (raw.length === 3 || raw.length === 4) raw = [...raw].map(char => char + char).join('')
  const alpha = raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1
  const values = raw.length === 8 ? raw.slice(0, 6) : raw
  return [parseInt(values.slice(0, 2), 16), parseInt(values.slice(2, 4), 16), parseInt(values.slice(4, 6), 16), alpha]
}
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}
function darkSemantic(hex, kind, sidebar) {
  const [r, g, b, a] = rgb(hex)
  const [h, s, l] = hsl([r, g, b])
  if (kind === 'shadow') return `#000000${Math.max(0x18, Math.round(a * 255)).toString(16).padStart(2, '0')}`
  if (kind === 'foreground') {
    if (sidebar) return l > 0.88 ? '#FFFFFF' : '#CBD5E1'
    if (l > 0.92 && s < 0.1) return '#FFFFFF'
    if (s < 0.12) return l < 0.2 ? 'var(--text)' : 'var(--muted)'
    return h < 15 || h >= 345 ? 'var(--danger)' : h < 55 ? 'var(--warning)' : h < 170 ? 'var(--success)' : 'var(--primary)'
  }
  if (kind === 'border') {
    if (s < 0.12) return 'var(--border)'
    const tone = h < 15 || h >= 345 ? 'var(--danger)' : h < 55 ? 'var(--warning)' : h < 170 ? 'var(--success)' : 'var(--primary)'
    return `color-mix(in srgb, ${tone} 35%, var(--border))`
  }
  if (kind === 'background') {
    if (sidebar) return hex.toUpperCase()
    if (a < 0.18) return `#FFFFFF${Math.max(0x10, Math.round(a * 255)).toString(16).padStart(2, '0')}`
    if (l > 0.94 && s < 0.12) return 'var(--surface)'
    if (l > 0.55 && s < 0.12) return 'var(--surface-2)'
    if (l > 0.62) {
      const tone = h < 15 || h >= 345 ? 'var(--danger)' : h < 55 ? 'var(--warning)' : h < 170 ? 'var(--success)' : 'var(--primary)'
      return `color-mix(in srgb, ${tone} 14%, var(--surface))`
    }
    if (s > 0.38) return h < 15 || h >= 345 ? 'var(--danger)' : h < 55 ? 'var(--warning)' : h < 170 ? 'var(--success)' : 'var(--primary)'
    return hex.toUpperCase()
  }
  if (kind === 'accent') return 'var(--primary)'
  return hex.toUpperCase()
}

root.walkDecls(decl => {
  const selector = decl.parent?.type === 'rule' ? decl.parent.selector : ''
  const property = decl.prop.toLowerCase()
  const kind = property.includes('shadow') || property.includes('ring') ? 'shadow'
    : property.includes('border') || property.includes('outline') || property === 'scrollbar-color' ? 'border'
      : property === 'color' || property === 'fill' || property === 'stroke' ? 'foreground'
        : property === 'accent-color' || property === 'caret-color' ? 'accent'
          : property === 'background' || property === 'background-color' ? 'background'
            : property.startsWith('--') && /shadow/.test(property) ? 'shadow'
              : property.startsWith('--') && /border|line/.test(property) ? 'border'
                : property.startsWith('--') && /bg|paper|surface|soft|tint|background/.test(property) ? 'background'
                  : property.startsWith('--') && /ink|text|muted|green|lime|primary|foreground|metric/.test(property) ? 'foreground' : 'other'
  if (kind === 'other') return
  const sidebar = /\.sidebar|\.mini-sidebar|\.mini-brand/.test(selector)
  decl.value = decl.value.replace(re, match => {
    const color = match.toUpperCase()
    const key = `--palette-${kind}-${sidebar ? 'sidebar-' : ''}${color.slice(1).toLowerCase()}`
    tokens.set(key, { color, kind, sidebar })
    return `var(${key})`
  })
})

for (const match of css.matchAll(/var\(--palette-(background|foreground|border|shadow|accent)(?:-(sidebar))?-([\da-f]{3,8})\)/gi)) {
  const [, kind, sidebar, hex] = match
  const color = `#${hex}`.toUpperCase()
  tokens.set(`--palette-${kind.toLowerCase()}-${sidebar ? 'sidebar-' : ''}${hex.toLowerCase()}`, { color, kind: kind.toLowerCase(), sidebar: Boolean(sidebar) })
}

fs.writeFileSync(cssPath, root.toString())
const lightLines = [...tokens].map(([key, token]) => `  ${key}: ${token.color};`).join('\n')
const darkLines = [...tokens].map(([key, token]) => `  ${key}: ${darkSemantic(token.color, token.kind, token.sidebar)};`).join('\n')
const output = `/* Generated from shared visual declarations; edit source rules, then rerun scripts/tokenize-theme-colors.mjs. */\n:root {\n${lightLines}\n}\n:root[data-theme="dark"] {\n${darkLines}\n}\n@media (prefers-color-scheme: dark) {\n  :root[data-theme="system"] {\n${darkLines.split('\n').map(line => `  ${line}`).join('\n')}\n  }\n}\n`
fs.writeFileSync(tokenPath, output)
console.log(`Tokenized ${tokens.size} unique color tokens from globals.css.`)
