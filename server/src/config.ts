function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return ["http://localhost:5173", "http://localhost:8080"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  /**
   * URL publique du front (PWA) — sert à construire les liens des e-mails de
   * notification. Défaut : première origine CORS.
   */
  appUrl:
    process.env.APP_URL ??
    parseOrigins(process.env.CORS_ORIGINS)[0] ??
    "http://localhost:5173",
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
