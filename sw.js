const CACHE_NAME = 'calorie-tracker-v3';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', event => {
    // Force the waiting service worker to become the active service worker.
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('activate', event => {
    // Delete all older overlapping caches
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            self.clients.claim(); // Take control immediately
        })
    );
});

self.addEventListener('fetch', event => {
    // Network First, Cache Fallback Strategy
    event.respondWith(
        fetch(event.request).then(response => {
            // Update the cache with the newest version from the network
            return caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, response.clone());
                return response;
            });
        }).catch(() => {
            // If offline or network fails, fallback to cache
            return caches.match(event.request);
        })
    );
});
