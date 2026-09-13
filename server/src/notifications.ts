/**
 * FAÇADE DE NOTIFICATION — le nom qu'appelle le reste du code.
 *
 * L'implémentation vit dans `notifications/` : un orchestrateur, un registre
 * in-app, et un canal par moyen de joindre les proches (e-mail, Web Push).
 * Ajouter un canal ne se voit pas d'ici.
 */
import { subscriberNotifier } from "./composition.js";

export type { PublicationEvent, Recipient } from "./notifications/types.js";

/**
 * Notifie les abonnés à la timeline d'un enfant qu'une journée vient d'être
 * publiée. L'auteur de la publication est exclu. Ne lève jamais.
 */
export function notifyEntryPublished(params: {
  entryId: string;
  childId: string;
  childName: string;
  date: string;
  actorUserId?: string | null;
}): Promise<void> {
  return subscriberNotifier.entryPublished(params);
}
