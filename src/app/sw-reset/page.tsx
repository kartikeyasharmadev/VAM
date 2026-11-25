import { Brand } from '@/components/brand'
import { ServiceWorkerResetAction } from './sw-reset-action'

export const metadata = {
  title: 'Service Worker Reset · Gatewise',
}

export default function ServiceWorkerResetPage() {
  return (
    <main className="shell auth-shell" style={{ maxWidth: '520px', margin: '60px auto', padding: '24px' }}>
      <Brand />
      <section className="auth-card" style={{ marginTop: '24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>Service Worker Recovery</h1>
        <ServiceWorkerResetAction />
      </section>
    </main>
  )
}
