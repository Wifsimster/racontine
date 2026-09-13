/*
 * Gestionnaires Web Push, importés dans le service worker généré par
 * vite-plugin-pwa (voir `workbox.importScripts` dans vite.config.ts). On le
 * garde en JS simple, sans build : Workbox précache le reste, ce fichier
 * n'ajoute que la réception des notifications poussées et le clic.
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Payload non-JSON (rare) : on retombe sur le texte brut.
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Racontine";
  const options = {
    body: data.body || "",
    icon: "/pwa-192.png",
    // LA PASTILLE N'EST PAS L'ICÔNE. Android ne garde que l'ALPHA du `badge`
    // et le repeint en monochrome : la tuile groseille pleine y devenait un
    // carré gris, dans la barre d'état, à côté de notifications qui, elles,
    // avaient un glyphe. `badge-96.png` est la silhouette de la marque —
    // blanche sur transparent, dessinée pour cette taille-là.
    badge: "/badge-96.png",
    // `tag` regroupe/écrase les notifications d'un même sujet (ex. une entrée)
    // au lieu d'en empiler plusieurs.
    tag: data.tag,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  // Réutilise un onglet Racontine déjà ouvert si possible, sinon en ouvre un.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client) client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
