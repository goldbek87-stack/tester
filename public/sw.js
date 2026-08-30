// Service Worker — Test Markazi (o'quvchi ilovasi)
// Faqat "qobiq"ni (HTML/CSS/JS) keshlaydi. Test savollari va natijalar
// har doim internetdan (API orqali) olinadi — ular hech qachon keshlanmaydi,
// aks holda o'quvchi eski/xato savollarni ko'rishi mumkin.

const CACHE_NAME = 'test-markazi-v1';
const SHELL_FILES = [
  '/student.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API so'rovlari — hech qachon keshlanmaydi, doim tarmoqdan
  if (url.pathname.startsWith('/api/')) {
    return; // brauzerning odatiy tarmoq so'roviga qo'yib beramiz
  }

  // Qobiq fayllari — avval keshdan, bo'lmasa tarmoqdan
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
