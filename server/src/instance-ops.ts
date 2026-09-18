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

/* ===========================================================================
   PILOTER L'INSTANCE — le contrat, pas les modules qui le remplissent.

   Les réglages, le propriétaire et l'état de l'infrastructure se lisent dans
   quatre modules différents (`settings`, `access`, `mailer`, `push`), tous des
   singletons branchés sur la base et l'environnement. Un outil MCP qui les
   importerait directement ne serait plus testable sans base — et c'est
   exactement ce qu'on a refusé partout ailleurs dans le serveur.

   D'où ce port : les outils décrivent ce qu'ils veulent piloter, la racine de
   composition décide qui le fait vraiment.
   =========================================================================== */

/**
 * Ce que l'environnement fixe et que le propriétaire ne peut PAS changer depuis
 * l'application — mais dont l'état répond à « pourquoi les e-mails ne partent
 * pas ? » sans ouvrir un shell sur le serveur.
 */
export type InstanceInfra = {
  mailConfigured: boolean;
  webPushConfigured: boolean;
  notifyWebhookConfigured: boolean;
  webBaseUrl: string;
  knownVlmModels: readonly string[];
};

/** Les gestes d'exploitation d'une instance. */
export interface InstanceOps {
  /** Version du serveur qui répond (celle de `server/package.json`). */
  readonly version: string;
  /** Le propriétaire de l'instance — le premier compte créé, et lui seul. */
  isOwner(userId: string): Promise<boolean>;
  settings(): Promise<EffectiveSettings>;
  update(patch: SettingsPatch, userId: string): Promise<EffectiveSettings>;
  infra(): InstanceInfra;
}

/**
 * Métadonnées d'infrastructure, lues de l'environnement. Partagées par l'écran
 * Réglages (`GET /api/settings`) et par les outils MCP : deux surfaces, une
 * seule réponse à « l'e-mail est-il configuré ? ».
 */
export function infraMeta(): InstanceInfra {
  return {
    mailConfigured: mailEnabled(),
    webPushConfigured: webPushEnabled(),
    notifyWebhookConfigured: !!config.notifyWebhookUrl,
    webBaseUrl: config.webBaseUrl,
    knownVlmModels: KNOWN_VLM_MODELS,
  };
}

/** L'instance réellement en train de tourner. */
export class LiveInstanceOps implements InstanceOps {
  readonly version = SERVER_VERSION;
  isOwner = isOwner;
  settings = getSettings;
  update = updateSettings;
  infra = infraMeta;
}
