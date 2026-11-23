// A360 — service worker mínimo do app instalado. Não guarda páginas nem dados (tudo depende de login e muda o tempo todo):
// só mostra uma tela "sem conexão" quando a rede cai durante uma navegação.
const CACHE = "a360-offline-v1";
const OFFLINE = "/offline.html";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png", "/marca/rucelle-vinho.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // o resto segue direto para a rede, sem cache
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
