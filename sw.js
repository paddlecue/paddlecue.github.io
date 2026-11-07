const CACHE = 'salitan-v6';
const CDN_QR = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const NET_TIMEOUT = 3000; // on weak court-side signal, show the cached app after this long

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c =>
    // the QR library is optional: if the CDN is unreachable, still install the app shell
    c.addAll(CORE).then(() => c.add(CDN_QR).catch(() => {}))
  ));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

function putInCache(req, res){
  if(res && res.ok){ const clone = res.clone(); caches.open(CACHE).then(c => c.put(req, clone)); }
  return res;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin && e.request.url !== CDN_QR) return; // Firebase etc. go straight to network

  if (e.request.mode === 'navigate' || url.pathname.endsWith('index.html')) {
    // network-first so app updates land, but don't hang on "lie-fi":
    // after NET_TIMEOUT serve the cached copy (the network response still refreshes the cache)
    const net = fetch(e.request).then(res => putInCache(e.request, res));
    const cached = () => caches.match(e.request, { ignoreSearch: true }).then(h => h || caches.match('./index.html'));
    e.waitUntil(net.catch(() => {}));
    e.respondWith(new Promise(resolve => {
      let done = false;
      const finish = r => { if (!done && r) { done = true; resolve(r); } };
      const timer = setTimeout(() => cached().then(finish), NET_TIMEOUT);
      net.then(res => { clearTimeout(timer); finish(res); })
         .catch(() => { clearTimeout(timer); cached().then(h => finish(h || Response.error())); });
    }));
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit || fetch(e.request).then(res => putInCache(e.request, res))
    )
  );
});
