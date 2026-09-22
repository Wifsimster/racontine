import type { Entry, Uncertainty } from "./db/schema.js";
import type { CarnetDay } from "./domain/carnet.js";
import type { ItemRow } from "./domain/entry-items.js";
import type { Source } from "./domain/entry-metadata.js";
import type { MemberRole } from "./db/schema.js";
import type { CarnetStanding, ErasureSnapshot } from "./domain/erasure.js";

/* ===========================================================================
   LES PORTS — ce dont les services ONT BESOIN, et rien de plus.

   Avant, chaque service importait le monde : `db` (donc Postgres), `sharp`,
   le SDK Anthropic, `nodemailer`, `web-push`. Le code métier ne pouvait donc
   pas s'exécuter sans eux — pas un seul test de la lecture d'un carnet, pas un
   seul test d'une publication, sans une base qui tourne et une clé d'API qui
   facture. Les tests existants le disaient à leur façon : « rejette une date
   mal formée SANS TOUCHER LA BASE », c'est-à-dire « tant que la validation
   reste la première ligne de la fonction ».

   Chaque interface ci-dessous est écrite du point de vue de CELUI QUI APPELLE :
   elle nomme un besoin (« range cette image », « lis ces pages », « préviens les
   abonnés »), pas une technique. Les implémentations réelles vivent dans
   `adapters/`, le branchement dans `composition.ts`, et un test fournit ses
   propres doublures.
   =========================================================================== */

/** Image de carnet rangée sur le support de stockage. */
export type StoredImage = {
  originalPath: string;
  thumbPath: string;
  mime: string;
  width: number;
  height: number;
};

/** Rangement des pages de carnet (normalisation, miniature, suppression). */
export interface ImageStore {
  /** Normalise et range une page ; lève si l'image est indécodable. */
  store(input: Buffer): Promise<StoredImage>;
  /** Relit une page rangée, par son chemin relatif. */
  read(relPath: string): Promise<Buffer>;
  /** Efface une page rangée. Best-effort : un fichier absent n'est pas une erreur. */
  delete(img: { originalPath: string; thumbPath: string }): Promise<void>;
  /**
   * TOURNE POUR DE BON une page déjà rangée (le fichier plein cadre et sa
   * miniature sont réécrits) et rend ses nouvelles dimensions.
   */
  rotate(
    img: { originalPath: string; thumbPath: string | null },
    quarters: number,
  ): Promise<{ width: number; height: number }>;
}

/** Correction déjà validée par un proche pour un enfant. */
export type GlossaryEntry = { original: string; corrected: string };

/** Lecture d'un carnet : des pages en entrée, des journées structurées en sortie. */
export interface CarnetReader {
  /**
   * Rend une journée par date distincte détectée dans le lot. Lève une
   * `CarnetReadError` dont le message est déjà sûr à afficher.
   */
  read(
    pages: Buffer[],
    apiKey: string,
    glossary: GlossaryEntry[],
  ): Promise<CarnetDay[]>;
}

/** Clé d'API du modèle, propre à chaque utilisateur. */
export interface ApiKeyStore {
  /** Clé en clair de l'utilisateur, ou null si non configurée / illisible. */
  getKey(userId: string): Promise<string | null>;
}

/** Vocabulaire déjà confirmé pour un enfant, réinjecté aux lectures suivantes. */
export interface GlossaryStore {
  forChild(childId: string): Promise<GlossaryEntry[]>;
}

/** Droits d'un utilisateur sur les enfants. */
export interface AccessPolicy {
  accessibleChildIds(userId: string): Promise<string[]>;
  hasChildRole(userId: string, childId: string, min: MemberRole): Promise<boolean>;
  /** Rôle exact sur un enfant, ou null s'il n'y a pas accès. */
  roleOn(userId: string, childId: string): Promise<MemberRole | null>;
}

/**
 * LE PÉAGE, vu par le code métier : une seule question, une seule réponse.
 *
 * Ni Stripe, ni abonnement, ni essai n'apparaissent ici — un service qui crée
 * une journée n'a aucune raison de connaître un prestataire de paiement. Il
 * demande s'il a le droit d'ouvrir une NOUVELLE journée, et reçoit soit `null`
 * (vas-y), soit la phrase à afficher à qui a demandé.
 *
 * Rappel de la règle qu'implémente l'adaptateur : LIRE est toujours gratuit,
 * pour toujours. Seul l'ajout d'une journée passe par ici.
 */
