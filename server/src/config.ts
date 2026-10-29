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

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(v)) return true;
  if (["false", "0", "no", "off"].includes(v)) return false;
  return fallback;
}

function parseIntEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

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

export function findMalformedProxies(entries: string[]): string[] {
  return entries.filter((entry) => {
    const slash = entry.lastIndexOf("/");
    const addr = slash === -1 ? entry : entry.slice(0, slash);
    const isIPv4 =
      /^\d{1,3}(\.\d{1,3}){3}$/.test(addr) &&
      addr.split(".").every((o) => Number(o) <= 255);
    const isIPv6 = addr.includes(":") && /^[0-9a-fA-F:.]+$/.test(addr);
    if (!isIPv4 && !isIPv6) return true;
    if (slash === -1) return false;
    const prefixPart = entry.slice(slash + 1);
    if (!/^\d+$/.test(prefixPart)) return true;
    return Number(prefixPart) > (isIPv4 ? 32 : 128);
  });
}

const corsOrigins = parseOrigins(process.env.CORS_ORIGINS);
const usingDefaultOrigins = !process.env.CORS_ORIGINS?.trim();

export const config = {
  port: parseIntEnv(process.env.PORT, 3010),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  vlmModel: process.env.VLM_MODEL ?? "claude-sonnet-5",
  uploadsDir: process.env.UPLOADS_DIR ?? "./uploads",
  auth: {
    secret: process.env.BETTER_AUTH_SECRET ?? DEFAULT_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL ?? "http://localhost:3010",
    signupEnabled: parseBool(
      process.env.SIGNUP_ENABLED,
      process.env.NODE_ENV !== "production",
    ),
  },
  corsOrigins,
  trustedProxies: parseList(
    process.env.TRUSTED_PROXIES,
    DEFAULT_TRUSTED_PROXIES,
  ),
  webBaseUrl: (
    process.env.WEB_BASE_URL ??
    process.env.APP_URL ??
    corsOrigins[0] ??
    "http://localhost:5173"
  ).replace(/\/$/, ""),
  invitationTtlDays: parseIntEnv(process.env.INVITATION_TTL_DAYS, 14),
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL,
  webPush: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT ?? "mailto:no-reply@racontine.local",
  },
  billing: {
    secretKey: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
    priceId: process.env.STRIPE_PRICE_ID?.trim() || undefined,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    portalConfigId: process.env.STRIPE_PORTAL_CONFIG_ID?.trim() || undefined,
  },
  mail: {
    host: process.env.SMTP_HOST,
    port: parseIntEnv(process.env.SMTP_PORT, 587),
    secure: parseBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? "Racontine <no-reply@racontine.local>",
  },
};

export function billingEnabled(): boolean {
  return Boolean(config.billing.secretKey && config.billing.priceId);
}

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
  if (config.billing.secretKey && !config.billing.priceId)
    warn.push(
      "STRIPE_SECRET_KEY est défini mais pas STRIPE_PRICE_ID : le péage reste DÉSARMÉ (tout est gratuit).",
    );
  if (billingEnabled() && !config.billing.webhookSecret)
    warn.push(
      "STRIPE_WEBHOOK_SECRET non défini : les webhooks Stripe seront refusés. Un paiement sera rattrapé au retour du client, mais une résiliation, un impayé ou un renouvellement ne remonteront jamais.",
    );
  if (billingEnabled() && !config.billing.portalConfigId)
    warn.push(
      "STRIPE_PORTAL_CONFIG_ID non défini : le portail client (carte, factures, RÉSILIATION) sera habillé par la configuration PAR DÉFAUT du compte Stripe. Sur un compte qui porte plusieurs produits, vos clients y verront le nom d'un autre produit.",
    );
  if (billingEnabled() && config.billing.secretKey?.startsWith("sk_test_") && isProd)
    warn.push(
      "STRIPE_SECRET_KEY est une clé de TEST sur une instance de production : aucun paiement réel ne sera encaissé.",
    );

  const malformedProxies = findMalformedProxies(config.trustedProxies);
  if (malformedProxies.length)
    (isProd ? fatal : warn).push(
      `TRUSTED_PROXIES contient des entrées qui ne sont ni une IP ni un CIDR : ${malformedProxies.join(", ")}. Elles ne correspondront à aucun relais, et la limitation de débit repassera sur un seau partagé sans le dire.`,
    );

  for (const w of warn) console.warn(`[config] ${w}`);
  if (fatal.length) {
    for (const f of fatal) console.error(`[config] ${f}`);
    throw new Error(
      "Configuration invalide en production : définissez les variables d'environnement requises (BETTER_AUTH_SECRET, DATABASE_URL).",
    );
  }
}
