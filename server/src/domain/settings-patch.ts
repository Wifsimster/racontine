import type { SettingsPatch } from "../settings.js";

/* ===========================================================================
   CE QUE LE PROPRIÉTAIRE PEUT CHANGER — la règle, une seule fois.

   Ces validations vivaient dans le gestionnaire HTTP de `PATCH /api/settings`,
   entremêlées de `reply.code(400)`. Elles n'ont pourtant rien d'HTTP : « le nom
   de l'instance fait 1 à 60 caractères » est une règle du produit, et un second
   chemin d'écriture (l'outil MCP `update_instance_settings`, qui permet à un
   agent de piloter l'instance en production) l'aurait recopiée — c'est-à-dire
   fait diverger le jour où la borne bouge.

   Fonction pure : elle reçoit un objet non fiable et rend soit un patch propre,
   soit le message français exact que la route et l'outil rendront tels quels.
   =========================================================================== */

export type PatchOk = { ok: true; patch: SettingsPatch };
export type PatchRejection = { ok: false; error: string };
export type PatchResult = PatchOk | PatchRejection;

/** Ce qu'un appelant peut envoyer — chaque champ absent laisse la valeur en place. */
export type RawSettingsPatch = {
  appName?: unknown;
  signupEnabled?: unknown;
  invitationTtlDays?: unknown;
  vlmModel?: unknown;
  emailNotificationsEnabled?: unknown;
};

const reject = (error: string): PatchRejection => ({ ok: false, error });

/**
 * Valide un patch de réglages. Le nom de l'instance accepte `null` et la chaîne
 * vide comme « remise au défaut » (la colonne redevient nulle en base, et la
 * variable d'environnement reprend la main — voir `settings.ts`).
 */
export function parseSettingsPatch(raw: RawSettingsPatch): PatchResult {
  const patch: SettingsPatch = {};

  if (raw.appName !== undefined) {
    if (raw.appName === null || raw.appName === "") {
      patch.appName = null;
    } else if (typeof raw.appName === "string") {
      const name = raw.appName.trim();
      if (!name || name.length > 60)
        return reject("nom de l'instance invalide (1 à 60 caractères)");
      patch.appName = name;
    } else {
      return reject("appName invalide");
    }
  }

  if (raw.signupEnabled !== undefined) {
    if (typeof raw.signupEnabled !== "boolean")
      return reject("signupEnabled invalide");
    patch.signupEnabled = raw.signupEnabled;
  }

  if (raw.emailNotificationsEnabled !== undefined) {
    if (typeof raw.emailNotificationsEnabled !== "boolean")
      return reject("emailNotificationsEnabled invalide");
    patch.emailNotificationsEnabled = raw.emailNotificationsEnabled;
  }

  if (raw.invitationTtlDays !== undefined) {
    const n = Number(raw.invitationTtlDays);
    if (!Number.isInteger(n) || n < 1 || n > 365)
      return reject("durée d'invitation invalide (1 à 365 jours)");
    patch.invitationTtlDays = n;
  }

  if (raw.vlmModel !== undefined) {
    if (typeof raw.vlmModel !== "string" || !raw.vlmModel.trim())
      return reject("modèle VLM invalide");
    const model = raw.vlmModel.trim();
    if (model.length > 100) return reject("modèle VLM invalide");
    patch.vlmModel = model;
  }

  return { ok: true, patch };
}
