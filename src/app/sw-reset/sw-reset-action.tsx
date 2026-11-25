'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export function ServiceWorkerResetAction() {
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working')
  const [details, setDetails] = useState<string>('Unregistering service workers and clearing caches...')

  useEffect(() => {
    async function resetServiceWorker() {
      try {
        let workersUnregistered = 0
        let cachesDeleted = 0

        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          for (const registration of registrations) {
            await registration.unregister()
            workersUnregistered++
          }
        }

        if ('caches' in window) {
          const keys = await caches.keys()
          for (const key of keys) {
            await caches.delete(key)
            cachesDeleted++
          }
        }

        try {
          localStorage.removeItem('gatewise-hide-ios-install')
        } catch {
          // ignore storage failure
        }

        setDetails(`Successfully unregistered ${workersUnregistered} service worker(s) and purged ${cachesDeleted} cache store(s).`)
        setStatus('done')
      } catch (err) {
        setDetails(err instanceof Error ? err.message : 'An error occurred while resetting the service worker.')
        setStatus('error')
      }
    }

    resetServiceWorker()
  }, [])

  return (
    <>
      <p className="muted" style={{ fontSize: '14px', margin: '12px 0 20px' }}>
        {status === 'working' && 'Resetting offline cache and service workers...'}
        {status === 'done' && 'Your service workers and local caches have been completely cleared.'}
        {status === 'error' && 'Failed to reset service worker automatically.'}
      </p>

      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '13px',
          color: 'var(--muted)',
          marginBottom: '20px',
          wordBreak: 'break-word',
        }}
      >
        {details}
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button
          type="button"
          className="button secondary"
          onClick={() => window.location.reload()}
        >
          Rerun reset
        </button>
        <Link href="/" className="button">
          Return to Gatewise
        </Link>
      </div>
    </>
  )
}
