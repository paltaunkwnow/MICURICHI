// Service worker mínimo (PWA): caché del shell y de las capas administrativas; la API nunca se cachea.
const CACHE = 'curichi-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icono.svg'];
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  const esCapa =
    url.pathname.startsWith('/geo/v1/capas/') || url.pathname.startsWith('/geo/v1/teselas/');
  if (esCapa) {
    e.respondWith(
      caches.open(CACHE).then(
        async (c) =>
          (await c.match(e.request)) ??
          fetch(e.request).then((r) => {
            if (r.ok) c.put(e.request, r.clone());
            return r;
          }),
      ),
    );
  }
});
