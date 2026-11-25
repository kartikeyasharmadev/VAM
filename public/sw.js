/* Gatewise Service Worker: static asset cache only.
   No authenticated documents, auth calls, API requests, RSC streams, or dynamic records are cached. */

const CACHE_PREFIX = 'gatewise-static-'
const CACHE_NAME = `${CACHE_PREFIX}v2`
const NAVIGATION_TIMEOUT_MS = 10000

const SAFE_SHELL = [
  '/offline',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/gatewise.svg',
  '/apple-touch-icon.png',
  '/icons/gatewise-192.png',
  '/icons/gatewise-512.png',
  '/icons/gatewise-maskable-192.png',
  '/icons/gatewise-maskable-512.png',
]

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await Promise.allSettled(SAFE_SHELL.map(path => cache.add(path)))

    try {
      const response = await fetch('/offline', { cache: 'no-store', credentials: 'same-origin' })
      if (response.ok) {
        const html = await response.text()
        const urls = [...html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g)]
          .map(match => new URL(match[1], self.location.origin))
          .filter(url => url.origin === self.location.origin)
          .map(url => `${url.pathname}${url.search}`)
        await Promise.allSettled([...new Set(urls)].map(path => cache.add(path)))
      }
    } catch {
      // Offline fallback shell is already in safe precache.
    }
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(
      names
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map(name => caches.delete(name))
    )
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Helper to verify whether the device actually has active connectivity
async function verifyConnectivity() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 1. Always bypass cross-origin requests directly to network
  if (url.origin !== self.location.origin) return

  // 2. Always bypass API routes, auth endpoints, service worker control paths, and health checks
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/sw.js' ||
    url.pathname === '/sw-reset'
  ) {
    return
  }

  // 3. Always bypass Next.js RSC (React Server Component) data requests and dynamic route prefetching
  if (
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.has('Next-Router-State-Tree') ||
    request.headers.has('Next-Url') ||
    url.pathname.startsWith('/_next/data/')
  ) {
    return
  }

  // 4. Cache-first strategy for immutable static chunks
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) return cached

      try {
        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone())
        }
        return response
      } catch (err) {
        if (cached) return cached
        throw err
      }
    })())
    return
  }

  // 5. Stale-while-revalidate for static icons and favicons
  if (
    url.pathname.startsWith('/icons/') ||
    ['/favicon.svg', '/favicon.ico', '/gatewise.svg', '/apple-touch-icon.png'].includes(url.pathname)
  ) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
          cache.put(request, response.clone())
        }
        return response
      }).catch(() => cached)

      return cached || fetchPromise
    })())
    return
  }

  // 6. Navigation requests: Network-first with sensible timeout and active connectivity verification
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      let timeoutId
      try {
        const fetchPromise = fetch(request, { cache: 'no-store' })
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Navigation timeout')), NAVIGATION_TIMEOUT_MS)
        })

        const response = await Promise.race([fetchPromise, timeoutPromise])
        clearTimeout(timeoutId)
        return response
      } catch {
        clearTimeout(timeoutId)

        // NEVER immediately serve /offline without checking connectivity.
        // If the server was simply slow or rebooting, but the client is online, do not show false offline.
        const isOnline = await verifyConnectivity()
        if (isOnline) {
          // Device has internet! The page request just timed out or server had a transient hiccup.
          // Fall back to a fresh fetch without racing or let browser handle it.
          try {
            return await fetch(request, { cache: 'no-store' })
          } catch {
            // If second attempt also fails, continue to offline check
          }
        }

        // True offline state confirmed
        const cachedOffline = await caches.match('/offline')
        if (cachedOffline) return cachedOffline

        return new Response(
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gatewise · Offline</title><body style="font-family:system-ui,sans-serif;padding:32px;text-align:center;"><h1>You’re offline</h1><p>Reconnect to continue using Gatewise. Workspace data is not stored offline.</p><p><a href="/" style="display:inline-block;padding:8px 16px;background:#4338CA;color:#fff;text-decoration:none;border-radius:6px;">Try again</a></p><p style="margin-top:24px;"><a href="/sw-reset" style="color:#64748B;font-size:12px;">Reset offline cache</a></p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }
    })())
  }
})
