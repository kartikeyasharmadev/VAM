import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) throw new Error('Workspace email invitations require SUPABASE_SECRET_KEY on the server.')
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
}
