/* 오프라인 동작용 서비스워커
   - 앱 파일(html/js/css)은 네트워크 우선 → 고치면 바로 반영된다
   - 라이브러리·이미지는 캐시 우선 → 빠르고 오프라인에서도 뜬다
   - 인터넷이 없으면 어느 쪽이든 캐시로 떨어진다                        */

const CACHE = 'kalimba-v4';

const PRECACHE = [
  './', './index.html', './style.css', './app.js',
  './assets/hand-data.js', './lib/jspdf.umd.min.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './manifest.json'
];

// 자주 고치는 파일 — 항상 새것을 먼저 받아온다
const FRESH = /\.(html|js|css|json)$/i;
const LIB = /\/(lib|fonts)\//;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const networkFirst = FRESH.test(url.pathname) && !LIB.test(url.pathname);

  if (networkFirst) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
  } else {
    e.respondWith(
      caches.match(req).then(hit =>
        hit || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
      )
    );
  }
});
