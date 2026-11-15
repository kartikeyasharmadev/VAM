import { signInWithGoogle } from '@/app/actions'

export function GoogleSignIn() {
  return <form action={signInWithGoogle} className="google-signin-form">
    <button type="submit" className="google-signin-button"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.7-.06-1.37-.18-2.02H12v3.83h5.38a4.6 4.6 0 0 1-2 3.02v2.48h3.24c1.9-1.75 2.98-4.33 2.98-7.31Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.46l-3.24-2.48c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.75-5.58-4.1H3.07v2.56A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.42 13.92a6 6 0 0 1 0-3.84V7.52H3.07a10 10 0 0 0 0 8.96l3.35-2.56Z"/><path fill="#EA4335" d="M12 5.98c1.47 0 2.78.5 3.81 1.5l2.86-2.86C16.96 2.97 14.7 2 12 2a10 10 0 0 0-8.93 5.52l3.35 2.56C7.2 7.73 9.4 5.98 12 5.98Z"/></svg>Continue with Google</button>
  </form>
}
