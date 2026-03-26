const CACHE_NAME = 'dukan360-offline-v1';
const urlsToCache = [
    './',
    'index.html',
    'css/style.css',
    'js/app.js',
    'lib/tailwind-cdn.js',
    'lib/react.min.js',
    'lib/react-dom.min.js',
    'lib/lucide.min.js',
    'lib/html5-qrcode.min.js',
    'lib/html2canvas.min.js',
    'lib/jspdf.umd.min.js',
    'lib/jspdf.plugin.autotable.min.js',
    'lib/firebase-app-compat.js',
    'lib/firebase-auth-compat.js',
    'lib/firebase-firestore-compat.js'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)).catch(() => {})
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) return response;
            return fetch(event.request).then(fetchRes => {
                if (!fetchRes || fetchRes.status !== 200 || fetchRes.type === 'error') {
                    return fetchRes;
                }
                const responseToCache = fetchRes.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                return fetchRes;
            }).catch(() => {
                // Offline fallback ignored to let app continue seamlessly
            });
        })
    );
});
