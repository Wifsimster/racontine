import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { appSettings } from "./db/schema.js";
import { config } from "./config.js";

const SINGLETON_ID = "singleton";

export const KNOWN_VLM_MODELS = [
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
] as const;

export const DEFAULT_APP_NAME = "Racontine";

export type EffectiveSettings = {
  appName: string;
  signupEnabled: boolean;
  invitationTtlDays: number;
  vlmModel: string;
  emailNotificationsEnabled: boolean;
};

export type SettingsPatch = Partial<{
  appName: string | null;
  signupEnabled: boolean;
  invitationTtlDays: number;
  vlmModel: string;
  emailNotificationsEnabled: boolean;
}>;

function defaults(): EffectiveSettings {
  return {
    appName: DEFAULT_APP_NAME,
    signupEnabled: config.auth.signupEnabled,
    invitationTtlDays: config.invitationTtlDays,
    vlmModel: config.vlmModel,
    emailNotificationsEnabled: true,
  };
}

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
