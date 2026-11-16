'use client'

import { useEffect } from 'react'

export function KioskWakeLock({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!standalone) return

    let sentinel: WakeLockSentinel | null = null
    let requested = false
    let disposed = false
    const request = async () => {
      if (requested || disposed || document.visibilityState !== 'visible') return
      requested = true
      try {
        sentinel = await navigator.wakeLock.request('screen')
        sentinel.addEventListener('release', () => { sentinel = null; requested = false })
      } catch {
        // The browser can deny wake locks; the check-in screen remains usable.
        requested = false
      }
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') void request() }
    const onPageHide = () => { void sentinel?.release().catch(() => {}) }
    window.addEventListener('pointerdown', request, { once: true })
    window.addEventListener('keydown', request, { once: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      disposed = true
      window.removeEventListener('pointerdown', request)
      window.removeEventListener('keydown', request)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      void sentinel?.release().catch(() => {})
    }
  }, [enabled])

  return null
}
