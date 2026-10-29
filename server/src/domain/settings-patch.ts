import type { SettingsPatch } from "../settings.js";

export type PatchOk = { ok: true; patch: SettingsPatch };
export type PatchRejection = { ok: false; error: string };
export type PatchResult = PatchOk | PatchRejection;

export type RawSettingsPatch = {
  appName?: unknown;
  signupEnabled?: unknown;
  invitationTtlDays?: unknown;
  vlmModel?: unknown;
  emailNotificationsEnabled?: unknown;
};

const reject = (error: string): PatchRejection => ({ ok: false, error });

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
