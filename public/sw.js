/* TALLY service worker — minimal. Exists so the PWA install prompt can fire
   and to keep navigation working offline-ish. No precache manifest needed. */
const CACHE = 'tally-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Network-first for navigations, cache fallback to index.
  if (event.request.mode === 'navigate') {
    event.waitUntil(
      (async () => {
        try {
          const res = await fetch(event.request)
          const cache = await caches.open(CACHE)
          cache.put(event.request, res.clone())
          return res
        } catch {
          const cache = await caches.open(CACHE)
          const cached = await cache.match(event.request)
          return cached || cache.match('/')
        }
      })()
    )
    return
  }
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
