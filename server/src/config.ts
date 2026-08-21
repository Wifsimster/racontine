const DEFAULT_AUTH_SECRET = "dev-insecure-secret-change-me";
const DEFAULT_DATABASE_URL =
  "postgres://racontine:racontine@localhost:5433/racontine";
const DEFAULT_ORIGINS = ["http://localhost:5173", "http://localhost:8080"];

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [...DEFAULT_ORIGINS];
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : [...DEFAULT_ORIGINS];
}

/**
 * Parse un booléen d'environnement de façon robuste : « true/1/yes/on » → true,
 * « false/0/no/off » → false (insensible à la casse et aux espaces). Toute autre
 * valeur (ou l'absence) retombe sur `fallback`. Évite le piège d'un
 * `!== "false"` qui laisserait SIGNUP_ENABLED=0 activer l'inscription.
 */
function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(v)) return true;
  if (["false", "0", "no", "off"].includes(v)) return false;
  return fallback;
}

/** Parse un entier d'environnement, en ignorant les valeurs non numériques. */
function parseIntEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Réseaux des relais de confiance, en CIDR. Défaut : la boucle locale et les
 * trois plages privées — c'est EXACTEMENT la topologie livrée (nginx dans le
 * conteneur `web`, plus un éventuel reverse proxy du homelab), et le serveur
 * n'est joignable que depuis le réseau Docker dans `docker-compose.prod.yml`.
 * Un déploiement qui expose l'API directement doit resserrer cette liste :
 * `X-Forwarded-For` devient sinon une adresse que le client choisit lui-même.
 */
const DEFAULT_TRUSTED_PROXIES = [
  "127.0.0.1/32",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
];

function parseList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return [...fallback];
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : [...fallback];
}

const corsOrigins = parseOrigins(process.env.CORS_ORIGINS);
const usingDefaultOrigins = !process.env.CORS_ORIGINS?.trim();

