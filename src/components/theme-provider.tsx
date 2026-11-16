'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
type ThemeContextValue = { theme: ThemeChoice; setTheme: (theme: ThemeChoice) => void }
const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ initialTheme, children }: { initialTheme: ThemeChoice; children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(initialTheme)

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme(nextTheme) {
      setThemeState(nextTheme)
      document.documentElement.dataset.theme = nextTheme
      localStorage.setItem('gatewise-theme', nextTheme)
      document.cookie = `gatewise-theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    },
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeChoice() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useThemeChoice must be used within ThemeProvider')
  return value
}