export interface Paywall {
  /** `null` si le carnet est ouvert ; sinon la phrase du refus (HTTP 402). */
  blockedReason(): Promise<string | null>;
}

/** Prévenir les abonnés d'une journée publiée. Ne lève jamais. */
export interface PublicationNotifier {
  entryPublished(params: {
    entryId: string;
    childId: string;
    childName: string;
    date: string;
    actorUserId?: string | null;
  }): Promise<void>;
}

/**
 * Travail lancé sans attendre sa fin (la lecture d'un carnet dure des dizaines
 * de secondes ; la réponse HTTP, elle, part tout de suite).
 *
 * C'est un PORT et non un `void promise.catch(...)` recopié partout : la
 * production le laisse filer en arrière-plan, un test l'exécute à la file et
 * peut donc observer le résultat de la lecture sans dormir.
 */
export interface BackgroundRunner {
  run(label: string, task: () => Promise<void>): void;
}

/** Journal d'exploitation — les services ne parlent jamais à `console`. */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/* --------------------------- Entrées & pages ----------------------------- */

/** Champs de contenu d'une journée, tels qu'une lecture les produit. */
export type EntryContent = {
  mood: string | null;
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
  uncertainties: Uncertainty[];
};

/** Journée telle que le dépôt la rend. */
export type EntryRecord = Entry;

/** Journée à créer. */
export type NewEntry = {
  childId: string;
  date: string;
  source: Source;
  status: "processing" | "draft" | "published";
  createdBy: string;
  batchId?: string | null;
  publishedAt?: Date | null;
} & Partial<EntryContent>;

/**
 * Dépôt des journées. Les opérations sensibles à la concurrence sont EXPRIMÉES
 * DANS LE PORT (« crée si absente », « ne bascule que si encore en lecture »),
 * et non laissées à l'appelant : c'est la seule façon qu'une autre
 * implémentation — ou une doublure de test — respecte les mêmes garanties que
 * le SQL qu'elles remplacent.
 */
export interface EntryRepository {
  findById(entryId: string): Promise<EntryRecord | null>;
  findByDay(
    childId: string,
    date: string,
    source: Source,
  ): Promise<EntryRecord | null>;
  /** Crée la journée, ou rend null si elle existe déjà (enfant + date + source). */
  createIfAbsent(entry: NewEntry): Promise<EntryRecord | null>;
  /** Crée la journée et ses moments d'un seul tenant ; null si elle existe déjà. */
  createWithItems(
    entry: NewEntry,
    items: ItemRow[],
  ): Promise<EntryRecord | null>;
  /**
   * Repasse une journée en lecture, SAUF si elle est publiée — vérifié dans la
   * même écriture : une publication survenue entre la lecture de l'état et
   * cette bascule ne doit pas être rouverte. False si elle était publiée.
   */
  markProcessingUnlessPublished(entryId: string): Promise<boolean>;
  /**
   * Remplace contenu ET moments d'une journée ENCORE EN LECTURE, d'un seul
   * tenant. Rend false si la journée a changé d'état entre-temps (relecture
   * humaine concurrente) — auquel cas rien n'est écrit.
   */
  applyReadingIfProcessing(
    entryId: string,
    patch: EntryContent & { date?: string; batchId?: string | null },
    items: ItemRow[],
  ): Promise<boolean>;
  /** Remplace contenu et moments d'une journée, sans condition d'état. */
  replaceReading(
    entryId: string,
    patch: EntryContent & { batchId?: string | null },
    items: ItemRow[],
  ): Promise<void>;
  /** Marque « échec » une journée ENCORE EN LECTURE (sinon ne fait rien). */
  failIfProcessing(entryId: string, reason: string): Promise<boolean>;
  /** Bascule `failed` → `processing`. False si la journée n'est plus en échec. */
  claimFailedForRetry(entryId: string): Promise<boolean>;
  /** Passe en échec toutes les journées restées « en lecture ». Rend leur nombre. */
  reclaimProcessing(reason: string): Promise<number>;
  /** Ajoute une incertitude à celles déjà portées par la journée. */
  appendUncertainty(entryId: string, uncertainty: Uncertainty): Promise<void>;
}

