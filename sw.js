/* Finanzas · service worker
   Primero la red (para recibir mejoras) y, si no hay internet, la copia guardada.
   Nunca guarda la carpeta datos-privados. */
const CACHE = 'finanzas-202611131216';
const ARCHIVOS = [
  './', 'index.html', 'estilos.css', 'manifest.webmanifest',
  'js/datos.js', 'js/juego.js', 'js/graficos.js', 'js/app.js',
  'iconos/icono.svg', 'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/datos-privados/')) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
