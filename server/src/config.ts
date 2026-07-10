function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return ["http://localhost:5173", "http://localhost:8080"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const corsOrigins = parseOrigins(process.env.CORS_ORIGINS);

export const config = {
  port: Number(process.env.PORT ?? 3010),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://racontine:racontine@localhost:5433/racontine",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  vlmModel: process.env.VLM_MODEL ?? "claude-sonnet-5",
  uploadsDir: process.env.UPLOADS_DIR ?? "./uploads",
  auth: {
    secret: process.env.BETTER_AUTH_SECRET ?? "dev-insecure-secret-change-me",
    url: process.env.BETTER_AUTH_URL ?? "http://localhost:3010",
    /**
     * Ouvre l'inscription email/password. Passer à false une fois les comptes
     * parent + co-parent créés (MVP à foyer fermé).
     */
    signupEnabled: process.env.SIGNUP_ENABLED !== "false",
  },
  /** Origines autorisées par CORS (front en dev + reverse proxy). */
  corsOrigins,
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
  invitationTtlDays: Number(process.env.INVITATION_TTL_DAYS ?? 14),
  /**
   * Webhook optionnel (ntfy, etc.) pour livrer les liens aux proches. Sans lui,
   * les liens sont journalisés côté serveur et l'admin copie le lien depuis l'UI.
   */
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL,
  /**
   * E-mail (SMTP) pour les notifications aux proches abonnés. Optionnel : si
   * SMTP_HOST est absent, les e-mails sont désactivés (notifs in-app seules).
   */
  mail: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? "Racontine <no-reply@racontine.local>",
  },
};
