import { AnthropicCarnetReader } from "./adapters/anthropic-carnet-reader.js";
import {
  CorrectionsGlossaryStore,
  DrizzleChildDirectory,
  EncryptedApiKeyStore,
  MembershipAccessPolicy,
} from "./adapters/db-stores.js";
import {
  DrizzleAttachmentRepository,
  DrizzleChildRepository,
  DrizzleEntryRepository,
  DrizzleEntryRevisionRepository,
} from "./adapters/drizzle-entry-repository.js";
import {
  DrizzleInvitationRepository,
  DrizzleMembershipRepository,
  DrizzleUserDirectory,
  NotifyLinkDelivery,
} from "./adapters/drizzle-sharing.js";
import { DrizzleAdminRepository } from "./adapters/drizzle-admin.js";
import { DrizzlePageRepository } from "./adapters/drizzle-page-repository.js";
import { DrizzlePrivacyRepository } from "./adapters/drizzle-privacy.js";
import { FileSystemImageStore } from "./adapters/fs-image-store.js";
import { ConsoleLogger, FireAndForgetRunner } from "./adapters/runtime.js";
import { randomBytes } from "node:crypto";
import { blockedReason } from "./billing/index.js";
import { config } from "./config.js";
import { getSettings } from "./settings.js";
import {
  DrizzleDayGlance,
  DrizzleNotificationLog,
  DrizzleSubscriberDirectory,
} from "./notifications/drizzle-stores.js";
import { EmailChannel } from "./notifications/email-channel.js";
import { WebPushChannel } from "./notifications/push-channel.js";
import { SubscriberNotifier } from "./notifications/subscriber-notifier.js";
import { requireChildAdminAccess } from "./access.js";
import { LiveInstanceOps } from "./instance-ops.js";
import { DrizzleOpsQueries } from "./mcp/ops-queries.js";
import { DrizzleEntryQueries } from "./mcp/queries.js";
import { DbStagedUploads } from "./mcp/uploads.js";
import { AdminService } from "./services/admin-service.js";
import { CarnetReadingService } from "./services/carnet-reading-service.js";
import { EntryEditingService } from "./services/entry-editing-service.js";
import { IngestService } from "./services/ingest-service.js";
import { ChildrenService } from "./services/children-service.js";
import { PageService } from "./services/page-service.js";
import { PrivacyService } from "./services/privacy-service.js";
import { SharingService } from "./services/sharing-service.js";
import { TranscribedNoteService } from "./services/transcribed-note-service.js";

/* ===========================================================================
   LA RACINE DE COMPOSITION — le SEUL endroit qui sait qui est branché sur quoi.

   Ailleurs, plus personne ne choisit son fournisseur : les services reçoivent
   des ports, les adaptateurs implémentent ces ports, et c'est ici — et
   seulement ici — que les deux se rencontrent. Changer de stockage d'images, de
   moteur de lecture ou de base de données se fait en changeant une ligne de ce
   fichier, sans ouvrir un seul service.
   =========================================================================== */

const logger = new ConsoleLogger();
const background = new FireAndForgetRunner(logger);
const entries = new DrizzleEntryRepository();
const revisions = new DrizzleEntryRevisionRepository();
const attachments = new DrizzleAttachmentRepository();
const images = new FileSystemImageStore();
const access = new MembershipAccessPolicy();
const apiKeys = new EncryptedApiKeyStore();
const children = new DrizzleChildDirectory();
/**
 * Le péage, branché en UN point : les deux chemins qui créent une journée (la
 * route web et les deux outils MCP) passent par les services ci-dessous, donc
 * par cette même fonction. Il n'y a pas de troisième porte — et s'il en naissait
 * une, elle devrait demander ici aussi.
 */
const paywall = { blockedReason };
/**
 * Les canaux de notification, dans l'ordre où on les tente. UNE ligne par
 * moyen de joindre les proches : c'est ici, et nulle part ailleurs, qu'on en
 * ajoute un.
 */
