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

    /**
     * MOT DE PASSE OUBLIÉ — la vraie réinitialisation.
     *
     * Sans cette fonction, Better Auth REFUSE `/request-password-reset`
     * (« Reset password isn't enabled ») : l'instance n'avait donc aucun
     * chemin de récupération, et la seule issue offerte à l'écran de connexion
     * était « recevoir un lien par e-mail » — un MAGIC LINK, qui ouvre une
     * session sans jamais toucher au mot de passe. Demander à changer son mot
     * de passe et recevoir un lien de connexion : les deux liens se
     * ressemblent, la promesse n'était pas tenue, et le mot de passe oublié
     * le restait.
     *
     * Les deux liens sont donc désormais DEUX objets distincts, et l'objet du
     * message le dit dès la boîte de réception : « lien de connexion » d'un
     * côté, « réinitialiser votre mot de passe » de l'autre.
     *
     * `url` pointe sur `/api/auth/reset-password/<jeton>?callbackURL=…` : le
     * serveur vérifie le jeton, puis redirige vers l'écran `/reset-password`
     * du front avec le jeton en query. C'est cette page qui choisit le nouveau
     * mot de passe. Comme le magic link, l'URL est une CAPACITÉ : elle passe
     * par `deliverLink`, qui ne la journalise jamais en production.
     */
    async sendResetPassword({ user, url }) {
      await deliverLink(
        user.email,
        "Réinitialiser votre mot de passe Racontine",
        url,
      );
    },
    /**
     * Une heure (le défaut de Better Auth, posé ici pour qu'il soit LU : la
     * page de réinitialisation l'annonce à la personne qui attend son e-mail).
     * Un lien de réinitialisation n'a pas la durée de vie d'une invitation :
     * il vaut le compte entier, et il se demande en dix secondes.
     */
    resetPasswordTokenExpiresIn: 60 * 60,
    /**
     * Un mot de passe qu'on réinitialise est un mot de passe dont on a pu
     * perdre le contrôle : toutes les sessions ouvertes tombent. Le prix est
     * connu (il faut se reconnecter sur le téléphone), et c'est exactement ce
     * qu'on veut si quelqu'un d'autre en tenait une.
     */
    revokeSessionsOnPasswordReset: true,
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
    // fonctionne même quand l'inscription email/password est fermée. Ce n'est
    // PAS le chemin du mot de passe oublié : celui-ci passe par
    // `sendResetPassword` ci-dessus et mène au choix d'un nouveau mot de passe.
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
