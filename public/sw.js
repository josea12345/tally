/* TALLY service worker — minimal. Exists so the PWA install prompt can fire
   and to keep navigation working offline-ish. No precache manifest needed. */
const CACHE = 'tally-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions so a renamed CACHE never strands
      // clients on a stale shell (stale-version lock-in).
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  // Network-first for navigations, falling back to the cached shell offline.
  // NOTE: this MUST use event.respondWith — event.waitUntil does not intercept
  // the request (it only extends the worker's lifetime), so the fallback
  // below would never actually serve anything.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const res = await fetch(event.request)
          // Only cache successful shell responses — never cache error pages
          // or redirects, or offline would serve a broken shell.
          if (res && res.ok) cache.put(event.request, res.clone())
          return res
        } catch {
          const cached = (await cache.match(event.request)) || (await cache.match('/'))
          // First-ever visit while offline: nothing cached yet — surface a
          // plain network error rather than throwing inside respondWith.
          return cached || Response.error()
        }
      })()
    )
    return
  }
  // All other requests (API, storage, images) pass through untouched:
  // we never cache authenticated API responses or private data here.
})

// Web Push: show the notification, tap opens the relevant page.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'TALLY'
  const body = data.body || 'Something happened on your record.'
  const url = data.url || '/'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
      tag: data.tag || 'tally',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus()
          if ('navigate' in w) await w.navigate(url)
          return
        }
      }
      await self.clients.openWindow(url)
    })()
  )
})
