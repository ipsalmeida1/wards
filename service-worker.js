// Cache-first do app shell inteiro — depois do primeiro load online, o app
// abre e funciona 100% sem rede (os dados já vivem no IndexedDB, que o
// service worker nem precisa tocar).

// `?v=N` nos scripts/CSS (ver index.html) força o navegador a buscar de
// novo a cada versão, mesmo se algum cache HTTP intermediário guardar a URL
// sem query — então o nome do arquivo aqui precisa bater com o que o HTML
// realmente pede, senão o precache instala uma URL que ninguém vai pedir.
const CACHE = 'wards-v70';
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css?v=70',
  './js/supabaseClient.js?v=70',
  './js/db.js?v=70',
  './js/matching.js?v=70',
  './js/archive.js?v=70',
  './js/report.js?v=70',
  './js/dialog.js?v=70',
  './js/handwriting.js?v=70',
  './js/scribble.js?v=70',
  './js/app.js?v=70',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Só cacheia o próprio app shell — qualquer coisa de outro domínio
  // (Supabase, fontes do Google, o CDN do client do Supabase) vai direto
  // pra rede, nunca por cache: dado vindo do banco precisa ser sempre o
  // mais recente, nunca uma cópia presa do primeiro load (bug real que já
  // aconteceu aqui antes, com o antigo endpoint de sincronização).
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copia));
          return resp;
        })
        .catch(() => cached);
    })
  );
});
