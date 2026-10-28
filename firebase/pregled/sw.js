// Spletna obvestila za skrbnika: nov mojster, nakazilo 0,01 €. Klik odpre mojstra na strani pregled.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (x) { d = { naslov: "Popravko", besedilo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.naslov || "Popravko", { body: d.besedilo || "", icon: "/ikona-192.png", badge: "/ikona-192.png", data: { url: d.url || "/" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((okna) => {
    for (const o of okna) if ("navigate" in o) return o.navigate(url).then((x) => (x || o).focus());
    return self.clients.openWindow(url);
  }));
});
