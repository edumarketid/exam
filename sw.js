const CACHE_NAME = 'cbt-exam-v2';
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
