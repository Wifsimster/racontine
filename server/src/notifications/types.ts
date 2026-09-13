import type { DayChip } from "../domain/day-glance.js";

/* ===========================================================================
   PRÉVENIR LES PROCHES — un canal, une classe.

   Tout tenait dans une seule fonction : requête des abonnés, écriture de la
   notification en base, gabarit HTML de l'e-mail, envoi SMTP, envoi Web Push,
   lecture des réglages d'instance. Ajouter un canal (Telegram, Signal, un
   webhook maison) voulait dire rouvrir cette fonction et allonger sa boucle —
   au risque qu'un canal en échec emporte les autres.

   Un canal implémente désormais `NotificationChannel` : il dit s'il est
   utilisable dans cette instance, et il livre à UN destinataire. L'orchestrateur
   les parcourt sans savoir ce qu'ils font. Ajouter un canal, c'est ajouter un
   fichier et l'inscrire dans la liste — sans toucher à l'orchestrateur.
   =========================================================================== */

/** Ce qu'il y a à annoncer : une journée publiée, déjà mise en phrases. */
export type PublicationEvent = {
  entryId: string;
  childId: string;
  childName: string;
  /** AAAA-MM-JJ. */
  date: string;
  /** La même date en français (« mardi 25 novembre »), pour les surfaces. */
  dateLabel: string;
  title: string;
  body: string;
  /** Lien profond vers la journée. */
  link: string;
};

/** Un abonné à prévenir. */
export type Recipient = {
  userId: string;
  email: string | null;
  name: string;
  /** L'abonné a-t-il gardé les e-mails de notification ? */
  emailEnabled: boolean;
};

/**
 * Un moyen de joindre un abonné. Le contrat est volontairement minuscule : ce
 * que l'orchestrateur a besoin de savoir, et rien de ce qui regarde le canal.
 */
export interface NotificationChannel {
  /** Nom court, pour les journaux. */
  readonly name: string;
  /**
   * Ce canal est-il utilisable dans cette instance (secrets configurés,
   * interrupteur global du propriétaire) ? Évalué une fois par publication.
   */
  isEnabled(): Promise<boolean>;
  /**
   * Livre à un destinataire. Rend la date de remise quand le canal en tient une
   * (l'e-mail la trace, pour l'afficher dans l'app), sinon null. Un canal qui
   * n'a rien à faire pour ce destinataire (préférence coupée) rend null.
   */
  deliver(event: PublicationEvent, recipient: Recipient): Promise<Date | null>;
}

/**
 * Le registre des notifications in-app : c'est LE REGISTRE, pas un canal — la
 * ligne écrite ici est celle que l'app affiche, et c'est elle que l'e-mail
 * vient horodater une fois remis.
 */
export interface NotificationLog {
  /** Écrit la notification de l'abonné et rend son identifiant. */
  record(event: PublicationEvent, recipient: Recipient): Promise<string>;
  /** Horodate la remise externe (e-mail) d'une notification déjà écrite. */
  markDelivered(notificationId: string, at: Date): Promise<void>;
}

/**
 * La bande de feutres d'une journée (« 2 repas · sieste 2 h 05 · joyeuse »),
 * telle que l'e-mail la reprend. Un port : le canal ne sait pas d'où elle sort,
 * et le calcul lui-même est pur (voir `domain/day-glance.ts`).
 */
export interface DayGlance {
  chipsFor(entryId: string): Promise<DayChip[]>;
}

/** Qui suit la timeline d'un enfant, et peut donc être prévenu. */
export interface SubscriberDirectory {
  /**
   * Abonnés ENCORE membres du cercle de l'enfant, l'auteur de la publication
   * exclu : un proche dont l'accès a été révoqué ne doit plus rien recevoir,
   * même si sa ligne d'abonnement subsiste.
   */
  subscribersOf(
    childId: string,
    excludeUserId?: string | null,
  ): Promise<Recipient[]>;
}
