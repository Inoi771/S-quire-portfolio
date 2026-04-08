// S-quire Service Worker — 一時無効化中
// このファイルは既存の Service Worker を自己解除するためだけに残している。
// 再有効化するときはキャッシュ版に戻す。

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.registration.unregister();
    })
  );
});
