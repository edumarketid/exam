const CACHE_NAME = 'cbt-exam-v4';
const IMG_CACHE_NAME = 'cbt-smkn1wkt-images-v1';

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
  './js/guru.js',
  './js/rekap.js',
  './js/auth.js',
  './js/exam.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url).catch(() => null)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && cache !== IMG_CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Jangan cache request API/Auth Supabase agar data real-time tetap segar saat online
  if (url.hostname.includes('supabase.co') && !url.pathname.includes('/storage/v1/object/public/')) {
    return;
  }

  // Cache-First untuk gambar soal & kop surat dari Supabase Storage
  if (url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(
      caches.open(IMG_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.ok) cache.put(req, netRes.clone());
          return netRes;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Network-First dengan fallback Cache untuk App Shell & CDN
  event.respondWith(
    fetch(req)
      .then((netRes) => {
        if (netRes && (netRes.ok || netRes.type === 'opaque')) {
          const clone = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return netRes;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return Response.error();
      })
  );
});
