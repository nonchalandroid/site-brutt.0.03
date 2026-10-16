/* Service worker do PAINEL (escopo /admin/): só recebe as notificações de pedido (Web Push) e abre o painel no toque.
   Não guarda cache de nada — o painel sempre carrega a versão mais nova do servidor. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  // O service worker continua ativo mesmo com a janela minimizada ou fechada.
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "Brutt · Painel", body: e.data ? e.data.text() : "" }; }
  const titulo = d.title || "🔔 Novo aviso da loja";
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.body || "Toque para abrir o painel.",
    tag: d.tag || "brutt",
    renotify: true,                       // mesmo pedido (Pix gerado → pago) avisa de novo
    requireInteraction: !!d.fixo,         // pedido PAGO fica na tela até alguém tocar (onde o sistema permite)
    icon: "/favicon/android-chrome-192x192.png",
    badge: "/favicon/favicon-48x48.png",
    vibrate: d.fixo ? [300, 120, 300, 120, 300] : [200],
    data: { url: d.url || "/admin/#/pedidos" },
    timestamp: Date.now(),
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  let u = new URL((e.notification.data && e.notification.data.url) || "/admin/#/pedidos", self.location.origin);
  if (u.origin !== self.location.origin) u = new URL("/admin/#/pedidos", self.location.origin);   // aviso nunca abre site de fora
  const url = u.href;
  e.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abas) {
      if (new URL(c.url).pathname.startsWith("/admin")) { await c.focus(); if ("navigate" in c) c.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});
