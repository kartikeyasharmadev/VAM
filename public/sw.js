/* Gatewise worker: no page document, auth, API, visitor, or billing responses are cached. */
const CACHE_PREFIX = 'gatewise-static-'
const CACHE_NAME = `${CACHE_PREFIX}v1`
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
const STATIC_TIMEOUT_MS = 4500

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await Promise.allSettled(SAFE_SHELL.map(path => cache.add(path)))

    // Read only the public offline shell to discover versioned Next static assets.
    // No authenticated dashboard document is fetched or stored here.
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
      // Installation can still succeed with the offline shell and icons.
    }
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Always bypass auth and API paths, including Supabase-facing app handlers.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    })())
    return
  }

  if (url.pathname.startsWith('/icons/') || ['/favicon.svg', '/favicon.ico', '/gatewise.svg', '/apple-touch-icon.png', '/manifest.webmanifest'].includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    })())
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      let timeout
      try {
        return await Promise.race([
          fetch(request, { cache: 'no-store' }),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('navigation timeout')), STATIC_TIMEOUT_MS) }),
        ])
      } catch {
        return (await caches.match('/offline')) || new Response(
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gatewise · Offline</title><main><h1>You’re offline</h1><p>Reconnect to continue using Gatewise. Workspace data is not stored offline.</p><a href="/">Try again</a></main>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
      } finally {
        clearTimeout(timeout)
      }
    })())
  }
})
