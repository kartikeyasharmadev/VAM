'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const INSTALL_DISMISSED_EVENT = 'gatewise-install-dismissed'

function subscribeConnectivity(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}
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
const getOnline = () => navigator.onLine
const getStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const getIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const getInstallDismissed = () => {
  try { return localStorage.getItem('gatewise-hide-ios-install') === '1' } catch { return false }
}

export function PwaSetup() {
  const online = useSyncExternalStore(subscribeConnectivity, getOnline, () => true)
  const isStandalone = useSyncExternalStore(subscribeStandalone, getStandalone, () => false)
  const isIos = useSyncExternalStore(noSubscription, getIos, () => false)
  const hideIos = useSyncExternalStore(subscribeInstallDismissal, getInstallDismissed, () => false)
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const reloadAfterUpdate = useRef(false)

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

    let activeRegistration: ServiceWorkerRegistration | null = null
    let onUpdateFound: (() => void) | null = null
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(reg => {
        activeRegistration = reg
        setRegistration(reg)
        if (reg.waiting && navigator.serviceWorker.controller) setUpdateReady(true)
        onUpdateFound = () => {
          const installing = reg.installing
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true)
          })
        }
        reg.addEventListener('updatefound', onUpdateFound)
        reg.update().catch(() => {})
      }).catch(() => {})
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      if (activeRegistration && onUpdateFound) activeRegistration.removeEventListener('updatefound', onUpdateFound)
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
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
    try { localStorage.setItem('gatewise-hide-ios-install', '1') } catch { /* This session can still dismiss it. */ }
    window.dispatchEvent(new Event(INSTALL_DISMISSED_EVENT))
  }

  const showIosHelp = isIos && !isStandalone && !hideIos
  if (online && !installEvent && !showIosHelp && !updateReady) return null

  return <aside className="pwa-notices" aria-live="polite" aria-atomic="false">
    {!online && <div className="pwa-notice pwa-offline"><span><strong>You’re offline.</strong> Reconnect to continue; workspace data isn’t stored offline.</span><button type="button" onClick={() => window.location.reload()}>Retry</button></div>}
    {installEvent && !isStandalone && <div className="pwa-notice"><span><strong>Install Gatewise</strong><small>Add your workspace to this device for quick access.</small></span><button type="button" onClick={install}>Install</button></div>}
    {showIosHelp && <div className="pwa-notice"><span><strong>Install Gatewise</strong><small>In Safari, tap Share, then “Add to Home Screen”.</small></span><button className="pwa-dismiss" type="button" aria-label="Dismiss install instructions" onClick={dismissIos}>Dismiss</button></div>}
    {updateReady && <div className="pwa-notice"><span><strong>Update available</strong><small>Refresh when you’re ready to use the latest version.</small></span><button type="button" onClick={refreshToUpdate}>Refresh</button></div>}
  </aside>
}
