import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { appSettings } from "./db/schema.js";
import { config } from "./config.js";

/** La table `app_settings` est un singleton : une seule ligne, cette clé. */
const SINGLETON_ID = "singleton";

/** Modèles VLM proposés dans l'UI (valeur libre acceptée côté API si besoin). */
export const KNOWN_VLM_MODELS = [
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
] as const;

export const DEFAULT_APP_NAME = "Racontine";

/**
 * Réglages effectifs de l'instance : ce que le reste du code doit consulter.
 * Toujours défini (les nuls en base retombent sur les défauts d'environnement).
 */
export type EffectiveSettings = {
  appName: string;
  signupEnabled: boolean;
  invitationTtlDays: number;
  vlmModel: string;
  emailNotificationsEnabled: boolean;
};

/** Ce que le propriétaire peut modifier (undefined = inchangé). */
export type SettingsPatch = Partial<{
  appName: string | null;
  signupEnabled: boolean;
  invitationTtlDays: number;
  vlmModel: string;
  emailNotificationsEnabled: boolean;
}>;

/** Défauts issus de l'environnement (config.ts) — socle sous la ligne DB. */
function defaults(): EffectiveSettings {
  return {
    appName: DEFAULT_APP_NAME,
    signupEnabled: config.auth.signupEnabled,
    invitationTtlDays: config.invitationTtlDays,
    vlmModel: config.vlmModel,
    // Les e-mails de notification restent conditionnés à une config SMTP valide ;
    // ce drapeau est un interrupteur global en plus de ça.
    emailNotificationsEnabled: true,
  };
}

/**
 * Réglages effectifs = ligne DB superposée aux défauts d'environnement. Chaque
 * colonne nulle (jamais renseignée, ou remise à défaut) hérite de l'environnement,
 * si bien qu'un changement de variable d'env reste pris en compte tant que le
 * propriétaire n'a pas fixé la valeur dans l'UI.
 */
export async function getSettings(): Promise<EffectiveSettings> {
  const base = defaults();
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, SINGLETON_ID))
    .limit(1);
  if (!row) return base;
  return {
    appName: row.appName ?? base.appName,
    signupEnabled: row.signupEnabled ?? base.signupEnabled,
    invitationTtlDays: row.invitationTtlDays ?? base.invitationTtlDays,
    vlmModel: row.vlmModel ?? base.vlmModel,
    emailNotificationsEnabled:
      row.emailNotificationsEnabled ?? base.emailNotificationsEnabled,
  };
}

/**
 * Applique un patch (upsert sur la ligne singleton) puis renvoie les réglages
 * effectifs recalculés. Ne touche qu'aux champs fournis.
 */
export async function updateSettings(
  patch: SettingsPatch,
  userId: string,
): Promise<EffectiveSettings> {
  const set = { ...patch, updatedBy: userId, updatedAt: new Date() };
  await db
    .insert(appSettings)
    .values({ id: SINGLETON_ID, ...set })
    .onConflictDoUpdate({ target: appSettings.id, set });
  return getSettings();
}
