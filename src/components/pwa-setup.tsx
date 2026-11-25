'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const INSTALL_DISMISSED_EVENT = 'gatewise-install-dismissed'

function subscribeStandalone(callback: () => void) {
  const query = window.matchMedia('(display-mode: standalone)')
  query.addEventListener('change', callback)
  window.addEventListener('appinstalled', callback)
  return () => {
    query.removeEventListener('change', callback)
    window.removeEventListener('appinstalled', callback)
  }
}

function subscribeInstallDismissal(callback: () => void) {
  window.addEventListener(INSTALL_DISMISSED_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(INSTALL_DISMISSED_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

const noSubscription = () => () => {}
const getStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const getIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const getInstallDismissed = () => {
  try { return localStorage.getItem('gatewise-hide-ios-install') === '1' } catch { return false }
}

async function checkServerReachability(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

export function PwaSetup() {
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const isStandalone = useSyncExternalStore(subscribeStandalone, getStandalone, () => false)
  const isIos = useSyncExternalStore(noSubscription, getIos, () => false)
  const hideIos = useSyncExternalStore(subscribeInstallDismissal, getInstallDismissed, () => false)
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const reloadAfterUpdate = useRef(false)
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  // 1. Debounced, active connectivity verification
  useEffect(() => {
    const verifyStatus = async (probableOnline: boolean) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)

      if (probableOnline) {
        const healthy = await checkServerReachability()
        setIsOnline(healthy)
      } else {
        // Wait 1.5s to avoid flickering during brief radio switching
        debounceTimer.current = setTimeout(async () => {
          const healthy = await checkServerReachability()
          setIsOnline(healthy)
        }, 1500)
      }
    }

    const onOnline = () => verifyStatus(true)
    const onOffline = () => verifyStatus(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Initial check if navigator reports offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      verifyStatus(false)
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // 2. Service Worker registration with kill-switch and HTTPS/prod verification
  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallPromptEvent)
    }
    const onInstalled = () => setInstallEvent(null)
    const onControllerChange = () => {
      if (reloadAfterUpdate.current) window.location.reload()
    }

    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // Kill-switch: if disabled via environment variable, unregister everything and clear caches
    const isSwDisabled = process.env.NEXT_PUBLIC_DISABLE_SW === 'true'
    if (isSwDisabled) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          regs.forEach(reg => reg.unregister())
        })
      }
      if ('caches' in window) {
        caches.keys().then(keys => {
          keys.forEach(k => caches.delete(k))
        })
      }
      return () => {
        window.removeEventListener('beforeinstallprompt', onInstallPrompt)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }

    // Only register in production and over HTTPS (or on localhost during explicit testing)
    const isProduction = process.env.NODE_ENV === 'production'
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

    if (isProduction && isSecure && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(reg => {
          setRegistration(reg)

          if (reg.waiting && navigator.serviceWorker.controller) {
            setUpdateReady(true)
          }

          reg.addEventListener('updatefound', () => {
            const installing = reg.installing
            installing?.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateReady(true)
              }
            })
          })

          // Periodically check for updates
          reg.update().catch(() => {})
        })
        .catch(() => {})
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      }
    }
  }, [])

  async function install() {
    if (!installEvent) return
    try {
      await installEvent.prompt()
      await installEvent.userChoice
      setInstallEvent(null)
    } catch {
      setInstallEvent(null)
    }
  }

  function refreshToUpdate() {
    const waiting = registration?.waiting
    if (!waiting) return
    reloadAfterUpdate.current = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
    setUpdateReady(false)
  }

  function dismissIos() {
    try {
      localStorage.setItem('gatewise-hide-ios-install', '1')
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(INSTALL_DISMISSED_EVENT))
  }

  const showIosHelp = isIos && !isStandalone && !hideIos
  if (isOnline && !installEvent && !showIosHelp && !updateReady) return null

  return (
    <aside className="pwa-notices" aria-live="polite" aria-atomic="false">
      {!isOnline && (
        <div className="pwa-notice pwa-offline">
          <span>
            <strong>Connection lost.</strong> Reconnecting to your workspace...
          </span>
          <button
            type="button"
            onClick={async () => {
              const ok = await checkServerReachability()
              if (ok) setIsOnline(true)
              else window.location.reload()
            }}
          >
            Retry
          </button>
        </div>
      )}

      {installEvent && !isStandalone && (
        <div className="pwa-notice">
          <span>
            <strong>Install Gatewise</strong>
            <small>Add your workspace to this device for quick access.</small>
          </span>
          <button type="button" onClick={install}>
            Install
          </button>
        </div>
      )}

      {showIosHelp && (
        <div className="pwa-notice">
          <span>
            <strong>Install Gatewise</strong>
            <small>In Safari, tap Share, then “Add to Home Screen”.</small>
          </span>
          <button className="pwa-dismiss" type="button" aria-label="Dismiss install instructions" onClick={dismissIos}>
            Dismiss
          </button>
        </div>
      )}

      {updateReady && (
        <div className="pwa-notice">
          <span>
            <strong>Update available</strong>
            <small>A new version of Gatewise is ready.</small>
          </span>
          <button type="button" onClick={refreshToUpdate}>
            Refresh
          </button>
        </div>
      )}
    </aside>
  )
}
