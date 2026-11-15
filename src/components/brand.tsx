import Link from 'next/link'

export function Brand({ logoUrl, name = 'entryflow' }: { logoUrl?: string | null; name?: string }) {
  return <Link className="brand" href="/" aria-label="EntryFlow home">
    {logoUrl ? <img className="brand-mark custom-brand-mark" src={logoUrl} alt=""/> : <svg className="brand-mark" viewBox="0 0 40 40" role="img" aria-hidden="true">
      <defs><linearGradient id="entryflow-gradient" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#32124e"/><stop offset="1" stopColor="#8a1dae"/></linearGradient></defs>
      <rect width="40" height="40" rx="13" fill="url(#entryflow-gradient)"/>
      <path d="M12 31V16.5L20 11l8 5.5V31h-6v-9h-4v9z" fill="none" stroke="#f5fbf6" strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M17 19h8m-3-3 3 3-3 3" fill="none" stroke="#ff78b5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>}
    <span>{name}</span>
  </Link>
}
