const CACHE = 'hermitage-ui-v0.6.0'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('hermitage-ui-') && key !== CACHE).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_HERMITAGE_CACHES') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('hermitage-')).map((key) => caches.delete(key)))))
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/stream/') || url.pathname.startsWith('/api/radio/') || url.pathname.startsWith('/api/download/')) return

  if (url.pathname.startsWith('/api/cover/')) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      } catch {
        return cached || Response.error()
      }
    }))
    return
  }

  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        const cache = await caches.open(CACHE)
        cache.put('/', response.clone())
        return response
      } catch {
        return (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request)
    const network = fetch(request).then((response) => {
      if (response.ok && ['script', 'style', 'font', 'image'].includes(request.destination)) cache.put(request, response.clone())
      return response
    }).catch(() => cached)
    return cached || network
  }))
})
