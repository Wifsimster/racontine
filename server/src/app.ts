import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { dbHealthy } from "./db/index.js";
import { config, validateConfig } from "./config.js";
import { redactUrl } from "./log.js";
import { authPlugin } from "./plugins/auth.js";
import { entriesRoutes } from "./routes/entries.js";
import { attachmentsRoutes } from "./routes/attachments.js";
import { sharingRoutes } from "./routes/sharing.js";
import { subscriptionsRoutes } from "./routes/subscriptions.js";
import { pushRoutes } from "./routes/push.js";
import { settingsRoutes } from "./routes/settings.js";
import { mcpRoutes } from "./routes/mcp.js";

/**
 * Routes qui coûtent cher à servir ou qui se devinent jeton par jeton, et qui
 * méritent donc un plafond serré (30 / minute et par adresse) :
 *   · les deux routes d'envoi de photos — 12 x 20 Mo par appel, c'est par là
 *     qu'on remplit un disque ;
 *   · les deux surfaces d'essai de jeton — invitation et MCP —, où seul le
 *     nombre d'essais par minute sépare un secret d'une force brute.
 * Trente par minute laissent passer un carnet entier photographié page par
 * page ; elles ne laissent pas passer une boucle.
 */
const COSTLY_ROUTES = [
  /^\/api\/entries\/ingest\b/,
  /^\/api\/mcp\/uploads\b/,
  /^\/api\/invitations\/token\//,
  /^\/api\/mcp(\?|$)/,
];

export async function buildApp() {
  validateConfig();

  const app = Fastify({
    /* L'adresse du client vient de `X-Forwarded-For`, mais SEULEMENT si le
       maillon qui l'a posée est un relais qu'on reconnaît. Sans ça, `req.ip`
       serait l'adresse de nginx : tout le monde partagerait un seul seau de
       débit, et le limiteur ne limiterait plus personne en particulier. Avec
       une liste (et non `true`), un client qui fabrique son propre en-tête ne
       peut pas se faire passer pour une autre adresse. */
    trustProxy: config.trustedProxies,
    logger: {
      /* Fastify journalise l'URL de chaque requête, et plusieurs de nos URL
         portent une capacité en clair (jeton d'invitation dans le chemin, jeton
         de magic link en query). Elles partaient donc dans `docker logs` à
         chaque clic : quiconque lisait les logs prenait un compte ou entrait
         dans le cercle d'un enfant. Le sérialiseur les caviarde à la source —
         voir `log.ts`. On reproduit les champs du sérialiseur par défaut, sans
         quoi on perdrait la méthode et l'adresse d'appel au passage. */
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: redactUrl(req.url),
            host: req.host,
            remoteAddress: req.ip,
            remotePort: req.socket?.remotePort,
          };
        },
      },
    },
  });

  /* ── Débit : ce qui protège le disque et la facture, pas l'authentification ─
     Better Auth limite DÉJÀ ses propres routes (activé de série en production :
     100 requêtes / 10 s, et 3 / 10 s sur connexion et inscription). Ce qui
     n'était limité par rien, c'est l'API métier — et c'est là que se trouve ce
     qui coûte cher :
       · `POST /api/entries/ingest` accepte 12 fichiers de 20 Mo par appel,
         sans plafond de fréquence : de quoi remplir le disque du homelab ;
       · `POST /api/mcp/uploads` fait la même chose en octets bruts ;
       · `/api/invitations/token/:token` et `/api/mcp` se devinent jeton par
         jeton, sans que rien ne ralentisse l'essai suivant.

     Le plafond global est LARGE à dessein : un foyer sort par une seule adresse
     publique, et le journal sonde toutes les 2,5 s pendant une lecture. Un seau
     serré ne gênerait que la famille — jamais quelqu'un qui envoie des photos
     de 20 Mo en boucle. Ce sont les routes COÛTEUSES qui portent le vrai
     plafond, et toute la politique tient ici : une route ne doit pas avoir à
     se souvenir qu'elle est chère. */
  await app.register(rateLimit, {
    global: true,
    timeWindow: "1 minute",
    max: (req) => (COSTLY_ROUTES.some((re) => re.test(req.url)) ? 30 : 600),
    // La sonde de santé du superviseur ne doit jamais consommer de quota, ni
    // se faire refouler : c'est elle qui dit si le service est vivant.
    allowList: (req) => req.url === "/api/health",
    /* Le constructeur doit renvoyer une ERREUR portant son `statusCode` : le
       plugin fait `throw` de ce qu'on lui rend, et un objet nu arrive au
       gestionnaire d'erreurs de Fastify sans statut — la limite de débit
       répondait alors 500 au lieu de 429 (mesuré). */
    errorResponseBuilder: (_req, ctx) => {
      const err = new Error(
        `Trop de requêtes. Réessayez dans ${Math.ceil(ctx.ttl / 1000)} s.`,
      ) as Error & { statusCode: number };
      err.statusCode = ctx.statusCode;
      return err;
    },
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // photos de carnet jusqu'à 20 Mo
      files: 12, // un carnet tient largement en 12 pages/jour
    },
  });

  // Corps binaire brut pour la mise en attente d'une page (POST /api/mcp/uploads) :
  // le client envoie les octets tels quels, sans multipart ni base64. Aucune
  // autre route n'attend ce type de contenu, le parseur global est donc sûr.
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: 32 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.get("/api/health", async () => ({
    status: "ok",
    db: (await dbHealthy()) ? "up" : "down",
  }));

  // Better Auth (email/password) — plugin encapsulé (corps brut).
  await app.register(authPlugin);

  // Routes métier (protégées par requireUser).
  await app.register(entriesRoutes);
  await app.register(attachmentsRoutes);
  await app.register(sharingRoutes);
  await app.register(subscriptionsRoutes);
  await app.register(pushRoutes);
  await app.register(settingsRoutes);
  await app.register(mcpRoutes);

  return app;
}
