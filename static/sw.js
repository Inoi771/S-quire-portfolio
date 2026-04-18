// S-quire Service Worker — キャッシュ高速化
var CACHE_NAME = 's-quire-cache-v3';
var PRE_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.png',
  '/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

// install: 事前キャッシュ
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRE_CACHE);
    })
  );
  self.skipWaiting();
});

// activate: 古いキャッシュを削除
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// fetch: Stale-While-Revalidate
self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  // API・外部リクエストはキャッシュしない
  if (
    event.request.method !== 'GET' ||
    url.indexOf('script.google.com') !== -1 ||
    url.indexOf('supabase.co') !== -1 ||
    url.indexOf('googleapis.com') !== -1
  ) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        var fetched = fetch(event.request).then(function (response) {
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(function () {
          return cached;
        });
        return cached || fetched;
      });
    })
  );
});
