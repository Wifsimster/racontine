import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";
import { config } from "./config.js";
import { deliverLink } from "./notify.js";
import { getSettings } from "./settings.js";
import { ownerUserId } from "./access.js";

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
      // AMORÇAGE : une instance sans aucun compte accepte toujours le premier.
      // Sans cette exception, le défaut fermé en production (voir `config.ts`)
      // rendrait une installation neuve impossible à démarrer — l'écran de
      // création de compte refuserait le compte du propriétaire lui-même.
      // Le premier compte créé EST le propriétaire (cf. `ownerUserId`) : cette
      // porte se referme donc d'elle-même, dès qu'elle a servi une fois.
      if ((await ownerUserId()) === null) return;
      const { signupEnabled } = await getSettings();
      if (!signupEnabled)
        throw new APIError("FORBIDDEN", {
          message: "Les inscriptions sont fermées sur cette instance.",
        });
    }),
  },
  advanced: {
    ipAddress: {
      // Sans cette liste, Better Auth ne résout aucune adresse cliente derrière
      // nginx et limite le débit sur un seau unique partagé par toute
      // l'instance — voir `config.trustedProxies` pour le détail.
      trustedProxies: config.trustedProxies,
    },
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
