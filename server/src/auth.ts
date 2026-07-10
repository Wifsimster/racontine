import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";
import { config } from "./config.js";

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
    disableSignUp: !config.auth.signupEnabled,
  },
  session: {
    // Usage quotidien sur téléphone : session longue.
    expiresIn: 60 * 60 * 24 * 30, // 30 jours
    updateAge: 60 * 60 * 24, // prolongée chaque jour d'usage
  },
});

export type AuthSession = typeof auth.$Infer.Session;
