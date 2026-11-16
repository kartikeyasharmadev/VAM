import Link from 'next/link'
import { Brand } from '@/components/brand'

export default function OfflinePage() {
  return <main className="offline-page">
    <header><Brand/></header>
    <section className="offline-card" aria-labelledby="offline-title">
      <span className="offline-symbol" aria-hidden="true">⌁</span>
      <p className="eyebrow">GATEWISE · CONNECTION</p>
      <h1 id="offline-title">You’re offline</h1>
      <p>Reconnect to continue using your workspace. Your visitor and account information stays protected and is not saved offline.</p>
      <Link className="button" href="/">Try again</Link>
    </section>
  </main>
}
