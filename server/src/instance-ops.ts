import { isOwner } from "./access.js";
import { config } from "./config.js";
import { mailEnabled } from "./mailer.js";
import { webPushEnabled } from "./push.js";
import {
  getSettings,
  updateSettings,
  KNOWN_VLM_MODELS,
  type EffectiveSettings,
  type SettingsPatch,
} from "./settings.js";
import { SERVER_VERSION } from "./version.js";

export type InstanceInfra = {
  mailConfigured: boolean;
  webPushConfigured: boolean;
  notifyWebhookConfigured: boolean;
  webBaseUrl: string;
  knownVlmModels: readonly string[];
};

export interface InstanceOps {
  readonly version: string;
  isOwner(userId: string): Promise<boolean>;
  settings(): Promise<EffectiveSettings>;
  update(patch: SettingsPatch, userId: string): Promise<EffectiveSettings>;
  infra(): InstanceInfra;
}

export function infraMeta(): InstanceInfra {
  return {
    mailConfigured: mailEnabled(),
    webPushConfigured: webPushEnabled(),
    notifyWebhookConfigured: !!config.notifyWebhookUrl,
    webBaseUrl: config.webBaseUrl,
    knownVlmModels: KNOWN_VLM_MODELS,
  };
}

export class LiveInstanceOps implements InstanceOps {
  readonly version = SERVER_VERSION;
  isOwner = isOwner;
  settings = getSettings;
  update = updateSettings;
  infra = infraMeta;
}
