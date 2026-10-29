import { buildApp } from "./app.js";
import { config } from "./config.js";
import { reclaimStuckEntries } from "./ingest.js";

const app = await buildApp();

try {
  const reclaimed = await reclaimStuckEntries();
  if (reclaimed)
    app.log.warn(
      { reclaimed },
      "Lectures interrompues par un redémarrage, repassées en échec (relançables depuis la journée)",
    );
} catch (err) {
  app.log.error({ err }, "Échec de la récupération des lectures interrompues");
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

let closing = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "Arrêt demandé — fermeture du serveur");
    app
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        app.log.error({ err }, "Échec de la fermeture propre");
        process.exit(1);
      });
  });
}
