'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function OfflineAction() {
  const router = useRouter()
  const [checking, setChecking] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleRetry() {
    setChecking(true)
    setErrorMsg(null)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        router.push('/')
        router.refresh()
        return
      }

      setErrorMsg('Server returned an error. Please try again in a few moments.')
    } catch {
      setErrorMsg('Still unreachable. Please verify your internet connection.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
      <button
        type="button"
        className="button full"
        onClick={handleRetry}
        disabled={checking}
      >
        {checking ? 'Checking connection...' : 'Try again'}
      </button>

      {errorMsg && (
        <p style={{ color: 'var(--danger)', fontSize: '13px', margin: '4px 0 0' }}>
          {errorMsg}
        </p>
      )}

      <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted)' }}>
        Stuck in offline mode?{' '}
        <Link href="/sw-reset" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
          Reset service worker cache
        </Link>
      </div>
    </div>
  )
}
