const CACHE_NAME = 'cbt-exam-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './js/supabase.js',
  './js/state.js',
  './js/mapel.js',
  './js/siswa.js',
  './js/jadwal.js',
  './js/soal.js',
  './js/rekap.js',
  './js/auth.js',
  './js/exam.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