/** Dépôt des pages photographiées rattachées à une journée. */
export interface AttachmentRepository {
  /** Chemins des pages d'une journée, dans l'ordre d'affichage. */
  pathsFor(entryId: string): Promise<string[]>;
  /** Identifiants des pages d'une journée, dans l'ordre d'affichage. */
  idsFor(entryId: string): Promise<string[]>;
  /** Première position libre à la suite des pages déjà rattachées. */
  nextPosition(entryId: string): Promise<number>;
  /** Rattache des pages fraîchement rangées, à partir de `startPosition`. */
  addMany(
    entryId: string,
    images: StoredImage[],
    startPosition: number,
  ): Promise<void>;
  /** Déplace des pages existantes vers une autre journée, à la suite des siennes. */
  moveTo(attachmentIds: string[], targetEntryId: string): Promise<void>;
}

/** Champs qu'une relecture humaine peut modifier sur une journée. */
export type EntryRevision = Partial<{
  mood: string | null;
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
  source: Source;
  date: string;
  uncertainties: Uncertainty[];
}>;

/** Correction de lecture validée par un proche, versée au glossaire de l'enfant. */
export type RecordedCorrection = {
  childId: string;
  original: string;
  corrected: string;
  field: Uncertainty["champ"];
  entryId: string;
  createdBy: string;
};

/**
 * Les ÉCRITURES de relecture — séparées du dépôt de lecture automatique parce
 * qu'elles servent un autre appelant (l'écran de relecture) et qu'aucun des
 * deux n'a besoin des méthodes de l'autre.
 */
export interface EntryRevisionRepository {
  /**
   * Applique une révision : champs, moments (si fournis) et publication, d'un
   * seul tenant. `firstPublish` distingue la VRAIE première publication d'une
   * republication — deux requêtes concurrentes ne peuvent pas toutes deux la
   * revendiquer, ce qui interdit les notifications en double.
   *
   * Lève `DuplicateEntryError` si la date/source visée est déjà prise, et
   * `InvalidEntryDateError` si la date est syntaxiquement valide mais
   * impossible (2026-13-40).
   */
  revise(
    entryId: string,
    patch: EntryRevision,
    items: ItemRow[] | null,
    publish: boolean,
  ): Promise<{ firstPublish: boolean }>;
  /** Écrit la lecture tranchée ET la correction qui alimente le glossaire. */
  saveResolvedReading(
    entryId: string,
    patch: EntryRevision,
    correction: RecordedCorrection,
  ): Promise<void>;
  /**
   * Supprime une journée (et, par cascade, ses moments et ses pages) et rend
   * les fichiers de ses pages : la cascade n'efface que les LIGNES, les photos
   * du carnet restent à effacer du disque.
   */
  remove(
    entryId: string,
  ): Promise<{ originalPath: string; thumbPath: string | null }[]>;
}

/** Création d'un enfant et du cercle qui va avec. */
export interface ChildRepository {
  /** Crée l'enfant, en fait son créateur admin, et l'abonne à sa timeline. */
  createWithOwner(params: {
    name: string;
    birthdate: string | null;
    ownerUserId: string;
  }): Promise<{ id: string; name: string; birthdate: string | null; createdAt: Date }>;
}

/** Une page photographiée, avec la journée qui la porte. */
export type PageRecord = {
  id: string;
  entryId: string;
  originalPath: string;
  thumbPath: string | null;
  mime: string;
  rotation: number;
  width: number | null;
  height: number | null;
  childId: string;
  entryStatus: string;
};

/** Dépôt des pages, vu du côté « une page à la fois ». */
export interface PageRepository {
  findWithEntry(attachmentId: string): Promise<PageRecord | null>;
  /** Nombre de pages rattachées à la même journée (dont celle-ci). */
  countSiblings(entryId: string): Promise<number>;
  saveRotation(
    attachmentId: string,
    size: { width: number; height: number; rotation: number },
  ): Promise<void>;
  remove(attachmentId: string): Promise<void>;
}

/** Nom d'un enfant (pour les messages de notification). */
export interface ChildDirectory {
  nameOf(childId: string): Promise<string | null>;
}

/* ------------------------- Emporter ses données, partir ------------------- */

/**
 * Fichier rangé sur le support de stockage, tel qu'on le retrouve pour
 * l'effacer. `thumbPath` est nullable en base : une page importée avant les
 * miniatures n'en a pas.
 */
export type StoredFile = { originalPath: string; thumbPath: string | null };

/** Une page photographiée, dans l'export (les octets se retirent par `url`). */
export type ExportedPage = {
  id: string;
  mime: string;
  width: number | null;
  height: number | null;
  /** Adresse de la photo dans cette instance, à ouvrir avec la même session. */
  url: string;
};

