import { Brand } from '@/components/brand'
import { OfflineAction } from './offline-action'

export const metadata = {
  title: 'Offline · Gatewise',
}

export default function OfflinePage() {
  return (
    <main className="shell auth-shell" style={{ maxWidth: '480px', margin: '80px auto', padding: '24px' }}>
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
        <Brand />
      </header>

      <section
        className="auth-card"
        style={{
          textAlign: 'center',
          padding: '32px 24px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
        aria-labelledby="offline-title"
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--muted)',
            fontSize: '20px',
          }}
          aria-hidden="true"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        <h1 id="offline-title" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
          You’re offline
        </h1>

        <p className="muted" style={{ fontSize: '14px', lineHeight: '1.5', margin: '0 0 20px' }}>
          Reconnect to continue using your workspace. Your visitor and account data remains protected and is never stored locally.
        </p>

        <OfflineAction />
      </section>
    </main>
  )
}