export const config = {
  port: parseIntEnv(process.env.PORT, 3010),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  // La lecture des carnets utilise la clé API Anthropic PROPRE à chaque
  // utilisateur (réglages > clé API), chiffrée en base. Il n'y a plus de clé
  // partagée d'instance : ANTHROPIC_API_KEY n'est plus lue par le serveur.
  vlmModel: process.env.VLM_MODEL ?? "claude-sonnet-5",
  uploadsDir: process.env.UPLOADS_DIR ?? "./uploads",
  auth: {
    secret: process.env.BETTER_AUTH_SECRET ?? DEFAULT_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL ?? "http://localhost:3010",
    /**
     * Ouvre l'inscription email/mot de passe. Ce n'est que le DÉFAUT : le
     * réglage stocké en base (écran Réglages) prime dès qu'il est renseigné.
     *
     * Le défaut dépend de l'environnement, et c'est délibéré. En production,
     * une instance dont on a oublié la variable laissait n'importe quel passant
     * se créer un compte sur le homelab de quelqu'un d'autre. Le défaut y est
     * donc FERMÉ. En développement il reste ouvert : on crée et recrée des
     * comptes toute la journée.
     *
     * Le premier compte n'est pas concerné : une instance sans aucun
     * utilisateur accepte toujours l'inscription (voir le hook `before` dans
     * `auth.ts`), sinon un défaut fermé rendrait une installation neuve
     * impossible à amorcer.
     */
    signupEnabled: parseBool(
      process.env.SIGNUP_ENABLED,
      process.env.NODE_ENV !== "production",
    ),
  },
  /** Origines autorisées par CORS (front en dev + reverse proxy). */
  corsOrigins,
  /**
   * Relais de confiance pour résoudre l'ADRESSE RÉELLE du client.
   *
   * Ce n'est pas un détail d'exploitation : sans cette liste, le limiteur de
   * débit de Better Auth ne sait pas à qui attribuer une requête. nginx AJOUTE
   * son maillon à `X-Forwarded-For` (`$proxy_add_x_forwarded_for`), et le
   * reverse proxy du homelab en ajoute un autre — l'en-tête porte donc au moins
   * deux valeurs, et Better Auth refuse par sécurité d'en croire une seule.
   * Il retombe alors sur un SEUL SEAU PARTAGÉ (`no-trusted-ip`) pour toute
   * l'instance : trois connexions par dix secondes pour le monde entier, mamie
   * comprise. C'est à la fois inutile côté sécurité (personne n'est distingué)
   * et cassant côté disponibilité (une famille se bloque toute seule).
   * Avec la liste, la chaîne est dépilée par la droite jusqu'au premier maillon
   * non fiable : on obtient l'adresse publique du client, et chacun son seau.
   */
  trustedProxies: parseList(
    process.env.TRUSTED_PROXIES,
    DEFAULT_TRUSTED_PROXIES,
  ),
  /**
   * Base publique du front, pour construire les liens d'invitation, de magic
   * link et des e-mails de notification. Défaut : la 1re origine CORS.
   */
  webBaseUrl: (
    process.env.WEB_BASE_URL ??
    process.env.APP_URL ??
    corsOrigins[0] ??
    "http://localhost:5173"
  ).replace(/\/$/, ""),
  /** Durée de validité d'une invitation (jours). */
  invitationTtlDays: parseIntEnv(process.env.INVITATION_TTL_DAYS, 14),
  /**
   * Webhook optionnel (ntfy, etc.) pour livrer les liens aux proches. Sans lui,
   * les liens sont journalisés côté serveur et l'admin copie le lien depuis l'UI.
   */
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL,
  /**
   * Web Push (VAPID) pour les notifications navigateur/mobile aux abonnés.
   * Optionnel : sans paire de clés VAPID, le push est désactivé (les notifs
   * in-app et e-mail continuent de fonctionner). Générer une paire avec
   * `npx web-push generate-vapid-keys`.
   */
  webPush: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    // `mailto:` ou URL du responsable, exigé par la spec Web Push.
    subject: process.env.VAPID_SUBJECT ?? "mailto:no-reply@racontine.local",
  },
  /**
   * E-mail (SMTP) pour les notifications aux proches abonnés. Optionnel : si
   * SMTP_HOST est absent, les e-mails sont désactivés (notifs in-app seules).
   */
  mail: {
    host: process.env.SMTP_HOST,
    port: parseIntEnv(process.env.SMTP_PORT, 587),
    secure: parseBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? "Racontine <no-reply@racontine.local>",
  },
};

/**
 * Vérifie la configuration au démarrage. En production (`NODE_ENV=production`),
 * l'usage des valeurs par défaut sensibles (secret d'auth, base de données) est
 * fatal : mieux vaut refuser de démarrer que tourner sur un secret public. Les
 * défauts non critiques (origines/liens en localhost) ne produisent qu'un
 * avertissement. En dev, tout est un simple avertissement.
 */
export function validateConfig(): void {
  const isProd = process.env.NODE_ENV === "production";
  const fatal: string[] = [];
  const warn: string[] = [];

  if (config.auth.secret === DEFAULT_AUTH_SECRET)
    (isProd ? fatal : warn).push(
      "BETTER_AUTH_SECRET non défini : secret de signature par défaut, public et non sécurisé.",
    );
  if (config.databaseUrl === DEFAULT_DATABASE_URL)
    (isProd ? fatal : warn).push(
      "DATABASE_URL non défini : base de données par défaut (localhost).",
    );
  if (usingDefaultOrigins)
    warn.push(
      "CORS_ORIGINS non défini : origines CORS et liens e-mail par défaut sur localhost — les liens envoyés aux proches seront morts.",
    );

  for (const w of warn) console.warn(`[config] ${w}`);
  if (fatal.length) {
    for (const f of fatal) console.error(`[config] ${f}`);
    throw new Error(
      "Configuration invalide en production : définissez les variables d'environnement requises (BETTER_AUTH_SECRET, DATABASE_URL).",
    );
  }
}
