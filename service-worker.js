const CACHE_NAME = 'inventory-manager-v5';

// Core application files to cache
const filesToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  // JavaScript modules
  '/js/app.js',
  '/js/database.js',
  '/js/firebase-config.js',
  '/js/config.js',
  '/js/auth.js',
  '/js/products.js',
  '/js/drivers.js',
  '/js/assignments.js',
  '/js/orders.js',
  '/js/users.js',
  '/js/reports.js',
  '/js/my-orders.js',
  '/js/my-inventory.js',
  '/js/my-earnings.js',
  '/js/sales.js',
  // External dependencies
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Fallback page for offline scenarios
const OFFLINE_URL = '/index.html';

// Install event - cache files
self.addEventListener('install', event => {
  console.log('[Service Worker] Install');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(filesToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate');
  
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  
  return self.clients.claim();
});

// Fetch event - Network-first for real-time sync, cache only static assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip service worker for non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  console.log('[Service Worker] Fetch', request.url);

  // Firebase/Firestore requests - ALWAYS go direct to network (no caching)
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase.googleapis.com') ||
      url.hostname.includes('gstatic.com')) {
    return; // Let Firebase handle its own caching
  }

  event.respondWith(
    // Network-first for ALL requests to ensure real-time data
    networkFirstStrategy(request)
  );
});

// Network-first strategy - prioritize fresh data for multi-user sync
async function networkFirstStrategy(request) {

  try {
    // Always try network first for real-time sync
    console.log('[Service Worker] Fetching from network:', request.url);
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      // Only cache static assets (CSS, JS, images) - NOT app shell/HTML
      if (isStaticAsset(request)) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        console.log('[Service Worker] Cached static asset:', request.url);
      }
    }

    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network failed, trying cache fallback:', request.url);

    // Only use cache as fallback for static assets and app shell
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[Service Worker] Serving from cache:', request.url);
      return cachedResponse;
    }

    // For navigation requests, serve the app shell so users can see "offline" message
    if (request.destination === 'document') {
      const appShell = await caches.match(OFFLINE_URL);
      if (appShell) {
        console.log('[Service Worker] Serving offline app shell');
        return appShell;
      }
    }

    // Re-throw error if no cache fallback available
    throw error;
  }
}

// Identify static assets that are safe to cache
function isStaticAsset(request) {
  const url = new URL(request.url);

  // External CDN resources (like Font Awesome)
  if (url.origin !== self.location.origin) {
    return url.pathname.includes('font-awesome') ||
           url.pathname.includes('.css') ||
           url.pathname.includes('.js');
  }

  // Local static files only
  const staticPaths = ['/css/', '/images/', '/manifest.json'];
  const staticExtensions = ['.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff2', '.woff'];

  return staticPaths.some(path => url.pathname.includes(path)) ||
         staticExtensions.some(ext => url.pathname.endsWith(ext));
}

// Handle messages from the client
self.addEventListener('message', event => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
