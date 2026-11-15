import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const otpType = request.nextUrl.searchParams.get('type') as EmailOtpType | null
  const origin = request.nextUrl.origin
  if (code || (tokenHash && otpType)) {
    const supabase = await createClient()
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType! })
    if (!error) {
      const { error: inviteError } = await supabase.rpc('accept_workspace_invitations')
      if (inviteError && inviteError.code !== 'PGRST202') return NextResponse.redirect(new URL('/?error=invite_accept', origin))
      return NextResponse.redirect(new URL('/', origin))
    }
  }
  return NextResponse.redirect(new URL('/?error=signin', origin))
}
