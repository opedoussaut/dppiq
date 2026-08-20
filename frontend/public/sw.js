const CACHE = 'regiq-shell-v7'
const SHELL = ['/', '/manifest.webmanifest', '/regiq-icon.svg']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('regiq-shell-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) return
  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone()
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => undefined)
        }
        return response
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match('/')))
  )
})
