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
