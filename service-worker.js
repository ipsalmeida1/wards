// Cache-first do app shell inteiro — depois do primeiro load online, o app
// abre e funciona 100% sem rede (os dados já vivem no IndexedDB, que o
// service worker nem precisa tocar).

// `?v=N` nos scripts/CSS (ver index.html) força o navegador a buscar de
// novo a cada versão, mesmo se algum cache HTTP intermediário guardar a URL
// sem query — então o nome do arquivo aqui precisa bater com o que o HTML
// realmente pede, senão o precache instala uma URL que ninguém vai pedir.
const CACHE = 'wards-v52';
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css?v=52',
  './js/db.js?v=52',
  './js/matching.js?v=52',
  './js/archive.js?v=52',
  './js/report.js?v=52',
  './js/backup.js?v=52',
  './js/sync.js?v=52',
  './js/dialog.js?v=52',
  './js/handwriting.js?v=52',
  './js/scribble.js?v=52',
  './js/app.js?v=52',
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
  // /api/* é sempre dinâmico (dado de sincronização mudando o tempo todo) —
  // nunca cachear, sempre ir direto na rede. Cache-first aqui já causou um
  // bug real: a primeira leitura vazia ficava presa no cache pra sempre,
  // escondendo tudo que era sincronizado depois.
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;
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
