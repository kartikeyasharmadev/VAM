import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EntryFlow — Arrivals, handled.',
  description: 'A calmer front desk for every workspace. Guest check-in, branch management, and visitor history in one place.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
