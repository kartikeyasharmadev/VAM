import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** Shared primitives keep visual language consistent without changing page behavior. */
export function Button({ className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`.trim()} {...props}>{children}</button>
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`panel ${className}`.trim()}>{children}</section>
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`status-badge ${className}`.trim()}>{children}</span>
}

export function StatCard({ label, value, detail, tone = 'blue' }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`metric-card metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-dot" aria-hidden="true"/></div><strong>{value}</strong><small>{detail}</small></article>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty" role="status">{children}</div>
}
