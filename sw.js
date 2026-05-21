/* ──────────────────────────────────────────────────────────────
   Togora — Service Worker
   - Caches core static assets for offline support
   - Handles push events → shows system notification
   - Handles notification click → opens the app
   - Supports skip-waiting message for instant activation
   ────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'togora-v54';
const CORE_ASSETS = [
  './',
  './index.html',
  './notifications.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './product.html',
  './search.html',
  './restaurants.html',
  './restaurant.html',
  './dishes.html',
  './dish.html',
  './events.html',
  './event.html',
  './cart.html',
  './checkout.html',
  './profile.html',
  './orders.html',
  './fonts/YSText-Regular.woff2',
  './fonts/YSText-Medium.woff2',
  './fonts/YSText-Bold.woff2',
  './fonts/YSCompressed-Heavy.woff2'
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(CORE_ASSETS.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('[SW] precache fail:', url, err);
        });
      }));
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var accept = req.headers.get('accept') || '';
  var isHTML = accept.indexOf('text/html') !== -1;

  if (isHTML) {
    event.respondWith(
      fetch(req).then(function(resp) {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
        return resp;
      }).catch(function() {
        return caches.match(req).then(function(c) { return c || caches.match('./index.html'); });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function(cached) {
      if (cached) return cached;
      return fetch(req).then(function(resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function() { return cached; });
    })
  );
});

self.addEventListener('push', function(event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {
    data = { title: 'Togora', body: event.data ? event.data.text() : '' };
  }
  var title = data.title || 'Togora';
  var options = {
    body: data.body || '',
    icon: data.icon || './icon-192.png',
    badge: data.badge || './icon-192.png',
    tag:  data.tag  || 'togora-notif',
    data: { url: data.url || './notifications.html', id: data.id || null },
    requireInteraction: false,
    vibrate: [60, 30, 60]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || './notifications.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ('focus' in c) {
          c.focus();
          if ('navigate' in c) { try { c.navigate(targetUrl); } catch (e) {} }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', function(event) {
  if (!event.data) return;
  if (event.data.type === 'skip-waiting') {
    self.skipWaiting();
    return;
  }
  if (event.data.type === 'show-notification') {
    var p = event.data.payload || {};
    self.registration.showNotification(p.title || 'Togora', {
      body: p.body || '',
      icon: p.icon || './icon-192.png',
      badge: p.badge || './icon-192.png',
      tag:  p.tag  || 'togora-test',
      data: { url: p.url || './notifications.html', id: p.id || null },
      vibrate: [60, 30, 60]
    });
  }
});
