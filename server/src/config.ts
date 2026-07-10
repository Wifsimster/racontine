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
   * Base publique du front, pour construire les liens d'invitation et de magic
   * link envoyés aux proches. Défaut : la 1re origine CORS (le reverse proxy).
   */
  webBaseUrl: (
    process.env.WEB_BASE_URL ??
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
};