export const subscriberNotifier = new SubscriberNotifier({
  subscribers: new DrizzleSubscriberDirectory(),
  log: new DrizzleNotificationLog(),
  channels: [new WebPushChannel(), new EmailChannel(new DrizzleDayGlance())],
  webBaseUrl: config.webBaseUrl,
  logger,
});

/** Lecture des carnets (modèle vision) en arrière-plan. */
export const carnetReading = new CarnetReadingService({
  entries,
  access,
  attachments,
  images,
  reader: new AnthropicCarnetReader(),
  apiKeys,
  glossary: new CorrectionsGlossaryStore(),
  background,
  logger,
});

/** Arrivée d'un carnet photographié (route web et outil MCP). */
export const ingestService = new IngestService({
  entries,
  attachments,
  images,
  apiKeys,
  access,
  paywall,
  reading: carnetReading,
});

/** Création d'un enfant et de son cercle. */
export const childrenService = new ChildrenService(new DrizzleChildRepository());

/** Relecture humaine : champs, moments, publication, lectures tranchées. */
export const entryEditing = new EntryEditingService({
  entries,
  revisions,
  access,
  children,
  notifier: subscriberNotifier,
  background,
  images,
  logger,
});

/** Les pages photographiées : les servir, les tourner, les retirer. */
export const pages = new PageService({
  pages: new DrizzlePageRepository(),
  images,
  access,
  logger,
});

/**
 * Emporter ses données, effacer un carnet, s'en aller. Branché sur le MÊME
 * stockage d'images que l'ingestion : ce qui a été écrit par `images.store`
 * doit pouvoir être effacé par `images.delete`, et deux stockages différents
 * aux deux bouts, c'est la garantie qu'un jour l'effacement ne trouvera rien.
 */
export const privacy = new PrivacyService({
  privacy: new DrizzlePrivacyRepository(),
  images,
  logger,
});

/** Création d'une journée déjà transcrite (outil MCP). */
export const transcribedNotes = new TranscribedNoteService({
  entries,
  access,
  children,
  paywall,
  notifier: subscriberNotifier,
  background,
});

/**
 * La console d'administration : les carnets qu'on administre, les gens qui y
 * tiennent un rôle, les invitations en attente. Lecture seule — les gestes
 * restent ceux du partage, ci-dessous.
 */
export const adminConsole = new AdminService(new DrizzleAdminRepository());

/** Le cercle d'un enfant : invitations, rôles, dernier administrateur. */
export const sharing = new SharingService({
  memberships: new DrizzleMembershipRepository(),
  invitations: new DrizzleInvitationRepository(),
  users: new DrizzleUserDirectory(),
  delivery: new NotifyLinkDelivery(),
  invitationTtlDays: async () => (await getSettings()).invitationTtlDays,
  inviteUrl: (token) => `${config.webBaseUrl}/invite/${token}`,
  newToken: () => randomBytes(24).toString("base64url"),
  now: () => new Date(),
});

/**
 * Ce qu'un outil MCP reçoit, en plus de l'utilisateur de son jeton : les mêmes
 * services que les routes web (une seule règle métier, deux protocoles) et les
 * lectures dont ses outils ont besoin.
 *
 * Les champs suivants sont ceux de l'EXPLOITATION — ce qui permet à un agent de
 * tenir l'instance en production : la console d'administration, la publication
 * d'un brouillon, la relance d'une lecture morte, les réglages à chaud,
 * l'inventaire de ce qui coince — et ceux du CERCLE : inviter un proche,
 * changer son rôle, le retirer. Aucun n'est un service neuf : ce sont,
 * littéralement, ceux des écrans Administration, Réglages et Partager.
 */
export const mcpTooling = {
  ingest: ingestService,
  notes: transcribedNotes,
  queries: new DrizzleEntryQueries(),
  uploads: new DbStagedUploads(),
  admin: adminConsole,
  editing: entryEditing,
  reading: carnetReading,
  instance: new LiveInstanceOps(),
  ops: new DrizzleOpsQueries(),
  sharing,
  circleAccess: { requireAdmin: requireChildAdminAccess },
};
