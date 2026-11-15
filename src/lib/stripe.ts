type StripeApiError = { error?: { message?: string } }

export type StripeCheckoutSession = { id: string; url: string | null }
export type StripePortalSession = { id: string; url: string }

export async function stripePost<T>(endpoint: string, fields: Record<string, string>): Promise<T> {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new Error('Add STRIPE_SECRET_KEY to .env.local first.')
  const body = new URLSearchParams(fields)
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  })
  const result = await response.json() as T & StripeApiError
  if (!response.ok) throw new Error(result.error?.message ?? 'Stripe request failed.')
  return result
}

export function stripeSiteUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return new URL(path, base).toString()
}
