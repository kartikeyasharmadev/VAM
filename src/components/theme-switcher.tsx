'use client'

import { useThemeChoice, type ThemeChoice } from './theme-provider'
import type { ReactNode } from 'react'

const options: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light theme', icon: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></> },
  { value: 'dark', label: 'Dark theme', icon: <path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13Z"/> },
  { value: 'system', label: 'Use system theme', icon: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></> },
]

export function ThemeSwitcher() {
  const { theme, setTheme } = useThemeChoice()
  return <div className="theme-switcher" role="group" aria-label="Color theme">
    {options.map(option => <button key={option.value} type="button" aria-label={option.label} title={option.label} aria-pressed={theme === option.value} onClick={() => setTheme(option.value)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{option.icon}</svg>
    </button>)}
  </div>
}