/** Une journée, telle qu'elle part dans l'export. */
export type ExportedEntry = {
  id: string;
  date: string;
  source: string;
  status: string;
  mood: string | null;
  title: string | null;
  story: string | null;
  highlight: string | null;
  transcription: string | null;
  uncertainties: Uncertainty[];
  createdAt: string;
  publishedAt: string | null;
  items: { type: string; data: unknown; position: number }[];
  pages: ExportedPage[];
};

/** Un carnet suivi par le compte, avec ce qu'il a le droit d'y lire. */
export type ExportedCarnet = {
  id: string;
  name: string;
  birthdate: string | null;
  role: MemberRole;
  since: string;
  /** L'abonnement aux notifications de ce carnet, s'il en a un. */
  subscription: { emailEnabled: boolean } | null;
  entries: ExportedEntry[];
  /** Les lectures que CE compte a tranchées, versées au glossaire de l'enfant. */
  corrections: {
    original: string;
    corrected: string;
    field: string | null;
    at: string;
  }[];
};

/**
 * TOUT CE QUE L'INSTANCE SAIT D'UN COMPTE — et rien de plus.
 *
 * Deux règles de composition, toutes deux volontaires :
 *
 *  · CE QUE LE COMPTE PEUT DÉJÀ LIRE. L'export n'ouvre aucune porte que l'écran
 *    n'ouvrait pas : un lecteur y retrouve le journal publié qu'il consulte, pas
 *    les brouillons que l'app lui cache. Un export plus généreux que l'app
 *    serait une fuite déguisée en droit d'accès — et le droit d'accès porte sur
 *    SES données, pas sur celles du foyer qui l'a invité.
 *  · AUCUN SECRET. Mot de passe, jetons de session, hash des jetons MCP, clé API
 *    chiffrée, jetons d'invitation : rien de tout cela ne sort. Ce sont des
 *    CAPACITÉS, pas des informations — les rendre à leur porteur, c'est fabriquer
 *    un fichier qui ouvre le compte à quiconque le trouvera dans un dossier de
 *    téléchargements. On rend donc ce qui décrit (« une clé est configurée, elle
 *    finit par 4f2a »), jamais ce qui ouvre.
 */
export type ExportArchive = {
  /** Étiquette de format : un export relu dans deux ans doit se reconnaître. */
  format: "racontine.export.v1";
  exportedAt: string;
  account: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    isOwner: boolean;
  };
  carnets: ExportedCarnet[];
  notifications: {
    type: string;
    title: string;
    body: string | null;
    createdAt: string;
    readAt: string | null;
  }[];
  /** Les jetons MCP par leur libellé et leur préfixe — jamais leur valeur. */
  mcpTokens: {
    name: string;
    prefix: string;
    lastUsedAt: string | null;
    createdAt: string;
  }[];
  /** La clé d'extraction : qu'elle existe et comment elle finit, pas sa valeur. */
  llmKey: { configured: boolean; hint: string | null };
  /** Le nombre d'appareils abonnés au push (un endpoint identifie un appareil). */
  pushDevices: number;
};

/**
 * Ce qu'il faut pour emporter ses données et pour s'en aller. Les lectures et
 * les effacements sont dans le MÊME port : ce sont les deux moitiés d'un même
 * droit, et les séparer donnerait deux endroits où se souvenir de la liste des
 * tables qui portent une trace d'un compte.
 */
export interface PrivacyRepository {
  /** L'archive du compte, dans les limites de ce qu'il peut déjà lire. */
  exportFor(userId: string): Promise<ExportArchive | null>;
  /** L'état du compte face à l'effacement (rôles, cercles, abonnement). */
  erasureSnapshot(userId: string): Promise<ErasureSnapshot | null>;
  /** Nom d'un enfant et poids du compte dans son cercle ; null hors du cercle. */
  standingOn(userId: string, childId: string): Promise<CarnetStanding | null>;
  /** Les fichiers de toutes les pages de ces carnets. */
  filesOfChildren(childIds: string[]): Promise<StoredFile[]>;
  /** Les fichiers mis en attente par ce compte et jamais rattachés (MCP). */
  stagedFilesOf(userId: string): Promise<StoredFile[]>;
  /** Efface les carnets (et, par cascade, journées, moments, pages, cercles). */
  deleteChildren(childIds: string[]): Promise<void>;
  /** Efface le compte (et, par cascade, sessions, adhésions, jetons, réglages). */
  deleteAccount(userId: string): Promise<void>;
}
