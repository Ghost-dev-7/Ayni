/* Service worker de Ayni: la app se abre sin conexión y muestra lo último que vio. */
const VERSION = 'ayni-v2';
const ARCHIVOS_BASE = ['/', '/icono.svg', '/icono-192.png', '/icono-512.png', '/logo.svg', '/manifest.webmanifest'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS_BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function guardar(peticion, respuesta) {
  if (respuesta && respuesta.ok) {
    const cache = await caches.open(VERSION);
    await cache.put(peticion, respuesta.clone());
  }
  return respuesta;
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return; // publicar, reservar y recoger siempre necesitan conexión
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // Datos de la API: primero la red; si no hay conexión, lo último que se vio.
  if (url.pathname.startsWith('/api/')) {
    evento.respondWith(
      fetch(peticion)
        .then((r) => guardar(peticion, r))
        .catch(() => caches.match(peticion).then((c) => c ?? new Response(JSON.stringify({ error: 'Sin conexión' }), { status: 503, headers: { 'content-type': 'application/json' } }))),
    );
    return;
  }

  // Páginas: primero la red; sin conexión, la pantalla principal guardada.
  if (peticion.mode === 'navigate') {
    evento.respondWith(fetch(peticion).then((r) => guardar(peticion, r)).catch(() => caches.match('/')));
    return;
  }

  // Archivos de la app (código, estilos, imágenes): primero lo guardado y se actualiza en segundo plano.
  evento.respondWith(
    caches.match(peticion).then((guardado) => {
      const red = fetch(peticion).then((r) => guardar(peticion, r)).catch(() => guardado);
      return guardado ?? red;
    }),
  );
});
