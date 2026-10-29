import { betterAuth } from "better-auth";
import { and, eq, gt, sql } from "drizzle-orm";
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
    requireEmailVerification: false,

    async sendResetPassword({ user, url }) {
      await deliverLink(
        user.email,
        "Réinitialiser votre mot de passe Racontine",
        url,
        "mot-de-passe",
      );
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
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
      trustedProxies: config.trustedProxies,
    },
  },
  plugins: [
    magicLink({
      async sendMagicLink({ email, url }) {
        if (!(await magicLinkMayOpen(email))) return;
        await deliverLink(
          email,
          "Votre lien de connexion Racontine",
          url,
          "connexion",
        );
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
});

async function magicLinkMayOpen(email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(sql`lower(${schema.user.email}) = ${address}`)
    .limit(1);
  if (existing) return true;
  if ((await ownerUserId()) === null) return true;
  if ((await getSettings()).signupEnabled) return true;
  const [invited] = await db
    .select({ id: schema.invitations.id })
    .from(schema.invitations)
    .where(
      and(
        sql`lower(${schema.invitations.email}) = ${address}`,
        eq(schema.invitations.status, "pending"),
        gt(schema.invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(invited);
}

export type AuthSession = typeof auth.$Infer.Session;
