import { buildApp } from "./app.js";
import { config } from "./config.js";
import { reclaimStuckEntries } from "./ingest.js";

const app = await buildApp();

/* Une lecture de carnet tourne EN MÉMOIRE, en fire-and-forget : elle ne survit
   pas à son processus. Le homelab redémarre le conteneur à chaque déploiement,
   donc à chaque merge sur `main` — et une journée photographiée pile à ce
   moment-là restait « Lecture en cours » pour toujours, sans aucune sortie.
   Au démarrage, aucune lecture ne peut être en vol : on récupère les orphelines
   avant d'accepter la première requête, pour que personne ne voie l'état mort.
   Ce n'est pas fatal si ça échoue (base indisponible une seconde) : le serveur
   doit démarrer quand même, le prochain redémarrage rattrapera. */
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

/* Arrêt propre : `docker compose up -d` envoie SIGTERM, puis tue au bout de son
   délai de grâce. Sans ce gestionnaire, les requêtes en vol étaient coupées au
   milieu de leur réponse. On ferme le serveur (plus de nouvelle connexion, les
   réponses en cours vont au bout), puis on rend la main.
   Ce que ça ne sauve PAS : la lecture VLM en arrière-plan, qui dure des dizaines
   de secondes et dépasse le délai de grâce de Docker. C'est assumé — c'est
   exactement ce que `reclaimStuckEntries` rattrape au redémarrage suivant. */
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (closing) return; // un second Ctrl-C ne doit pas relancer la fermeture
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
