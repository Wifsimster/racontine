import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";
import { config } from "./config.js";
import { deliverLink } from "./notify.js";
import { getSettings } from "./settings.js";

export const auth = betterAuth({
  secret: config.auth.secret,
  baseURL: config.auth.url,
  basePath: "/api/auth",
  trustedOrigins: config.corsOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Foyer fermé : usage quotidien, pas de vérification email en MVP.
    requireEmailVerification: false,
    // L'ouverture des inscriptions est pilotée à chaud par le réglage
    // `signupEnabled` (voir le hook `before` ci-dessous), et non figée au
    // démarrage : le propriétaire peut fermer/rouvrir depuis l'UI.
  },
  hooks: {
    // Bloque l'inscription email/mot de passe quand le propriétaire l'a fermée.
    // Ne concerne QUE /sign-up/email : les proches invités par magic link
    // continuent de rejoindre le cercle même inscriptions fermées.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const { signupEnabled } = await getSettings();
      if (!signupEnabled)
        throw new APIError("FORBIDDEN", {
          message: "Les inscriptions sont fermées sur cette instance.",
        });
    }),
  },
  plugins: [
    // Magic link : connexion sans mot de passe pour les proches invités —
    // fonctionne même quand l'inscription email/password est fermée.
    magicLink({
      async sendMagicLink({ email, url }) {
        await deliverLink(email, "Votre lien de connexion Racontine", url);
      },
    }),
  ],
  session: {
    // Usage quotidien sur téléphone : session longue.
    expiresIn: 60 * 60 * 24 * 30, // 30 jours
    updateAge: 60 * 60 * 24, // prolongée chaque jour d'usage
  },
});

export type AuthSession = typeof auth.$Infer.Session;
